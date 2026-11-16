import * as XLSX from "xlsx";
import {
  CRM_EXCEL_HEADERS,
  CrmExcelLayoutError,
  validateCrmExcelHeaders,
} from "@shared/crm-excel-layout";

export { CRM_EXCEL_HEADERS, CrmExcelLayoutError, validateCrmExcelHeaders };

export type CrmExcelRow = {
  sku: string;
  descricao: string;
  marca: string;
  card: string;
  cliente: string;
  gestor: string;
  temperatura: string;
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

function num(value: unknown) {
  if (value instanceof Date) return 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? "0").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function asDateStr(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  const text = String(value ?? "").trim();
  const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) {
    return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  }
  return text;
}

function skuFromProduto(raw: string) {
  const text = raw.trim();
  const match = text.match(/^(\d{2}\.\d{2}\.\d{6})\b/);
  if (!match) return { sku: text, descricao: text };
  const descricao = text.slice(match[1].length).replace(/^[\s:\-]+/, "").trim();
  return { sku: match[1], descricao: descricao || text };
}

function orcamentoFromCalculoOr(raw: unknown) {
  const text = String(raw ?? "").trim();
  if (!text || text === "0") return 0;
  const match = text.match(/^(\d+)/);
  if (!match) return 1;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function classificacaoColaboracao(row: Record<string, unknown>) {
  const raw = String(row["ColaboracaoAposta/Oportunidade"] ?? "").trim();
  if (raw) return raw;
  return "";
}

export function parseCrmExcel(buffer: ArrayBuffer): { headers: string[]; rows: CrmExcelRow[] } {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  }) as unknown[][];
  if (!matrix.length) {
    throw new CrmExcelLayoutError("Planilha CRM vazia.");
  }
  const headerRow = (matrix[0] || []).map(cell => String(cell ?? "").trim());
  validateCrmExcelHeaders(headerRow);

  const rows: CrmExcelRow[] = [];
  for (let r = 1; r < matrix.length; r++) {
    const line = matrix[r] || [];
    const row: Record<string, unknown> = {};
    CRM_EXCEL_HEADERS.forEach((header, index) => {
      row[header] = line[index] ?? "";
    });

    const produto = String(row.Produto ?? "").trim();
    if (!produto) continue;
    const fromProduto = skuFromProduto(produto);
    const classificacao = classificacaoColaboracao(row);
    const tipoNegocio = String(row.Tipo ?? "").trim();

    rows.push({
      sku: fromProduto.sku,
      descricao: fromProduto.descricao,
      marca: String(row.Marca ?? ""),
      card: "",
      cliente: "",
      gestor: String(row.Gestor ?? ""),
      temperatura: String(row.Temperatura ?? ""),
      tipo: classificacao || tipoNegocio,
      orcamento: orcamentoFromCalculoOr(row["Cálculo OR"]),
      valorVenda: num(row["R$ Venda"]),
      qtdeTotal: num(row["Qtde Total"]),
      valorTotal: num(row["R$ Total"]),
      qtdeEntregas: num(row["Qtde Entregas"]),
      dataFaturamento: asDateStr(row["Data de Faturamento"]),
      qtdMes: num(row["Qtd Mês"]),
      valorTotalMes: num(row["R$ Total Mês"]),
      modalidade: String(row.Modalidade ?? ""),
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
