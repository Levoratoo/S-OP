import fs from "node:fs";
import path from "node:path";
import * as db from "../db";

type Logger = (message: string) => void;

export interface ImportSystemCadastrosOptions {
  dirPath: string;
  dryRun?: boolean;
  only?: string[];
  logger?: Logger;
}

export interface FileImportResult {
  id: string;
  fileName: string;
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
  warnings: string[];
}

export interface ImportSystemCadastrosSummary {
  dryRun: boolean;
  dirPath: string;
  startedAt: Date;
  finishedAt: Date;
  totals: {
    inserted: number;
    updated: number;
    skipped: number;
    errors: number;
  };
  files: FileImportResult[];
  fatalErrors: string[];
}

type CsvRow = Record<string, string>;

type FileDef = {
  id: string;
  fileName: string;
  run: (context: ImportContext, filePath: string) => Promise<FileImportResult>;
};

type ImportContext = {
  dryRun: boolean;
  log: Logger;
};

const MAX_WARNINGS_PER_FILE = 40;
const DEFAULT_TIPO_DIAS = "seg-sex";

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\uFEFF/g, "")
    .trim()
    .toLowerCase();
}

function canonicalKey(value: string): string {
  return normalizeText(value).replace(/[^a-z0-9]+/g, "");
}

function normalizeCell(value: string | undefined): string {
  return (value ?? "").replace(/\uFEFF/g, "").trim();
}

function parseBool(value: string, defaultValue = true): boolean {
  const token = normalizeText(value).replace(/\s+/g, "");
  if (!token) return defaultValue;

  const truthy = new Set(["1", "true", "sim", "s", "yes", "y", "ativo", "on"]);
  const falsy = new Set([
    "0",
    "false",
    "nao",
    "na",
    "n",
    "no",
    "inativo",
    "off",
  ]);

  if (truthy.has(token)) return true;
  if (falsy.has(token)) return false;
  return defaultValue;
}

function parseInteger(value: string): number | null {
  const token = normalizeCell(value);
  if (!token) return null;
  const numeric = Number.parseInt(token, 10);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseDecimal(value: string): number | null {
  const token = normalizeCell(value);
  if (!token) return null;
  const normalized = token.replace(/\./g, "").replace(",", ".");
  const numeric = Number.parseFloat(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

function pushWarning(stats: FileImportResult, warning: string): void {
  if (stats.warnings.length < MAX_WARNINGS_PER_FILE) {
    stats.warnings.push(warning);
  }
}

function initStats(id: string, fileName: string): FileImportResult {
  return {
    id,
    fileName,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    warnings: [],
  };
}

function parseCsvSemicolon(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];

    if (inQuotes) {
      if (char === '"') {
        if (content[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ";") {
      row.push(cell);
      cell = "";
      continue;
    }

    if (char === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell.replace(/\r$/, ""));
  if (row.some((value) => value.length > 0)) {
    rows.push(row);
  }

  return rows;
}

function readCsv(filePath: string): {
  headers: string[];
  headerMap: Set<string>;
  rows: CsvRow[];
} {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = parseCsvSemicolon(raw);
  if (parsed.length === 0) {
    throw new Error(`Arquivo vazio: ${filePath}`);
  }

  const headers = parsed[0].map((header) => normalizeCell(header));
  const headerKeys = headers.map((header) => canonicalKey(header));
  const headerMap = new Set(headerKeys);
  const rows: CsvRow[] = [];

  for (let rowIndex = 1; rowIndex < parsed.length; rowIndex += 1) {
    const values = parsed[rowIndex];
    if (!values || values.every((value) => normalizeCell(value) === "")) {
      continue;
    }
    const row: CsvRow = {};
    for (let col = 0; col < headerKeys.length; col += 1) {
      const key = headerKeys[col];
      if (!key) continue;
      row[key] = normalizeCell(values[col]);
    }
    rows.push(row);
  }

  return { headers, headerMap, rows };
}

function pick(row: CsvRow, aliases: string[]): string {
  for (const alias of aliases) {
    const key = canonicalKey(alias);
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      return row[key];
    }
  }
  return "";
}

function assertHeaders(
  headerMap: Set<string>,
  fileName: string,
  requiredGroups: Array<{ label: string; aliases: string[] }>
): void {
  const missing: string[] = [];
  for (const group of requiredGroups) {
    const found = group.aliases.some((alias) => headerMap.has(canonicalKey(alias)));
    if (!found) {
      missing.push(group.label);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Arquivo ${fileName}: colunas obrigatorias ausentes (${missing.join(", ")}).`
    );
  }
}

function normalizeHour(value: string, fallback: string): string {
  const token = normalizeCell(value);
  if (!token) return fallback;

  const directMatch = token.match(/^(\d{1,2}):(\d{1,2})$/);
  if (directMatch) {
    const h = Number.parseInt(directMatch[1], 10);
    const m = Number.parseInt(directMatch[2], 10);
    if (Number.isFinite(h) && Number.isFinite(m)) {
      const hour = Math.max(0, Math.min(23, h));
      const min = Math.max(0, Math.min(59, m));
      return `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
    }
  }

  const onlyHour = token.match(/^(\d{1,2})$/);
  if (onlyHour) {
    const h = Number.parseInt(onlyHour[1], 10);
    const hour = Math.max(0, Math.min(23, h));
    return `${String(hour).padStart(2, "0")}:00`;
  }

  return fallback;
}

function minutesFromHour(value: string): number {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return 0;
  const hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2], 10);
  return hour * 60 + minute;
}

function formatMinutes(value: number): string {
  const safe = Math.max(0, value);
  const hour = Math.floor(safe / 60);
  const min = safe % 60;
  return `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function normalizeEnumTipo(value: string): "Intermediário" | "Acabamento" | null {
  const token = normalizeText(value);
  if (!token) return null;
  if (token.includes("acab")) return "Acabamento";
  if (token.includes("inter")) return "Intermediário";
  return null;
}

function normalizeEnumTipoExecucao(value: string): "Interno" | "Externo" | null {
  const token = normalizeText(value);
  if (!token) return null;
  if (token.startsWith("int")) return "Interno";
  if (token.startsWith("ext")) return "Externo";
  return null;
}

function normalizeEnumLinhaProducao(value: string): "Offset" | "Flexo" | "Terceiro" | null {
  const token = normalizeText(value);
  if (!token) return null;
  if (token.startsWith("off")) return "Offset";
  if (token.startsWith("fle")) return "Flexo";
  if (token.startsWith("ter")) return "Terceiro";
  return null;
}

function normalizeKeyForMap(value: string): string {
  return canonicalKey(value);
}

async function importNamedTable(
  context: ImportContext,
  filePath: string,
  id: string,
  fileName: string,
  ops: {
    list: () => Promise<Array<{ id: number; nome: string; descricao: string | null; ativo: boolean }>>;
    create: (data: { nome: string; descricao?: string; ativo: boolean }) => Promise<unknown>;
    update: (
      id: number,
      data: { nome?: string; descricao?: string | null; ativo?: boolean }
    ) => Promise<unknown>;
  }
): Promise<FileImportResult> {
  const stats = initStats(id, fileName);
  const { headerMap, rows } = readCsv(filePath);
  assertHeaders(headerMap, fileName, [{ label: "Nome", aliases: ["nome"] }]);

  const existing = await ops.list();
  const existingMap = new Map<string, (typeof existing)[number]>();
  existing.forEach((item) => {
    existingMap.set(normalizeKeyForMap(item.nome), item);
  });

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const nome = normalizeCell(pick(row, ["nome"]));
    const descricaoRaw = normalizeCell(pick(row, ["descricao", "descrição"]));
    const ativo = parseBool(pick(row, ["ativo", "status"]), true);

    if (!nome) {
      stats.errors += 1;
      pushWarning(stats, `Linha ${index + 2}: nome vazio.`);
      continue;
    }

    const existingRow = existingMap.get(normalizeKeyForMap(nome));
    if (!existingRow) {
      stats.inserted += 1;
      if (!context.dryRun) {
        await ops.create({
          nome,
          descricao: descricaoRaw || undefined,
          ativo,
        });
      }
      continue;
    }

    const shouldUpdate =
      normalizeCell(existingRow.nome) !== nome ||
      normalizeCell(existingRow.descricao ?? "") !== descricaoRaw ||
      Boolean(existingRow.ativo) !== ativo;

    if (!shouldUpdate) {
      stats.skipped += 1;
      continue;
    }

    stats.updated += 1;
    if (!context.dryRun) {
      await ops.update(existingRow.id, {
        nome,
        descricao: descricaoRaw || null,
        ativo,
      });
    }
  }

  context.log(
    `[${fileName}] inserted=${stats.inserted} updated=${stats.updated} skipped=${stats.skipped} errors=${stats.errors}`
  );
  return stats;
}

async function importStatus(
  context: ImportContext,
  filePath: string
): Promise<FileImportResult> {
  return importNamedTable(context, filePath, "status", "status.csv", {
    list: db.listStatusCadastro,
    create: db.createStatusCadastro,
    update: db.updateStatusCadastro,
  });
}

async function importTiposNegocio(
  context: ImportContext,
  filePath: string
): Promise<FileImportResult> {
  return importNamedTable(context, filePath, "tipo_negocio", "tipo_negocio.csv", {
    list: db.listTiposNegocio,
    create: db.createTipoNegocio,
    update: db.updateTipoNegocio,
  });
}

async function importTiposEstoque(
  context: ImportContext,
  filePath: string
): Promise<FileImportResult> {
  return importNamedTable(context, filePath, "tipo_estoque", "tipo_estoque.csv", {
    list: db.listTiposEstoque,
    create: db.createTipoEstoque,
    update: db.updateTipoEstoque,
  });
}

async function importLinhas(
  context: ImportContext,
  filePath: string
): Promise<FileImportResult> {
  return importNamedTable(context, filePath, "linhas", "linhas.csv", {
    list: db.listLinhas,
    create: db.createLinha,
    update: db.updateLinha,
  });
}

async function importModelos(
  context: ImportContext,
  filePath: string
): Promise<FileImportResult> {
  return importNamedTable(context, filePath, "modelos", "modelos.csv", {
    list: db.listModelos,
    create: db.createModelo,
    update: db.updateModelo,
  });
}

async function importTamanhos(
  context: ImportContext,
  filePath: string
): Promise<FileImportResult> {
  return importNamedTable(context, filePath, "tamanhos", "tamanhos.csv", {
    list: db.listTamanhos,
    create: db.createTamanho,
    update: db.updateTamanho,
  });
}

async function importTurnos(
  context: ImportContext,
  filePath: string
): Promise<FileImportResult> {
  const stats = initStats("turnos", "turnos.csv");
  const { headerMap, rows } = readCsv(filePath);
  assertHeaders(headerMap, "turnos.csv", [
    { label: "Turno/Hora", aliases: ["turno/hora", "turnohora"] },
    { label: "Horas Trabalho", aliases: ["horas trabalho", "horastrabalho"] },
  ]);

  const existing = await db.listTurnos();
  const existingMap = new Map<string, (typeof existing)[number]>();
  existing.forEach((item) => {
    existingMap.set(normalizeKeyForMap(item.turnoHora), item);
  });

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const turnoHora = normalizeCell(pick(row, ["turno/hora", "turnohora"]));
    const horasTrabalho = normalizeHour(pick(row, ["horas trabalho", "horastrabalho"]), "00:00");
    const horasRefeicao = normalizeHour(pick(row, ["horas refeição", "horas refeicao", "horasrefeicao"]), "01:00");
    const horasTrabalhadasCsv = normalizeHour(
      pick(row, ["horas trabalhadas", "horastrabalhadas"]),
      ""
    );
    const diasTrabalhados = normalizeCell(
      pick(row, ["dias trabalhados", "diastrabalhados"])
    ) || "segunda - sexta";
    const horaExtra = parseBool(pick(row, ["hora extra?", "hora extra", "horaextra"]), false);
    const ativo = parseBool(pick(row, ["ativo", "status"]), true);

    if (!turnoHora) {
      stats.errors += 1;
      pushWarning(stats, `Linha ${index + 2}: Turno/Hora vazio.`);
      continue;
    }

    const horasTrabalhadas =
      horasTrabalhadasCsv ||
      formatMinutes(Math.max(0, minutesFromHour(horasTrabalho) - minutesFromHour(horasRefeicao)));

    const existingRow = existingMap.get(normalizeKeyForMap(turnoHora));
    if (!existingRow) {
      stats.inserted += 1;
      if (!context.dryRun) {
        await db.createTurno({
          turnoHora,
          horasTrabalho,
          horasRefeicao,
          horasTrabalhadas,
          diasTrabalhados,
          horaExtra,
          ativo,
        });
      }
      continue;
    }

    const shouldUpdate =
      normalizeCell(existingRow.horasTrabalho) !== horasTrabalho ||
      normalizeCell(existingRow.horasRefeicao ?? "") !== horasRefeicao ||
      normalizeCell(existingRow.horasTrabalhadas ?? "") !== horasTrabalhadas ||
      normalizeCell(existingRow.diasTrabalhados ?? "") !== diasTrabalhados ||
      Boolean(existingRow.horaExtra) !== horaExtra ||
      Boolean(existingRow.ativo) !== ativo;

    if (!shouldUpdate) {
      stats.skipped += 1;
      continue;
    }

    stats.updated += 1;
    if (!context.dryRun) {
      await db.updateTurno(existingRow.id, {
        horasTrabalho,
        horasRefeicao,
        horasTrabalhadas,
        diasTrabalhados,
        horaExtra,
        ativo,
      });
    }
  }

  context.log(
    `[turnos.csv] inserted=${stats.inserted} updated=${stats.updated} skipped=${stats.skipped} errors=${stats.errors}`
  );
  return stats;
}

async function importRecursos(
  context: ImportContext,
  filePath: string
): Promise<FileImportResult> {
  const stats = initStats("recursos", "recursos.csv");
  const { headerMap, rows } = readCsv(filePath);
  assertHeaders(headerMap, "recursos.csv", [
    { label: "Recurso", aliases: ["recurso", "nome"] },
    { label: "Tipo", aliases: ["tipo"] },
  ]);

  const existing = await db.listRecursos();
  const existingMap = new Map<string, (typeof existing)[number]>();
  existing.forEach((item) => {
    existingMap.set(normalizeKeyForMap(item.nome), item);
  });

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const nome = normalizeCell(pick(row, ["recurso", "nome"]));
    const tipo = normalizeEnumTipo(pick(row, ["tipo"])) ?? "Intermediário";
    const tipoExecucao =
      normalizeEnumTipoExecucao(pick(row, ["tipo execução", "tipo execucao", "tipoexecucao"])) ??
      "Interno";
    const linhaProducao =
      normalizeEnumLinhaProducao(
        pick(row, ["linha produção", "linha producao", "linhaproducao"])
      ) ?? "Offset";
    const tipoAcabamento = normalizeCell(
      pick(row, ["tipo acabamento", "tipoacabamento"])
    );
    const linhaProduto = normalizeCell(pick(row, ["linha produto", "linhaproduto"]));
    const grupoTrabalho = normalizeCell(pick(row, ["grupo trabalho", "grupotrabalho"]));
    const velocidadeLiquida = parseDecimal(
      pick(row, ["velocidade liquida", "velocidade líquida", "velocidadeliquida"])
    );
    const ativo = parseBool(pick(row, ["ativo", "status"]), true);

    if (!nome) {
      stats.errors += 1;
      pushWarning(stats, `Linha ${index + 2}: Recurso vazio.`);
      continue;
    }

    const existingRow = existingMap.get(normalizeKeyForMap(nome));
    if (!existingRow) {
      stats.inserted += 1;
      if (!context.dryRun) {
        await db.createRecurso({
          nome,
          tipo,
          tipoExecucao,
          tipoAcabamento: tipoAcabamento || undefined,
          linhaProducao,
          linhaProduto: linhaProduto || undefined,
          grupoTrabalho: grupoTrabalho || undefined,
          velocidadeLiquida: velocidadeLiquida ?? undefined,
          ativo,
        });
      }
      continue;
    }

    const existingVel = existingRow.velocidadeLiquida
      ? Number.parseFloat(String(existingRow.velocidadeLiquida))
      : null;
    const velChanged =
      (velocidadeLiquida ?? null) !== null || existingVel !== null
        ? Number(velocidadeLiquida ?? 0) !== Number(existingVel ?? 0)
        : false;

    const shouldUpdate =
      String(existingRow.tipo) !== tipo ||
      String(existingRow.tipoExecucao) !== tipoExecucao ||
      normalizeCell(existingRow.tipoAcabamento ?? "") !== tipoAcabamento ||
      String(existingRow.linhaProducao ?? "") !== linhaProducao ||
      normalizeCell(existingRow.linhaProduto ?? "") !== linhaProduto ||
      normalizeCell(existingRow.grupoTrabalho ?? "") !== grupoTrabalho ||
      Boolean(existingRow.ativo) !== ativo ||
      velChanged;

    if (!shouldUpdate) {
      stats.skipped += 1;
      continue;
    }

    stats.updated += 1;
    if (!context.dryRun) {
      await db.updateRecurso(existingRow.id, {
        tipo,
        tipoExecucao,
        tipoAcabamento: tipoAcabamento || undefined,
        linhaProducao,
        linhaProduto: linhaProduto || undefined,
        grupoTrabalho: grupoTrabalho || undefined,
        velocidadeLiquida: velocidadeLiquida ?? undefined,
        ativo,
      });
    }
  }

  context.log(
    `[recursos.csv] inserted=${stats.inserted} updated=${stats.updated} skipped=${stats.skipped} errors=${stats.errors}`
  );
  return stats;
}

async function importFluxos(
  context: ImportContext,
  filePath: string
): Promise<FileImportResult> {
  const stats = initStats("fluxos", "fluxos.csv");
  const { headerMap, rows } = readCsv(filePath);
  assertHeaders(headerMap, "fluxos.csv", [{ label: "Nome", aliases: ["nome"] }]);

  const existing = await db.listFluxos();
  const existingMap = new Map<string, (typeof existing)[number]>();
  existing.forEach((item) => {
    existingMap.set(normalizeKeyForMap(item.nome), item);
  });

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const nome = normalizeCell(pick(row, ["nome"]));
    const descricao = normalizeCell(pick(row, ["descricao", "descrição"]));
    const ativo = parseBool(pick(row, ["ativo", "status"]), true);

    if (!nome) {
      stats.errors += 1;
      pushWarning(stats, `Linha ${index + 2}: nome vazio.`);
      continue;
    }

    const existingRow = existingMap.get(normalizeKeyForMap(nome));
    if (!existingRow) {
      stats.inserted += 1;
      if (!context.dryRun) {
        await db.createFluxo({ nome, descricao: descricao || undefined, ativo });
      }
      continue;
    }

    const shouldUpdate =
      normalizeCell(existingRow.descricao ?? "") !== descricao ||
      Boolean(existingRow.ativo) !== ativo;

    if (!shouldUpdate) {
      stats.skipped += 1;
      continue;
    }

    stats.updated += 1;
    if (!context.dryRun) {
      await db.updateFluxo(existingRow.id, {
        descricao: descricao || undefined,
        ativo,
      });
    }
  }

  context.log(
    `[fluxos.csv] inserted=${stats.inserted} updated=${stats.updated} skipped=${stats.skipped} errors=${stats.errors}`
  );
  return stats;
}

async function importDeParaCodigos(
  context: ImportContext,
  filePath: string
): Promise<FileImportResult> {
  const stats = initStats("depara", "de-para-codigos.csv");
  const { headerMap, rows } = readCsv(filePath);
  assertHeaders(headerMap, "de-para-codigos.csv", [
    { label: "SKU Antigo", aliases: ["sku antigo", "skuantigo"] },
    { label: "SKU Novo", aliases: ["sku novo", "skunovo"] },
  ]);

  const existing = await db.listDeParaCodigos();
  const existingMap = new Map<string, (typeof existing)[number]>();
  existing.forEach((item) => {
    const key = normalizeCell(item.skuAntigo);
    if (!existingMap.has(key)) {
      existingMap.set(key, item);
    }
  });

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const skuAntigo = normalizeCell(pick(row, ["sku antigo", "skuantigo"]));
    const skuNovo = normalizeCell(pick(row, ["sku novo", "skunovo"]));

    if (!skuAntigo || !skuNovo) {
      stats.errors += 1;
      pushWarning(stats, `Linha ${index + 2}: SKU Antigo/Novo invalidos.`);
      continue;
    }

    const existingRow = existingMap.get(skuAntigo);
    if (!existingRow) {
      stats.inserted += 1;
      if (!context.dryRun) {
        await db.createDeParaCodigo({ skuAntigo, skuNovo });
      }
      existingMap.set(skuAntigo, {
        id: -1,
        skuAntigo,
        skuNovo,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      continue;
    }

    if (normalizeCell(existingRow.skuNovo) === skuNovo) {
      stats.skipped += 1;
      continue;
    }

    stats.updated += 1;
    if (!context.dryRun && existingRow.id > 0) {
      await db.updateDeParaCodigo(existingRow.id, { skuNovo });
    }
  }

  context.log(
    `[de-para-codigos.csv] inserted=${stats.inserted} updated=${stats.updated} skipped=${stats.skipped} errors=${stats.errors}`
  );
  return stats;
}

async function importDiasUteis(
  context: ImportContext,
  filePath: string
): Promise<FileImportResult> {
  const stats = initStats("dias_uteis", "dias_uteis.csv");
  const { headerMap, rows } = readCsv(filePath);
  assertHeaders(headerMap, "dias_uteis.csv", [
    { label: "Ano", aliases: ["ano"] },
    { label: "Mes", aliases: ["mes", "mês"] },
    { label: "Dias Uteis", aliases: ["dias uteis", "dias úteis"] },
    { label: "Feriados", aliases: ["feriados"] },
  ]);

  const existing = await db.listDiasUteis();
  const signatureSet = new Set(
    existing.map((item) =>
      [
        item.ano,
        item.mes,
        normalizeCell(String(item.tipoDias ?? DEFAULT_TIPO_DIAS)),
        item.diasUteis,
        item.feriados ?? 0,
      ].join("|")
    )
  );

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const ano = parseInteger(pick(row, ["ano"]));
    const mes = parseInteger(pick(row, ["mes", "mês"]));
    const diasUteis = parseInteger(pick(row, ["dias uteis", "dias úteis"]));
    const feriados = parseInteger(pick(row, ["feriados"])) ?? 0;

    if (!ano || !mes || !diasUteis) {
      stats.errors += 1;
      pushWarning(stats, `Linha ${index + 2}: Ano/Mes/Dias Uteis invalidos.`);
      continue;
    }
    if (mes < 1 || mes > 12) {
      stats.errors += 1;
      pushWarning(stats, `Linha ${index + 2}: Mes fora do intervalo 1-12.`);
      continue;
    }

    const signature = [ano, mes, DEFAULT_TIPO_DIAS, diasUteis, feriados].join("|");
    if (signatureSet.has(signature)) {
      stats.skipped += 1;
      continue;
    }

    stats.inserted += 1;
    if (!context.dryRun) {
      await db.createDiaUtil({
        ano,
        mes,
        tipoDias: DEFAULT_TIPO_DIAS,
        diasUteis,
        feriados,
      });
    }
    signatureSet.add(signature);
  }

  context.log(
    `[dias_uteis.csv] inserted=${stats.inserted} updated=${stats.updated} skipped=${stats.skipped} errors=${stats.errors}`
  );
  return stats;
}

async function importMarcas(
  context: ImportContext,
  filePath: string
): Promise<FileImportResult> {
  const stats = initStats("marcas", "marcas.csv");
  const { headerMap, rows } = readCsv(filePath);
  assertHeaders(headerMap, "marcas.csv", [{ label: "Nome", aliases: ["nome"] }]);

  const existing = await db.listMarcas();
  const existingMap = new Map(existing.map(item => [normalizeKeyForMap(item.nome), item]));

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const nome = normalizeCell(pick(row, ["nome"]));
    const grupoMarca = normalizeCell(pick(row, ["grupo marca", "grupomarca", "grupo"])) || undefined;
    const ramoAtuacao =
      normalizeCell(pick(row, ["ramo atuacao", "ramo atuação", "ramoatuacao", "ramo"])) || undefined;
    const ativo = parseBool(pick(row, ["ativo", "status"]), true);

    if (!nome) {
      stats.errors += 1;
      pushWarning(stats, `Linha ${index + 2}: nome vazio.`);
      continue;
    }

    const existingRow = existingMap.get(normalizeKeyForMap(nome));
    if (!existingRow) {
      stats.inserted += 1;
      if (!context.dryRun) {
        await db.createMarca({ nome, grupoMarca, ramoAtuacao, ativo });
      }
      continue;
    }

    const shouldUpdate =
      normalizeCell(existingRow.grupoMarca ?? "") !== (grupoMarca ?? "") ||
      normalizeCell(existingRow.ramoAtuacao ?? "") !== (ramoAtuacao ?? "") ||
      Boolean(existingRow.ativo) !== ativo;

    if (!shouldUpdate) {
      stats.skipped += 1;
      continue;
    }

    stats.updated += 1;
    if (!context.dryRun) {
      await db.updateMarca(existingRow.id, { grupoMarca, ramoAtuacao, ativo });
    }
  }

  context.log(
    `[marcas.csv] inserted=${stats.inserted} updated=${stats.updated} skipped=${stats.skipped} errors=${stats.errors}`
  );
  return stats;
}

async function importGestores(
  context: ImportContext,
  filePath: string
): Promise<FileImportResult> {
  const stats = initStats("gestores", "gestores.csv");
  const { headerMap, rows } = readCsv(filePath);
  assertHeaders(headerMap, "gestores.csv", [{ label: "Nome", aliases: ["nome"] }]);

  const existing = await db.listGestores();
  const byEmail = new Map(
    existing
      .filter(item => item.email)
      .map(item => [normalizeKeyForMap(item.email || ""), item])
  );
  const byNome = new Map(existing.map(item => [normalizeKeyForMap(item.nome), item]));

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const nome = normalizeCell(pick(row, ["nome"]));
    const email = normalizeCell(pick(row, ["email", "e-mail"])) || undefined;
    const telefone = normalizeCell(pick(row, ["telefone", "fone", "celular"])) || undefined;
    const ativo = parseBool(pick(row, ["ativo", "status"]), true);

    if (!nome) {
      stats.errors += 1;
      pushWarning(stats, `Linha ${index + 2}: nome vazio.`);
      continue;
    }

    const existingRow =
      (email ? byEmail.get(normalizeKeyForMap(email)) : undefined) ||
      byNome.get(normalizeKeyForMap(nome));

    if (!existingRow) {
      stats.inserted += 1;
      if (!context.dryRun) {
        await db.createGestor({ nome, email, telefone, ativo });
      }
      continue;
    }

    const shouldUpdate =
      normalizeCell(existingRow.nome) !== nome ||
      normalizeCell(existingRow.email ?? "") !== (email ?? "") ||
      normalizeCell(existingRow.telefone ?? "") !== (telefone ?? "") ||
      Boolean(existingRow.ativo) !== ativo;

    if (!shouldUpdate) {
      stats.skipped += 1;
      continue;
    }

    stats.updated += 1;
    if (!context.dryRun) {
      await db.updateGestor(existingRow.id, { nome, email, telefone, ativo });
    }
  }

  context.log(
    `[gestores.csv] inserted=${stats.inserted} updated=${stats.updated} skipped=${stats.skipped} errors=${stats.errors}`
  );
  return stats;
}

const FILES_IN_ORDER: FileDef[] = [
  { id: "status", fileName: "status.csv", run: importStatus },
  { id: "tipo_negocio", fileName: "tipo_negocio.csv", run: importTiposNegocio },
  { id: "tipo_estoque", fileName: "tipo_estoque.csv", run: importTiposEstoque },
  { id: "linhas", fileName: "linhas.csv", run: importLinhas },
  { id: "modelos", fileName: "modelos.csv", run: importModelos },
  { id: "tamanhos", fileName: "tamanhos.csv", run: importTamanhos },
  { id: "marcas", fileName: "marcas.csv", run: importMarcas },
  { id: "gestores", fileName: "gestores.csv", run: importGestores },
  { id: "turnos", fileName: "turnos.csv", run: importTurnos },
  { id: "recursos", fileName: "recursos.csv", run: importRecursos },
  { id: "fluxos", fileName: "fluxos.csv", run: importFluxos },
  { id: "dias_uteis", fileName: "dias_uteis.csv", run: importDiasUteis },
  { id: "depara", fileName: "de-para-codigos.csv", run: importDeParaCodigos },
];

function resolveOnlySelection(only: string[] | undefined): FileDef[] {
  if (!only || only.length === 0) return FILES_IN_ORDER;
  const selected = new Set(
    only.map((item) => {
      const trimmed = normalizeText(item);
      if (trimmed.endsWith(".csv")) return trimmed;
      return `${trimmed}.csv`;
    })
  );

  const matches = FILES_IN_ORDER.filter(
    (file) => selected.has(normalizeText(file.fileName)) || selected.has(`${normalizeText(file.id)}.csv`)
  );
  return matches;
}

export async function importSystemCadastros(
  options: ImportSystemCadastrosOptions
): Promise<ImportSystemCadastrosSummary> {
  const dryRun = Boolean(options.dryRun);
  const dirPath = path.resolve(options.dirPath);
  const log = options.logger ?? (() => undefined);
  const startedAt = new Date();
  const fatalErrors: string[] = [];
  const files: FileImportResult[] = [];

  const dbConn = await db.getDb();
  if (!dbConn) {
    throw new Error("Database not available. Verifique DATABASE_URL e a conexao com MariaDB.");
  }

  if (!fs.existsSync(dirPath)) {
    throw new Error(`Diretorio nao encontrado: ${dirPath}`);
  }

  const selectedFiles = resolveOnlySelection(options.only);
  if (selectedFiles.length === 0) {
    throw new Error(
      `Nenhum arquivo correspondente ao filtro --only (${(options.only ?? []).join(", ")}).`
    );
  }

  log(`Iniciando importacao de cadastros (${dryRun ? "DRY-RUN" : "EXECUCAO"}) em ${dirPath}`);

  for (const file of selectedFiles) {
    const filePath = path.join(dirPath, file.fileName);
    if (!fs.existsSync(filePath)) {
      fatalErrors.push(`Arquivo nao encontrado: ${file.fileName}`);
      break;
    }

    log(`Processando ${file.fileName}...`);
    try {
      const result = await file.run({ dryRun, log }, filePath);
      files.push(result);
    } catch (error) {
      fatalErrors.push(
        `${file.fileName}: ${error instanceof Error ? error.message : String(error)}`
      );
      break;
    }
  }

  const totals = files.reduce(
    (acc, file) => {
      acc.inserted += file.inserted;
      acc.updated += file.updated;
      acc.skipped += file.skipped;
      acc.errors += file.errors;
      return acc;
    },
    { inserted: 0, updated: 0, skipped: 0, errors: 0 }
  );

  const finishedAt = new Date();
  return {
    dryRun,
    dirPath,
    startedAt,
    finishedAt,
    totals,
    files,
    fatalErrors,
  };
}
