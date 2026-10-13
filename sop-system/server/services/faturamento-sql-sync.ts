import type { InsertFaturamento } from "../../drizzle/schema";
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

  const cfop = asText(row.CFOP).replace(/\D/g, "");
  // CFOPs de devolução comuns (entrada/saída)
  if (/^(1|2)2\d{2}$/.test(cfop) || /^(5|6)2\d{2}$/.test(cfop)) return "DEVOLUCAO";

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

export { testErpConnection };
