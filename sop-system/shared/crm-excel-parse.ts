import * as XLSX from "xlsx";
import {
  CrmExcelField,
  CrmExcelLayoutError,
  resolveCrmColumnMap,
  validateCrmExcelHeaders,
} from "./crm-excel-layout";

export type CrmExcelRow = {
  sku: string;
  descricao: string;
  marca: string;
  card: string;
  cliente: string;
  gestor: string;
  temperatura: string;
  /** Colaboração / Aposta / Oportunidade */
  tipo: string;
  orcamento: number;
  valorVenda: number;
  qtdeTotal: number;
  valorTotal: number;
  qtdeEntregas: number;
  dataFaturamento: string;
  qtdMes: number;
  valorTotalMes: number;
  modalidade: string;
  tipoNegocio: string;
  m1: number;
  m2: number;
  m3: number;
  m4: number;
  m5: number;
  m6: number;
  m7: number;
  m8: number;
  m9: number;
  m10: number;
  m11: number;
  m12: number;
};

export { CrmExcelLayoutError, validateCrmExcelHeaders } from "./crm-excel-layout";
export { CRM_EXCEL_HEADERS } from "./crm-excel-layout";

function num(value: unknown) {
  if (value instanceof Date) return 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? "0").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function asDateStr(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getUTCFullYear();
    const m = value.getUTCMonth() + 1;
    const d = value.getUTCDate();
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  if (typeof value === "number" && value > 20000 && value < 80000) {
    const dt = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000);
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
  }
  const text = String(value ?? "").trim();
  const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]!.padStart(2, "0")}-${br[1]!.padStart(2, "0")}`;
  return text.slice(0, 10);
}

/** Primeira ocorrência do padrão de SKU no texto do Produto. */
export function skuFromProdutoCrm(raw: string) {
  const text = raw.trim();
  const match = text.match(/\d{2}\.\d{2}\.\d{6}/);
  if (!match) return { sku: text, descricao: text };
  const sku = match[0];
  const descricao =
    text
      .replace(match[0], "")
      .replace(/^[\s:\-–]+/, "")
      .trim() || text;
  return { sku, descricao };
}

function orcamentoFromCalculoOr(raw: unknown) {
  const text = String(raw ?? "").trim();
  if (!text || text === "0") return 0;
  const match = text.match(/^(\d+)/);
  if (!match) return 0;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function cell(line: unknown[], colMap: Map<CrmExcelField, number>, field: CrmExcelField) {
  const idx = colMap.get(field);
  if (idx === undefined) return "";
  return line[idx] ?? "";
}

export function parseCrmExcel(buffer: ArrayBuffer): { headers: string[]; rows: CrmExcelRow[] } {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const crmSheet =
    workbook.SheetNames.find(n => n.trim().toLowerCase() === "crm") ?? workbook.SheetNames[0];
  const sheet = workbook.Sheets[crmSheet!];
  const matrix = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  }) as unknown[][];
  if (!matrix.length) {
    throw new CrmExcelLayoutError("Planilha CRM vazia.");
  }
  const headerRow = (matrix[0] || []).map(cell => String(cell ?? "").trim());
  const colMap = resolveCrmColumnMap(headerRow);

  const rows: CrmExcelRow[] = [];
  for (let r = 1; r < matrix.length; r++) {
    const line = matrix[r] || [];
    const produto = String(cell(line, colMap, "produto")).trim();
    if (!produto) continue;
    const fromProduto = skuFromProdutoCrm(produto);
    const classificacao = String(cell(line, colMap, "classificacao")).trim();
    const tipoNegocio = String(cell(line, colMap, "tipoNegocio")).trim();
    const temperatura = String(cell(line, colMap, "temperatura")).trim();

    rows.push({
      sku: fromProduto.sku,
      descricao: fromProduto.descricao,
      marca: String(cell(line, colMap, "marca")),
      card: "",
      cliente: "",
      gestor: String(cell(line, colMap, "gestor")),
      temperatura,
      tipo: classificacao || tipoNegocio,
      orcamento: orcamentoFromCalculoOr(cell(line, colMap, "calculoOr")),
      valorVenda: num(cell(line, colMap, "valorVenda")),
      qtdeTotal: num(cell(line, colMap, "qtdeTotal")),
      valorTotal: num(cell(line, colMap, "valorTotal")),
      qtdeEntregas: num(cell(line, colMap, "qtdeEntregas")),
      dataFaturamento: asDateStr(cell(line, colMap, "dataFaturamento")),
      qtdMes: num(cell(line, colMap, "qtdMes")),
      valorTotalMes: num(cell(line, colMap, "valorTotalMes")),
      modalidade: String(cell(line, colMap, "modalidade")),
      tipoNegocio,
      m1: 0,
      m2: 0,
      m3: 0,
      m4: 0,
      m5: 0,
      m6: 0,
      m7: 0,
      m8: 0,
      m9: 0,
      m10: 0,
      m11: 0,
      m12: 0,
    });
  }

  return { headers: headerRow, rows: rows.filter(row => row.sku) };
}