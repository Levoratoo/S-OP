import type { InsertFaturamento } from "../../drizzle/schema";
import { isCfopFaturamentoPermitido } from "@shared/cfop-faturamento";
import { addCalendarDays, calendarToday } from "@shared/calendar-date";
import * as db from "../db";
import {
  defaultDesdeDate,
  queryErpFaturamentoRowsInRange,
  testErpConnection,
} from "./erp-mssql";

function asText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

/** Evita Data too long for column no MariaDB (histórico ERP varia). */
function clip(value: string | null | undefined, max: number): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value);
  if (!text) return null;
  return text.length > max ? text.slice(0, max) : text;
}

function asNumberString(value: unknown, fallback = "0"): string {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  const text = String(value).trim().replace(/\s/g, "").replace(",", ".");
  const num = Number(text);
  return Number.isFinite(num) ? String(num) : fallback;
}

function parseEmissao(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    // SQL Server sometimes returns OADate-like serials via drivers; prefer Date objects.
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const text = asText(value);
  if (!text) return null;

  // dd/mm/yyyy
  const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) {
    const day = Number(br[1]);
    const month = Number(br[2]);
    const year = Number(br[3]);
    const d = new Date(year, month - 1, day);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // yyyy-mm-dd...
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d;
}

function inferTipoEstoque(value: unknown): "MTS" | "MTO" | null {
  const text = asText(value).toUpperCase();
  if (text.includes("MTS")) return "MTS";
  if (text.includes("MTO")) return "MTO";
  return null;
}

function inferTipoFaturamento(row: Record<string, unknown>): "DEVOLUCAO" | "SAIDA" {
  const flag = pick(row, "DEVOLUCAO", "Devolucao");
  if (flag === true || flag === 1 || asText(flag).toUpperCase() === "S" || asText(flag) === "1") {
    return "DEVOLUCAO";
  }

  const motivo = asText(row.Motivo_Canc || row["Motivo Canc."] || row.MOTIVOCANCELNF).toUpperCase();
  if (motivo) return "DEVOLUCAO";

  const cfop4 = asText(row.CFOP).replace(/\D/g, "").slice(0, 4);
  // CFOPs de devolução comuns (entrada/saída), inclusive sufixos como 1.201.01
  if (/^(1|2)2\d{2}$/.test(cfop4) || /^(5|6)2\d{2}$/.test(cfop4)) return "DEVOLUCAO";

  const qtd = Number(asNumberString(row.Qtd));
  const total = Number(asNumberString(row.Total));
  if (qtd < 0 || total < 0) return "DEVOLUCAO";

  return "SAIDA";
}

function pick(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== "") return row[key];
  }
  return undefined;
}

export function mapErpRowToFaturamento(row: Record<string, unknown>): InsertFaturamento | null {
  const dataEmissao = parseEmissao(pick(row, "Emissao", "Emissão", "DATAEMISSAO", "dataEmissao"));
  if (!dataEmissao) return null;
  if (!isCfopFaturamentoPermitido(pick(row, "CFOP"))) return null;

  const qtd = asNumberString(pick(row, "Qtd", "Qtd.", "QUANTIDADE"));
  const valorTotal = asNumberString(pick(row, "Total", "VALORITEMLIQUIDO", "Valor Total"));

  const ufRaw = asText(pick(row, "UF", "Estado")).toUpperCase();
  const uf = ufRaw.slice(0, 2) || null;

  return {
    dataEmissao,
    nfNumero: clip(asText(pick(row, "NF", "NUMNOTA", "nfNumero")), 50),
    codCliente: clip(asText(pick(row, "Cod_Cliente", "Cod. Cliente", "codclientes")), 50),
    cnpj: clip(asText(pick(row, "CNPJ", "CGC")), 20),
    unidade: clip(asText(pick(row, "Unidade", "UnidadeAlfa")), 100),
    cidade: clip(asText(pick(row, "Cidade")), 100),
    uf: clip(uf, 2),
    marca: clip(asText(pick(row, "Marca", "usr_marca")), 100),
    codMaterial: clip(asText(pick(row, "Cod_Material", "Cod. Material", "CODMATERIAL")), 50),
    descricaoItem: clip(
      asText(pick(row, "Descricao_Item", "Descrição Item", "DescItem")),
      300
    ),
    tipoNegocio: clip(asText(pick(row, "Grupo", "usr_grupo")), 50),
    tipoEstoque: inferTipoEstoque(pick(row, "Tipo", "usr_Acabado")),
    linhaProduto: clip(asText(pick(row, "Linha_Prod", "Linha Prod.", "Descricao")), 100),
    qtd,
    valorTotal,
    gestor: clip(asText(pick(row, "Representante", "NOMEVENDEDOR", "Gestor")), 200),
    cfop: clip(asText(pick(row, "CFOP")), 10),
    descCfop: clip(asText(pick(row, "Desc_CFOP", "Desc. CFOP", "DESCCFOP")), 200),
    tipoFaturamento: inferTipoFaturamento(row),
  };
}

export type FaturamentoSqlSyncYearResult = {
  year: number;
  fetched: number;
  mapped: number;
  skipped: number;
  inserted: number;
};

export type FaturamentoSqlSyncResult = {
  fetched: number;
  mapped: number;
  skipped: number;
  inserted: number;
  cleared: boolean;
  desde: string;
  source: string;
  years: FaturamentoSqlSyncYearResult[];
  connection: Awaited<ReturnType<typeof testErpConnection>>;
};

function yearRangeBounds(desde: string, year: number): { inicio: string; fim: string } {
  const desdeYear = Number(desde.slice(0, 4));
  const inicio = year === desdeYear ? desde : `${year}-01-01`;
  const fim = `${year + 1}-01-01`;
  return { inicio, fim };
}

/**
 * Carrega faturamento do ERP para a base local (MariaDB), ano a ano.
 * Após a carga, os dados ficam persistidos — não é necessário sincronizar a cada uso.
 * Política: substitui apenas o período a partir de `desde` (preserva anos anteriores).
 */
export async function syncFaturamentoFromSql(options?: {
  clearBefore?: boolean;
}): Promise<FaturamentoSqlSyncResult> {
  const clearBefore = options?.clearBefore !== false;
  const connection = await testErpConnection();
  const desde = connection.desde || defaultDesdeDate();
  const source = connection.source;
  const startYear = Number(desde.slice(0, 4));
  const endYear = new Date().getFullYear();

  if (!Number.isFinite(startYear) || startYear > endYear) {
    throw new Error(`ERP_FATURAMENTO_DESDE inválido: ${desde}`);
  }

  if (clearBefore) {
    await db.clearFaturamentoFromDate(desde);
  }

  let fetched = 0;
  let mapped = 0;
  let skipped = 0;
  let inserted = 0;
  const years: FaturamentoSqlSyncYearResult[] = [];

  for (let year = startYear; year <= endYear; year++) {
    const { inicio, fim } = yearRangeBounds(desde, year);
    const { rows } = await queryErpFaturamentoRowsInRange(inicio, fim);

    const batch: InsertFaturamento[] = [];
    let yearSkipped = 0;
    for (const row of rows) {
      const item = mapErpRowToFaturamento(row);
      if (!item) {
        yearSkipped += 1;
        continue;
      }
      batch.push(item);
    }

    const insertResult = batch.length > 0 ? await db.createFaturamentoBatch(batch) : { count: 0 };

    years.push({
      year,
      fetched: rows.length,
      mapped: batch.length,
      skipped: yearSkipped,
      inserted: insertResult.count,
    });

    fetched += rows.length;
    mapped += batch.length;
    skipped += yearSkipped;
    inserted += insertResult.count;
  }

  await db.rebuildFaturamentoResumo();
  try {
    const { runAfterFaturamentoSync } = await import("./faturamento-post-sync");
    await runAfterFaturamentoSync();
  } catch (err) {
    console.warn("[faturamento] pós-sync:", err);
  }
  return {
    fetched,
    mapped,
    skipped,
    inserted,
    cleared: clearBefore,
    desde,
    source,
    years,
    connection,
  };
}

export type FaturamentoYearsSyncResult = {
  source: string;
  years: FaturamentoSqlSyncYearResult[];
};

/**
 * Recarrega anos específicos do ERP com o mesmo mapeamento da carga corrente
 * (CFOP, data de calendário). Só apaga o ano depois que o ERP devolveu notas.
 */
export async function syncFaturamentoYears(years: number[]): Promise<FaturamentoYearsSyncResult> {
  const currentYear = new Date().getFullYear();
  const unique = Array.from(new Set(years))
    .filter(year => Number.isInteger(year) && year >= 2000 && year <= currentYear)
    .sort((a, b) => a - b);
  if (unique.length === 0) {
    throw new Error("Nenhum ano válido para recarregar.");
  }

  const connection = await testErpConnection();
  const results: FaturamentoSqlSyncYearResult[] = [];

  for (const year of unique) {
    const inicio = `${year}-01-01`;
    const fim = `${year + 1}-01-01`;
    const { rows } = await queryErpFaturamentoRowsInRange(inicio, fim);
    const batch: InsertFaturamento[] = [];
    let yearSkipped = 0;
    for (const row of rows) {
      const item = mapErpRowToFaturamento(row);
      if (!item) {
        yearSkipped += 1;
        continue;
      }
      batch.push(item);
    }
    if (batch.length === 0) {
      throw new Error(
        `ERP não retornou notas de ${year}. A base local desse ano não foi alterada.`
      );
    }
    console.log(`[faturamento] ${year}: ${batch.length} notas do ERP, substituindo o ano local`);
    await db.clearFaturamentoYear(year);
    const insertResult = await db.createFaturamentoBatch(batch);
    results.push({
      year,
      fetched: rows.length,
      mapped: batch.length,
      skipped: yearSkipped,
      inserted: insertResult.count,
    });
  }

  await db.rebuildFaturamentoResumo();
  try {
    const { runAfterFaturamentoSync } = await import("./faturamento-post-sync");
    await runAfterFaturamentoSync();
  } catch (err) {
    console.warn("[faturamento] pós-sync:", err);
  }
  return { source: connection.source, years: results };
}

export type FaturamentoYearsSyncStatus = {
  status: "idle" | "running" | "done" | "error";
  years: number[];
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  result: FaturamentoYearsSyncResult | null;
};

let yearSyncStatus: FaturamentoYearsSyncStatus = {
  status: "idle",
  years: [],
  startedAt: null,
  finishedAt: null,
  error: null,
  result: null,
};

export function getFaturamentoYearsSyncStatus(): FaturamentoYearsSyncStatus {
  return yearSyncStatus;
}

/** Dispara a recarga e devolve na hora. O ERP de um ano inteiro não cabe no tempo de uma requisição. */
export function startFaturamentoYearsSync(years: number[]): FaturamentoYearsSyncStatus {
  if (yearSyncStatus.status === "running") return yearSyncStatus;
  yearSyncStatus = {
    status: "running",
    years,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
    result: null,
  };
  syncFaturamentoYears(years)
    .then(async result => {
      yearSyncStatus = {
        ...yearSyncStatus,
        status: "done",
        finishedAt: new Date().toISOString(),
        result,
        error: null,
      };
      console.log(`[faturamento] anos recarregados ${result.years.map(y => y.year).join(",")}`);
    })
    .catch(error => {
      const message = error instanceof Error ? error.message : String(error);
      yearSyncStatus = {
        ...yearSyncStatus,
        status: "error",
        finishedAt: new Date().toISOString(),
        error: message,
      };
      console.error(`[faturamento] falha ao recarregar anos: ${message}`);
    });
  return yearSyncStatus;
}

export type FaturamentoRecentSyncResult = {
  refreshed: boolean;
  upToDate: boolean;
  removedCfop: number;
  inserted: number;
  fetched: number;
  skipped: number;
  desde: string | null;
  ate: string | null;
  maxAntes: string | null;
  maxDepois: string | null;
  today: string;
};

const FORCE_REUSE_MS = 20_000;
let recentSyncInflight: Promise<FaturamentoRecentSyncResult> | null = null;
let lastRecentSync: { at: number; result: FaturamentoRecentSyncResult } | null = null;

/**
 * Tira da base o CFOP fora da lista e puxa do ERP o que ainda não está gravado,
 * inclusive as notas de ontem e de hoje.
 * `force` é o passo anterior à previsão: se uma carga acabou de terminar, reutiliza
 * esse resultado em vez de baixar o ERP duas vezes seguidas.
 */
export function syncFaturamentoRecent(options?: {
  force?: boolean;
}): Promise<FaturamentoRecentSyncResult> {
  const force = options?.force === true;
  if (recentSyncInflight) return recentSyncInflight;
  if (force && lastRecentSync && Date.now() - lastRecentSync.at < FORCE_REUSE_MS) {
    return Promise.resolve(lastRecentSync.result);
  }

  recentSyncInflight = runSyncFaturamentoRecent()
    .then(result => {
      lastRecentSync = { at: Date.now(), result };
      return result;
    })
    .finally(() => {
      recentSyncInflight = null;
    });
  return recentSyncInflight;
}

async function runSyncFaturamentoRecent(): Promise<FaturamentoRecentSyncResult> {
  const today = calendarToday();
  const removedCfop = await db.purgeFaturamentoCfopIndevido();
  const maxAntes = await db.getFaturamentoMaxDataIso();

  if (maxAntes == null) {
    if (removedCfop > 0) await db.rebuildFaturamentoResumo();
    return {
      refreshed: false,
      upToDate: false,
      removedCfop,
      inserted: 0,
      fetched: 0,
      skipped: 0,
      desde: null,
      ate: null,
      maxAntes,
      maxDepois: null,
      today,
    };
  }

  const inicio = maxAntes >= today ? addCalendarDays(today, -1) : addCalendarDays(maxAntes, -2);
  const fim = addCalendarDays(today, 1);
  const { rows } = await queryErpFaturamentoRowsInRange(inicio, fim);
  if (rows.length === 0) {
    throw new Error(
      `ERP não retornou notas entre ${inicio} e ${fim}. A base local desse período não foi alterada.`
    );
  }

  const batch: InsertFaturamento[] = [];
  let skipped = 0;
  for (const row of rows) {
    const item = mapErpRowToFaturamento(row);
    if (!item) {
      skipped += 1;
      continue;
    }
    batch.push(item);
  }
  if (batch.length === 0) {
    throw new Error(
      `Nenhuma nota do período ${inicio} a ${fim} passou no filtro de CFOP. A base local não foi alterada.`
    );
  }

  await db.clearFaturamentoDateRange(inicio, fim);
  const insertResult = await db.createFaturamentoBatch(batch);
  await db.rebuildFaturamentoResumo();
  try {
    const { runAfterFaturamentoSync } = await import("./faturamento-post-sync");
    await runAfterFaturamentoSync();
  } catch (err) {
    console.warn("[faturamento] pós-sync recent:", err);
  }
  const maxDepois = await db.getFaturamentoMaxDataIso();

  return {
    refreshed: true,
    upToDate: (maxDepois ?? "") >= today,
    removedCfop,
    inserted: insertResult.count,
    fetched: rows.length,
    skipped,
    desde: inicio,
    ate: fim,
    maxAntes,
    maxDepois,
    today,
  };
}

export { testErpConnection };
