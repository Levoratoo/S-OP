/**
 * Passo 1 — gera as 3 bases de entrada do script Python a partir do faturamento/cadastros.
 * Espelha as querys do “1 - Estatística IA” / Power Query:
 * Faturamento (SAIDA + DEVOLUCAO, Qtd. com sinal) × De-Para × Cadastro SKU
 * × Skus Projetar × Marca ativa × Tipo Item ≠ Outros.
 * Espelha o Power Query (não filtra Tipo de Fatur.; soma Qtd. como no SharePoint).
 *
 * Layout Excel:
 * - Vendas: Planilha1 / Codificação (= sku_marca) + jan-20… (zeros preenchidos)
 * - Clientes: Base de Dados / Código (= sku_marca) + Cod. Cliente + meses
 * - Previsto: Previsto / Codificação (= sku_marca) + meses (previsoes / ciclo / seed SKU)
 * Granularidade oficial (comercial): SKU da aba Skus Projetar — não TML.
 */
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb } from "../db";
import {
  cicloComercialItens,
  ciclosComerciais,
  faturamento,
  marcas,
  produtos,
  previsoes,
} from "../../drizzle/schema";
import { loadDeParaMap, resolveCodigoAtual } from "./de-para-map";

/** Erro de pré-condição do ETL (cliente deve corrigir dados — mapear para 4xx no tRPC). */
export class PrevisaoEtlUserError extends Error {
  readonly code = "PRECONDITION_FAILED" as const;
  constructor(message: string) {
    super(message);
    this.name = "PrevisaoEtlUserError";
  }
}

const MES_LABELS = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
] as const;

const MES_KEYS = ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9", "m10", "m11", "m12"] as const;

function mesCol(ano: number, mes: number) {
  return `${MES_LABELS[mes - 1]}-${String(ano).slice(-2)}`;
}

function monthColToIsoStart(value: string) {
  const [label, shortYear] = value.split("-");
  const month = MES_LABELS.indexOf(label as (typeof MES_LABELS)[number]) + 1;
  const year = 2000 + Number(shortYear);
  if (!month || !Number.isFinite(year)) return null;
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

/** Calendário contínuo inclusivo [inicio, fim]. */
function buildMonthRange(dataInicio: string, dataFim: string): string[] {
  const [yi, mi] = dataInicio.slice(0, 10).split("-").map(Number);
  const [yf, mf] = dataFim.slice(0, 10).split("-").map(Number);
  if (!yi || !mi || !yf || !mf) return [];
  const out: string[] = [];
  let y = yi;
  let m = mi;
  while (y < yf || (y === yf && m <= mf)) {
    out.push(mesCol(y, m));
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/** Legado TML (tipo–marca–linha). Mantido só para detecção de baselines antigos. */
function buildCodificacaoTml(
  tipoEstoque: string | null | undefined,
  marca: string | null | undefined,
  linha: string | null | undefined
) {
  const tp = (tipoEstoque || "MTS").trim().toUpperCase() || "MTS";
  const m = (marca || "SEM-MARCA").trim() || "SEM-MARCA";
  const l = (linha || "SEM-LINHA").trim() || "SEM-LINHA";
  return `${tp}-${m}-${l}`;
}

/**
 * Chave oficial da previsão estatística (Skus Projetar / Excel comercial):
 * `sku_marca` = `{codItem}-{marca}` (ex.: 80.06.001505-Fórmula Animal).
 */
export function buildSkuCodificacao(
  sku: string | null | undefined,
  marca: string | null | undefined
) {
  const code = (sku || "").trim();
  const m = (marca || "SEM-MARCA").trim() || "SEM-MARCA";
  if (!code) return `SEM-SKU-${m}`;
  // Evita duplicar marca se o código já veio no formato sku_marca.
  if (code.includes("-") && code.toLowerCase().endsWith(`-${m.toLowerCase()}`)) {
    return code;
  }
  return `${code}-${m}`;
}

/**
 * Índice oficial da aba Skus Projetar: código do item → `sku_marca`.
 * A marca do cadastro pode ser mais curta (Adidas, Calvin Klein) do que a
 * marca da projeção (Adidas OCS Colect, Calvin Klein Jeans).
 */
export function loadSkuMarcaOficial(dir = resolveDadosSistemaDir()): Map<string, string> {
  const file = path.join(dir, "estatistica_skus_projetar.csv");
  const map = new Map<string, string>();
  if (!fs.existsSync(file)) return map;
  const rows = parseCsvSimple(fs.readFileSync(file, "utf8"));
  if (rows.length < 2) return map;
  const headers = rows[0].map(h => h.trim().toLowerCase());
  const col = (name: string) => headers.indexOf(name);
  const iSku = col("sku_marca");
  if (iSku < 0) return map;
  const codeCols = [col("cod_item"), col("sku_ajustado"), col("sku_novo")].filter(i => i >= 0);
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const skuMarca = (row[iSku] || "").trim();
    if (!skuMarca) continue;
    map.set(skuMarca.toUpperCase(), skuMarca);
    for (const c of codeCols) {
      const code = (row[c] || "").trim().toUpperCase();
      if (code) map.set(code, skuMarca);
    }
  }
  return map;
}

/** Chave da previsão: `sku_marca` do Skus Projetar, com fallback no cadastro. */
export function resolveSkuCodificacao(
  sku: string | null | undefined,
  marca: string | null | undefined,
  oficial: ReadonlyMap<string, string>
) {
  const code = (sku || "").trim();
  if (code) {
    const direct = oficial.get(code.toUpperCase());
    if (direct) return direct;
    const prefix = code.match(/^([\d.]+)-/)?.[1];
    if (prefix) {
      const byItem = oficial.get(prefix.toUpperCase());
      if (byItem) return byItem;
    }
  }
  return buildSkuCodificacao(code, marca);
}

export function isTmlCodificacao(codigo: string | null | undefined) {
  return /^(MTS|MTO|ENG)-/i.test(String(codigo || "").trim());
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const n = Number(String(value ?? "0").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function workbookToBase64(wb: XLSX.WorkBook) {
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return buf.toString("base64");
}

/** Garante headers de mês como texto (jan-20), sem conversão automática do Excel. */
function sheetFromRows(headers: string[], rows: Array<Array<string | number>>) {
  const aoa: Array<Array<string | number>> = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // Força colunas de mês como texto no header
  for (let c = 0; c < headers.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    const cell = ws[addr];
    if (cell) {
      cell.t = "s";
      cell.v = headers[c];
      cell.w = headers[c];
    }
  }
  return ws;
}

function normalizeKey(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

/** Excel: Tipo Item <> "Outros". */
function isTipoOutros(
  tipoEstoque: string | null | undefined,
  tipoNegocio?: string | null,
  linha?: string | null
) {
  const parts = [tipoEstoque, tipoNegocio, linha].map(v => (v || "").trim().toUpperCase());
  return parts.some(v => v === "OUTROS" || v === "OUTRO" || v === "SERVIÇO" || v === "SERVICO");
}

/** Parse date without UTC day-shift (YYYY-MM-DD or Date). */
function emissionYearMonth(value: unknown): { year: number; month: number } | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1 };
  }
  const s = String(value ?? "").trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return { year: Number(m[1]), month: Number(m[2]) };
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

function normalizeCodCliente(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "SEM-CLIENTE";
  // Evita "8948.0"; mantém CNPJ/texto com pontuação
  if (/^\d+(\.0+)?$/.test(raw)) return String(Math.trunc(Number(raw)));
  return raw;
}

export type PrevisaoEtlResult = {
  vendasBase64: string;
  previstoBase64: string | null;
  clientesBase64: string | null;
  stats: {
    gruposVendas: number;
    mesesHistorico: number;
    gruposPrevisto: number;
    linhasClientes: number;
    marcasInativasExcluidas: number;
    linhasOutrosExcluidas: number;
    linhasSemSkuProjetar: number;
    previstoOrigem: "seed_previsto" | "seed_sku" | "seed_tml_rateado" | "previsoes" | "ciclo_anterior" | "nenhum";
    previstoCompetenciaUsada: string | null;
    previstoAtrasado: boolean;
    granularidade: "SKU";
  };
};

function resolveDadosSistemaDir(): string {
  const candidates = [
    process.env.SEED_CADASTROS_DIR,
    path.resolve(process.cwd(), "dados-sistema"),
    path.resolve(process.cwd(), "..", "dados sistema"),
  ].filter(Boolean) as string[];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return candidates[0] ?? path.resolve(process.cwd(), "dados-sistema");
}

function resolveBaselinePath(filename: string): string | null {
  const candidates = [
    path.join(resolveDadosSistemaDir(), filename),
    path.resolve(
      process.cwd(),
      "..",
      "OneDrive_2026-07-30",
      "1-Módulo Previsão Demanda",
      "1.1 arquivos",
      filename
    ),
  ];
  return candidates.find(candidate => fs.existsSync(candidate)) ?? null;
}

function loadHistoricalBaseline(filename: string, keyColumns: number) {
  const filePath = resolveBaselinePath(filename);
  if (!filePath) return null;
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json<Array<string | number | null>>(sheet, {
    header: 1,
    raw: true,
    defval: null,
  });
  if (matrix.length < 2) return null;
  const headers = matrix[0].map(value => String(value ?? "").trim());
  return {
    months: headers.slice(keyColumns),
    rows: matrix.slice(1),
  };
}

function parseCsvSimple(text: string): string[][] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(l => l.trim());
  const rows: string[][] = [];
  for (const line of lines) {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (ch === "," && !inQuotes) {
        out.push(cur);
        cur = "";
        continue;
      }
      cur += ch;
    }
    out.push(cur);
    rows.push(out);
  }
  return rows;
}

function parseMesColLabel(label: string): { ano: number; mes: number } | null {
  const m = String(label || "")
    .trim()
    .toLowerCase()
    .match(/^([a-z]{3})-(\d{2})$/);
  if (!m) return null;
  const mi = MES_LABELS.indexOf(m[1] as (typeof MES_LABELS)[number]);
  if (mi < 0) return null;
  return { ano: 2000 + Number(m[2]), mes: mi + 1 };
}

/** Histórico Previsto (Projeção Itens) em dados-sistema/estatistica_previsto.csv. */
function buildPrevistoFromSeedFile(
  requiredMonth?: string
): { base64: string; grupos: number } | null {
  const seedPath = path.join(resolveDadosSistemaDir(), "estatistica_previsto.csv");
  if (!fs.existsSync(seedPath)) return null;
  const rows = parseCsvSimple(fs.readFileSync(seedPath, "utf8"));
  if (rows.length < 2) return null;
  const headers = rows[0].map(h => h.trim());
  if (!headers[0] || !/codifica/i.test(headers[0])) return null;
  // Seed TML antigo não serve para previsão por SKU.
  const firstCode = String(rows[1]?.[0] ?? "").trim();
  if (isTmlCodificacao(firstCode)) return null;
  const monthHeaders = headers.slice(1).filter(h => parseMesColLabel(h));
  if (monthHeaders.length === 0) return null;
  if (requiredMonth && !monthHeaders.includes(requiredMonth)) return null;

  const sheetRows: Array<Array<string | number>> = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const cod = (row[0] || "").trim();
    if (!cod) continue;
    const values: Array<string | number> = [cod];
    for (let c = 1; c < headers.length; c++) {
      if (!parseMesColLabel(headers[c])) continue;
      const raw = String(row[c] ?? "").trim();
      if (!raw || raw === "-" || /^[-–—\s]+$/.test(raw)) {
        values.push("");
      } else {
        values.push(Math.round(toNumber(raw) * 10000) / 10000);
      }
    }
    sheetRows.push(values);
  }
  if (sheetRows.length === 0) return null;

  const wbPrev = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wbPrev,
    sheetFromRows(["Codificação", ...monthHeaders], sheetRows),
    "Previsto"
  );
  return { base64: workbookToBase64(wbPrev), grupos: sheetRows.length };
}

/**
 * Seed histórico ainda está em TML. Rateia para cada sku_marca pelo volume 12M
 * dentro do grupo, para alimentar a acuracidade até haver previsto nativo por SKU.
 */
function buildPrevistoSkuFromTmlSeedRateado(
  requiredMonth: string | undefined,
  skuCodigos: string[],
  skuToTml: Map<string, string>,
  volume12m: Map<string, number>
): { base64: string; grupos: number } | null {
  const seedPath = path.join(resolveDadosSistemaDir(), "estatistica_previsto.csv");
  if (!fs.existsSync(seedPath) || skuCodigos.length === 0) return null;
  const rows = parseCsvSimple(fs.readFileSync(seedPath, "utf8"));
  if (rows.length < 2) return null;
  const headers = rows[0].map(h => h.trim());
  if (!headers[0] || !/codifica/i.test(headers[0])) return null;
  const monthHeaders = headers.slice(1).filter(h => parseMesColLabel(h));
  if (monthHeaders.length === 0) return null;
  if (requiredMonth && !monthHeaders.includes(requiredMonth)) return null;

  const tmlValues = new Map<string, number[]>();
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const cod = (row[0] || "").trim();
    if (!cod || !isTmlCodificacao(cod)) continue;
    const vals: number[] = [];
    for (let c = 1; c < headers.length; c++) {
      if (!parseMesColLabel(headers[c])) continue;
      vals.push(toNumber(row[c]));
    }
    tmlValues.set(cod, vals);
  }
  if (tmlValues.size === 0) return null;

  const skusPorTml = new Map<string, string[]>();
  for (const skuCod of skuCodigos) {
    const tml = skuToTml.get(skuCod);
    if (!tml || !tmlValues.has(tml)) continue;
    const list = skusPorTml.get(tml) ?? [];
    list.push(skuCod);
    skusPorTml.set(tml, list);
  }
  if (skusPorTml.size === 0) return null;

  const sheetRows: Array<Array<string | number>> = [];
  for (const [tml, skus] of Array.from(skusPorTml.entries())) {
    const base = tmlValues.get(tml)!;
    const pesos = skus.map(s => Math.max(0, volume12m.get(s) || 0));
    let soma = pesos.reduce((a, b) => a + b, 0);
    if (soma <= 0) {
      pesos.fill(1);
      soma = pesos.length;
    }
    skus.forEach((skuCod, idx) => {
      const share = pesos[idx] / soma;
      const values: Array<string | number> = [skuCod];
      for (const v of base) {
        const q = v * share;
        values.push(q === 0 ? "" : Math.round(q * 10000) / 10000);
      }
      sheetRows.push(values);
    });
  }
  const jaEmitidos = new Set(sheetRows.map(row => String(row[0])));
  for (const skuCod of skuCodigos) {
    if (jaEmitidos.has(skuCod)) continue;
    sheetRows.push([skuCod, ...monthHeaders.map(() => "")]);
  }
  if (sheetRows.length === 0) return null;
  sheetRows.sort((a, b) => String(a[0]).localeCompare(String(b[0]), "pt-BR"));

  const wbPrev = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wbPrev,
    sheetFromRows(["Codificação", ...monthHeaders], sheetRows),
    "Previsto"
  );
  return { base64: workbookToBase64(wbPrev), grupos: sheetRows.length };
}

/** Último dia do mês fechado (exclui mês vigente — regra do guia técnico). */
export function defaultDataFimMesFechado(now = new Date()): string {
  const lastClosed = new Date(now.getFullYear(), now.getMonth(), 0);
  const y = lastClosed.getFullYear();
  const m = String(lastClosed.getMonth() + 1).padStart(2, "0");
  const d = String(lastClosed.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function loadMarcasInativas(): Promise<Set<string>> {
  const db = await getDb();
  if (!db) return new Set();
  const rows = await db
    .select({ nome: marcas.nome })
    .from(marcas)
    .where(eq(marcas.ativo, false));
  return new Set(rows.map(r => normalizeKey(r.nome)).filter(Boolean));
}

/**
 * Projeção Itens do Excel: previsto do ciclo comercial (Demanda Restrita).
 * Aceita o ciclo mais recente com itens MTS/JITO (não só CONSOLIDADO/FECHADO).
 */
async function buildPrevistoFromLastCiclo(requiredMonth?: string): Promise<{
  base64: string | null;
  grupos: number;
}> {
  const db = await getDb();
  if (!db) return { base64: null, grupos: 0 };

  const ciclos = await db
    .select()
    .from(ciclosComerciais)
    .orderBy(desc(ciclosComerciais.id))
    .limit(20);

  let ciclo = null as (typeof ciclos)[number] | null;
  for (const c of ciclos) {
    const itens = await db
      .select({ id: cicloComercialItens.id })
      .from(cicloComercialItens)
      .where(
        and(
          eq(cicloComercialItens.cicloId, c.id),
          inArray(cicloComercialItens.planoColab, ["MTS", "JITO"])
        )
      )
      .limit(1);
    if (itens.length > 0) {
      ciclo = c;
      break;
    }
  }

  if (!ciclo) return { base64: null, grupos: 0 };

  const itens = await db
    .select()
    .from(cicloComercialItens)
    .where(
      and(
        eq(cicloComercialItens.cicloId, ciclo.id),
        inArray(cicloComercialItens.planoColab, ["MTS", "JITO"])
      )
    );

  if (itens.length === 0) return { base64: null, grupos: 0 };

  type MonthKey = string;
  const prevAgg = new Map<string, Map<MonthKey, number>>();
  const monthSet = new Set<MonthKey>();

  const oficial = loadSkuMarcaOficial();
  for (const item of itens) {
    const codificacao = resolveSkuCodificacao(item.sku, item.marca, oficial);
    if (!prevAgg.has(codificacao)) prevAgg.set(codificacao, new Map());
    const map = prevAgg.get(codificacao)!;

    for (let i = 0; i < 12; i++) {
      const key = MES_KEYS[i];
      const q = toNumber(item[key]);
      let mes = ciclo.mesInicio + i;
      let ano = ciclo.anoInicio;
      while (mes > 12) {
        mes -= 12;
        ano += 1;
      }
      const col = mesCol(ano, mes);
      monthSet.add(col);
      map.set(col, (map.get(col) || 0) + q);
    }
  }

  const months = Array.from(monthSet).sort((a, b) => {
    const parse = (s: string) => {
      const [m, y] = s.split("-");
      const mi = MES_LABELS.indexOf(m as (typeof MES_LABELS)[number]);
      return (2000 + Number(y)) * 12 + mi;
    };
    return parse(a) - parse(b);
  });

  if (months.length === 0) return { base64: null, grupos: 0 };
  if (requiredMonth && !months.includes(requiredMonth)) {
    return { base64: null, grupos: 0 };
  }

  const sheetRows = Array.from(prevAgg.entries())
    .sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
    .map(([codificacao, mapa]) => {
      const values: Array<string | number> = [codificacao];
      for (const m of months) values.push(Math.round((mapa.get(m) || 0) * 10000) / 10000);
      return values;
    });

  const wbPrev = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wbPrev,
    sheetFromRows(["Codificação", ...months], sheetRows),
    "Previsto"
  );
  return { base64: workbookToBase64(wbPrev), grupos: sheetRows.length };
}

/**
 * Gera bases no layout esperado pelo script:
 * - Vendas: Planilha1 / Codificação + colunas mensais
 * - Previsto: Previsto / Codificação + colunas mensais (tabela previsoes ou ciclo)
 * - Clientes: Base de Dados / Código + Cod. Cliente + mensais
 */
export async function gerarBasesPrevisaoPython(options?: {
  dataInicio?: string;
  dataFim?: string;
}): Promise<PrevisaoEtlResult> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const dataInicio = options?.dataInicio || "2020-01-01";
  const dataFim = options?.dataFim || defaultDataFimMesFechado();
  const months = buildMonthRange(dataInicio, dataFim);
  if (months.length === 0) {
    throw new PrevisaoEtlUserError(`Intervalo de meses inválido: ${dataInicio} → ${dataFim}`);
  }

  const vendasBaselineRaw = loadHistoricalBaseline("1-BasedeDadosVendas.xlsx", 1);
  const clientesBaselineRaw = loadHistoricalBaseline("1-BasedeDadosClientes.xlsx", 2);
  // Baseline homologado antigo está em TML; com granularidade SKU usamos o ERP inteiro.
  const vendasBaseline =
    vendasBaselineRaw &&
    vendasBaselineRaw.rows.some(row => !isTmlCodificacao(String(row[0] ?? "")))
      ? vendasBaselineRaw
      : null;
  const clientesBaseline =
    clientesBaselineRaw &&
    clientesBaselineRaw.rows.some(row => !isTmlCodificacao(String(row[0] ?? "")))
      ? clientesBaselineRaw
      : null;
  const baselineCoveredMonths = new Set<string>(
    (vendasBaseline?.months ?? []).filter(month => months.includes(month))
  );
  const firstDatabaseMonth = months.find(month => !baselineCoveredMonths.has(month));
  // Evita ler 1M+ linhas já cobertas pelo baseline homologado.
  const databaseDataInicio =
    (firstDatabaseMonth && monthColToIsoStart(firstDatabaseMonth)) ||
    new Date(new Date(`${dataFim}T00:00:00`).getTime() + 86_400_000).toISOString().slice(0, 10);

  // Excel/Power Query não filtra Tipo de Fatur. — soma Qtd. (devoluções entram com sinal).
  const conditions = [
    gte(faturamento.dataEmissao, new Date(databaseDataInicio)),
    lte(faturamento.dataEmissao, new Date(`${dataFim}T23:59:59`)),
  ];

  const rowsRaw = await db
    .select({
      dataEmissao: faturamento.dataEmissao,
      nfNumero: faturamento.nfNumero,
      codMaterial: faturamento.codMaterial,
      codCliente: faturamento.codCliente,
      cnpj: faturamento.cnpj,
      marca: faturamento.marca,
      linhaProduto: faturamento.linhaProduto,
      tipoEstoque: faturamento.tipoEstoque,
      tipoNegocio: faturamento.tipoNegocio,
      qtd: faturamento.qtd,
      valorTotal: faturamento.valorTotal,
      cfop: faturamento.cfop,
      tipoFaturamento: faturamento.tipoFaturamento,
    })
    .from(faturamento)
    .where(and(...conditions));

  // Reimports geram NFs idênticas repetidas; Excel Power Query lia a base limpa.
  const seenFat = new Set<string>();
  const rows: typeof rowsRaw = [];
  for (const row of rowsRaw) {
    const key = [
      row.nfNumero ?? "",
      row.dataEmissao instanceof Date
        ? row.dataEmissao.toISOString().slice(0, 10)
        : String(row.dataEmissao ?? "").slice(0, 10),
      row.codMaterial ?? "",
      row.codCliente ?? "",
      row.cnpj ?? "",
      String(row.qtd ?? ""),
      String(row.valorTotal ?? ""),
      row.cfop ?? "",
      row.tipoFaturamento ?? "",
    ].join("\u0001");
    if (seenFat.has(key)) continue;
    seenFat.add(key);
    rows.push(row);
  }

  if (rows.length === 0 && baselineCoveredMonths.size === 0) {
    throw new PrevisaoEtlUserError(
      "Nenhum faturamento encontrado. Importe faturamento em /vendas/importar antes de gerar as bases."
    );
  }

  const produtosRows = await db
    .select({
      codItem: produtos.codItem,
      codigo: produtos.codigo,
      marca: produtos.marca,
      linha: produtos.linha,
      tipoEstoque: produtos.tipoEstoque,
      tipoNegocio: produtos.tipoNegocio,
      status: produtos.status,
      projetarEstatistica: produtos.projetarEstatistica,
    })
    .from(produtos);

  const produtoByCodigo = new Map<string, (typeof produtosRows)[number]>();
  for (const p of produtosRows) {
    if (p.codItem) produtoByCodigo.set(p.codItem.trim().toUpperCase(), p);
    if (p.codigo) produtoByCodigo.set(p.codigo.trim().toUpperCase(), p);
  }
  const skuMarcaOficial = loadSkuMarcaOficial();

  const marcasInativas = await loadMarcasInativas();
  const deParaMap = await loadDeParaMap();

  type MonthKey = string;
  const vendasAgg = new Map<string, Map<MonthKey, number>>();
  const clientesAgg = new Map<string, Map<MonthKey, number>>();
  const monthsWithData = new Set<MonthKey>();

  // O ERP atual não reproduz os filtros aplicados antes dos arquivos SharePoint
  // (ex.: CFOPs de depósito/serviço). Preserva o histórico homologado e usa o
  // banco automaticamente apenas para competências posteriores ao baseline.
  if (vendasBaseline) {
    for (const row of vendasBaseline.rows) {
      const codificacao = String(row[0] ?? "").trim();
      if (!codificacao) continue;
      const values = new Map<MonthKey, number>();
      vendasBaseline.months.forEach((month, index) => {
        if (!baselineCoveredMonths.has(month)) return;
        values.set(month, toNumber(row[index + 1]));
      });
      vendasAgg.set(codificacao, values);
    }
  }

  if (clientesBaseline) {
    const duplicateCounts = new Map<string, number>();
    for (const row of clientesBaseline.rows) {
      const codificacao = String(row[0] ?? "").trim();
      const cliente = normalizeCodCliente(String(row[1] ?? ""));
      if (!codificacao) continue;
      const baseKey = `${codificacao}||${cliente}`;
      const duplicateIndex = duplicateCounts.get(baseKey) ?? 0;
      duplicateCounts.set(baseKey, duplicateIndex + 1);
      // O arquivo homologado possui linhas distintas com Código+Cliente repetido.
      // O sufixo interno preserva cada linha; ele não é exportado.
      const storageKey =
        duplicateIndex === 0 ? baseKey : `${baseKey}||#baseline-${duplicateIndex + 1}`;
      const values = new Map<MonthKey, number>();
      clientesBaseline.months.forEach((month, index) => {
        if (!baselineCoveredMonths.has(month)) return;
        values.set(month, toNumber(row[index + 2]));
      });
      clientesAgg.set(storageKey, values);
    }
  }

  for (const month of Array.from(baselineCoveredMonths)) monthsWithData.add(month);

  let marcasInativasExcluidas = 0;
  let linhasOutrosExcluidas = 0;
  let linhasSemSkuProjetar = 0;

  for (const row of rows) {
    const skuOriginal = (row.codMaterial || "").trim();
    const skuAtual = skuOriginal ? resolveCodigoAtual(skuOriginal, deParaMap) : "";
    const prod =
      (skuAtual ? produtoByCodigo.get(skuAtual.toUpperCase()) : undefined) ||
      (skuOriginal ? produtoByCodigo.get(skuOriginal.toUpperCase()) : undefined);

    // Excel: inner join skus_projetar — só entra quem está marcado para projetar.
    // Não filtrar INATIVO: Skus Projetar inclui SKUs inativos com histórico (Power Query).
    if (!prod || prod.projetarEstatistica !== true) {
      linhasSemSkuProjetar += 1;
      continue;
    }

    // Excel: classificação vem do Relatório_Sku_Consolidado (cadastro), não da linha de NF
    const tipo = prod.tipoEstoque || row.tipoEstoque || "MTS";
    const marca = prod.marca || row.marca || "SEM-MARCA";
    const linha = prod.linha || row.linhaProduto || "SEM-LINHA";
    const tipoNegocio = prod.tipoNegocio || row.tipoNegocio;

    if (isTipoOutros(tipo, tipoNegocio, linha)) {
      linhasOutrosExcluidas += 1;
      continue;
    }

    if (marcasInativas.has(normalizeKey(marca))) {
      marcasInativasExcluidas += 1;
      continue;
    }

    const ym = emissionYearMonth(row.dataEmissao);
    if (!ym) continue;
    const col = mesCol(ym.year, ym.month);
    if (!months.includes(col)) continue;
    if (baselineCoveredMonths.has(col)) continue;
    monthsWithData.add(col);

    const skuKey = (prod.codItem || prod.codigo || skuAtual || skuOriginal).trim();
    const codificacao = resolveSkuCodificacao(skuKey, marca, skuMarcaOficial);
    // Devolução com Qtd. positiva no ERP → sinal negativo (como Qtd. líquida do Excel).
    let qtd = toNumber(row.qtd);
    if (row.tipoFaturamento === "DEVOLUCAO" && qtd > 0) qtd = -qtd;

    if (!vendasAgg.has(codificacao)) vendasAgg.set(codificacao, new Map());
    const vMap = vendasAgg.get(codificacao)!;
    vMap.set(col, (vMap.get(col) || 0) + qtd);

    const cliente = normalizeCodCliente(row.codCliente);
    const clienteKey = `${codificacao}||${cliente}`;
    if (!clientesAgg.has(clienteKey)) clientesAgg.set(clienteKey, new Map());
    const cMap = clientesAgg.get(clienteKey)!;
    cMap.set(col, (cMap.get(col) || 0) + qtd);
  }

  // Garante 1 linha por SKU de Skus Projetar (mesmo sem faturamento no período).
  for (const prod of produtosRows) {
    if (prod.projetarEstatistica !== true) continue;
    const skuKey = (prod.codItem || prod.codigo || "").trim();
    if (!skuKey) continue;
    const tipo = prod.tipoEstoque || "MTS";
    const marca = prod.marca || "SEM-MARCA";
    const linha = prod.linha || "SEM-LINHA";
    if (isTipoOutros(tipo, prod.tipoNegocio, linha)) continue;
    if (marcasInativas.has(normalizeKey(marca))) continue;
    const codificacao = resolveSkuCodificacao(skuKey, marca, skuMarcaOficial);
    if (!vendasAgg.has(codificacao)) {
      vendasAgg.set(codificacao, new Map());
    }
  }

  if (vendasAgg.size === 0) {
    throw new PrevisaoEtlUserError(
      "Nenhum SKU elegível após filtros (Skus Projetar / De-Para / Marca ativa / ≠ Outros). " +
        `Revise Cadastros → Skus Projetar (sincronize o Estatística IA). Excluídos: sem projetar=${linhasSemSkuProjetar}, Outros=${linhasOutrosExcluidas}, marca inativa=${marcasInativasExcluidas}.`
    );
  }

  const fim = new Date(dataFim);
  const expectedCol = mesCol(fim.getFullYear(), fim.getMonth() + 1);
  if (!monthsWithData.has(expectedCol)) {
    throw new PrevisaoEtlUserError(
      `Faturamento do mês fechado (${expectedCol}) não encontrado nos SKUs a projetar. Atualize em /vendas/importar até ${dataFim}.`
    );
  }

  const vendasSorted = Array.from(vendasAgg.entries()).sort(([a], [b]) =>
    a.localeCompare(b, "pt-BR")
  );
  const vendasRows = vendasSorted.map(([codificacao, mapa]) => {
    const values: Array<string | number> = [codificacao];
    for (const m of months) values.push(Math.round((mapa.get(m) || 0) * 10000) / 10000);
    return values;
  });

  const wbVendas = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wbVendas,
    sheetFromRows(["Codificação", ...months], vendasRows),
    "Planilha1"
  );

  const clientesSorted = Array.from(clientesAgg.entries()).sort(([a], [b]) =>
    a.localeCompare(b, "pt-BR")
  );
  const clientesRows = clientesSorted.map(([key, mapa]) => {
    const [codigo, cliente] = key.split("||");
    const values: Array<string | number> = [codigo, cliente];
    for (const m of months) {
      const q = mapa.get(m) || 0;
      // Excel deixa em branco quando zero; Python trata NaN/vazio como 0
      values.push(q === 0 ? "" : Math.round(q * 10000) / 10000);
    }
    return values;
  });
  if (clientesRows.length === 0) {
    throw new PrevisaoEtlUserError(
      "Base de clientes vazia. Atualize Fat CNPJ/Cod. Cliente antes de gerar a previsão."
    );
  }

  const wbClientes = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wbClientes,
    sheetFromRows(["Código", "Cod. Cliente", ...months], clientesRows),
    "Base de Dados"
  );

  let previstoBase64: string | null = null;
  let gruposPrevisto = 0;
  let previstoOrigem: PrevisaoEtlResult["stats"]["previstoOrigem"] = "nenhum";
  let previstoCompetenciaUsada: string | null = null;
  let previstoAtrasado = false;

  const prevRowsDb = await db.select().from(previsoes);
  if (prevRowsDb.length > 0) {
    const prevAgg = new Map<string, Map<MonthKey, number>>();
    const produtosAll = await db.select().from(produtos);
    const byId = new Map(produtosAll.map(p => [p.id, p]));

    for (const p of prevRowsDb) {
      const prod = p.produtoId ? byId.get(p.produtoId) : undefined;
      if (!prod || prod.projetarEstatistica !== true) continue;
      if (marcasInativas.has(normalizeKey(prod.marca))) continue;
      if (isTipoOutros(prod.tipoEstoque, prod.tipoNegocio, prod.linha)) continue;
      const skuKey = (prod.codItem || prod.codigo || "").trim();
      if (!skuKey) continue;
      const codificacao = resolveSkuCodificacao(skuKey, prod.marca, skuMarcaOficial);
      const col = mesCol(p.ano, p.mes);
      if (!prevAgg.has(codificacao)) prevAgg.set(codificacao, new Map());
      const map = prevAgg.get(codificacao)!;
      map.set(col, (map.get(col) || 0) + toNumber(p.valorPrevisto));
    }

    const prevMonths = Array.from(
      new Set(Array.from(prevAgg.values()).flatMap(m => Array.from(m.keys())))
    ).sort((a, b) => {
      const parse = (s: string) => {
        const [m, y] = s.split("-");
        const mi = MES_LABELS.indexOf(m as (typeof MES_LABELS)[number]);
        return (2000 + Number(y)) * 12 + mi;
      };
      return parse(a) - parse(b);
    });

    if (
      prevMonths.length > 0 &&
      prevAgg.size > 0 &&
      prevMonths.includes(expectedCol)
    ) {
      const sheetRows = Array.from(prevAgg.entries())
        .sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
        .map(([codificacao, mapa]) => {
          const values: Array<string | number> = [codificacao];
          for (const m of prevMonths) {
            values.push(Math.round((mapa.get(m) || 0) * 10000) / 10000);
          }
          return values;
        });
      gruposPrevisto = sheetRows.length;
      const wbPrev = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        wbPrev,
        sheetFromRows(["Codificação", ...prevMonths], sheetRows),
        "Previsto"
      );
      previstoBase64 = workbookToBase64(wbPrev);
      previstoOrigem = "previsoes";
      previstoCompetenciaUsada = expectedCol;
    }
  }

  if (!previstoBase64) {
    const fromCiclo = await buildPrevistoFromLastCiclo(expectedCol);
    if (fromCiclo.base64) {
      previstoBase64 = fromCiclo.base64;
      gruposPrevisto = fromCiclo.grupos;
      previstoOrigem = "ciclo_anterior";
      previstoCompetenciaUsada = expectedCol;
    }
  }

  if (!previstoBase64) {
    const fromSeed = buildPrevistoFromSeedFile(expectedCol);
    if (fromSeed) {
      previstoBase64 = fromSeed.base64;
      gruposPrevisto = fromSeed.grupos;
      previstoOrigem = "seed_previsto";
      previstoCompetenciaUsada = expectedCol;
    }
  }

  if (!previstoBase64) {
    const skuToTml = new Map<string, string>();
    const volume12m = new Map<string, number>();
    const last12 = months.slice(-12);
    for (const [skuCod, mapa] of Array.from(vendasAgg.entries())) {
      const skuMatch = skuCod.match(/^([\d.]+)-(.*)$/);
      const skuRaw = skuMatch ? skuMatch[1] : skuCod;
      const prod =
        produtoByCodigo.get(skuRaw.toUpperCase()) ||
        produtoByCodigo.get(skuCod.toUpperCase());
      if (!prod) continue;
      skuToTml.set(
        skuCod,
        buildCodificacaoTml(prod.tipoEstoque, prod.marca, prod.linha)
      );
      let vol = 0;
      for (const m of last12) vol += mapa.get(m) || 0;
      volume12m.set(skuCod, vol);
    }
    const fromTml = buildPrevistoSkuFromTmlSeedRateado(
      expectedCol,
      Array.from(vendasAgg.keys()),
      skuToTml,
      volume12m
    );
    if (fromTml) {
      previstoBase64 = fromTml.base64;
      gruposPrevisto = fromTml.grupos;
      const oficiais = new Set(skuMarcaOficial.values());
      const todasOficiais = Array.from(vendasAgg.keys()).every(cod => oficiais.has(cod));
      previstoOrigem =
        todasOficiais && fromTml.grupos === vendasAgg.size ? "seed_sku" : "seed_tml_rateado";
      previstoCompetenciaUsada = expectedCol;
      previstoAtrasado = false;
    }
  }

  // Sem previsto na competência fechada a acuracidade fica mascarada.
  if (!previstoBase64) {
    throw new PrevisaoEtlUserError(
      `Projeção Itens sem a competência fechada ${expectedCol}. ` +
        "Atualize o previsto no sistema (por SKU) ou consolide o ciclo anterior antes de gerar."
    );
  }

  return {
    vendasBase64: workbookToBase64(wbVendas),
    previstoBase64,
    clientesBase64: workbookToBase64(wbClientes),
    stats: {
      gruposVendas: vendasRows.length,
      mesesHistorico: months.length,
      gruposPrevisto,
      linhasClientes: clientesRows.length,
      marcasInativasExcluidas,
      linhasOutrosExcluidas,
      linhasSemSkuProjetar,
      previstoOrigem,
      previstoCompetenciaUsada,
      previstoAtrasado,
      granularidade: "SKU",
    },
  };
}
