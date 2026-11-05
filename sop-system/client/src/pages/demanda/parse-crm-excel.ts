import * as XLSX from "xlsx";

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
  dataFaturamento: string;
  qtdMes: number;
  modalidade: string;
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

/**
 * Modelo Ciclo CRM (Pipe):
 * IdNegocio, Marca, Proprietario, NomeProduto ("80.03.002154-descrição"),
 * PrecoProduto, ColaboracaoAposta, Temperatura, QuantidadeMes, Data da Entrega,
 * NumeroCalculoNovo. A coluna Tipo é PRG/JIT, não a classificação do card.
 */
function cell(row: Record<string, unknown>, ...keys: string[]) {
  const headers = Object.keys(row);
  for (const key of keys) {
    const found = headers.find(header => header.trim().toLowerCase() === key.trim().toLowerCase());
    if (found && row[found] != null && String(row[found]).trim() !== "") return row[found];
  }
  return "";
}

function num(row: Record<string, unknown>, ...keys: string[]) {
  const value = cell(row, ...keys);
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

function skuFromNomeProduto(raw: string) {
  const text = raw.trim();
  const match = text.match(/^(\d{2}\.\d{2}\.\d{6})\b/);
  if (!match) return { sku: text, descricao: text };
  const descricao = text.slice(match[1].length).replace(/^[\s:\-]+/, "").trim();
  return { sku: match[1], descricao: descricao || text };
}

function crmTipo(row: Record<string, unknown>) {
  const classificacao = String(
    cell(
      row,
      "ColaboracaoAposta",
      "Colaboração/Aposta",
      "ColaboracaoAposta/Oportunidade",
      "ColaboracaoApostaOportunidade"
    )
  ).trim();
  if (classificacao) return classificacao;
  const tipo = String(cell(row, "Tipo", "tipo")).trim();
  const folded = tipo
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase();
  if (folded.includes("APOSTA") || folded.includes("OPORTUN") || folded.includes("COLABOR")) return tipo;
  return "";
}

function orcamentoNum(row: Record<string, unknown>) {
  const raw = cell(
    row,
    "NumeroCalculoNovo",
    "Numero Calculo",
    "Orçamento",
    "Orcamento",
    "Cálculo OR",
    "Calculo OR"
  );
  const text = String(raw ?? "").trim();
  if (!text || text === "0") return 0;
  const match = text.match(/^(\d+)/);
  if (!match) return 1;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function parseCrmExcel(buffer: ArrayBuffer): CrmExcelRow[] {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  return json
    .map(row => {
      const nome = String(
        cell(row, "NomeProduto", "Nome do Produto", "Produto", "Descrição", "Descricao", "descricao")
      ).trim();
      const fromNome = skuFromNomeProduto(nome);
      const skuExplicito = String(
        cell(row, "SKU", "sku", "Cod Item", "CodItem", "Codigo", "Cod Material", "Cod. Material")
      ).trim();
      const sku = skuExplicito || fromNome.sku;
      return {
        sku,
        descricao: fromNome.descricao || nome,
        marca: String(cell(row, "Marca", "marca")),
        card: String(cell(row, "IdNegocio", "Id Negocio", "Card", "card", "ID Card")),
        cliente: String(cell(row, "Cliente", "cliente")),
        gestor: String(cell(row, "Proprietario", "Proprietário", "Gestor", "gestor")),
        temperatura: String(cell(row, "Temperatura", "temperatura")),
        tipo: crmTipo(row),
        orcamento: orcamentoNum(row),
        valorVenda: num(row, "PrecoProduto", "Preço Produto", "R$ Venda", "R$Venda", "Valor Venda"),
        dataFaturamento: asDateStr(
          cell(
            row,
            "Data da Entrega",
            "Data Entrega",
            "DataFaturamentoEsperada",
            "Data de Faturamento",
            "Data Faturamento",
            "DataFaturamento",
            "Competencia"
          )
        ),
        qtdMes: num(row, "QuantidadeMes", "Quantidade Mês", "Quantidade Mes", "Qtd Mês", "Qtd Mes", "Qtde Mês", "Qtde Mes"),
        modalidade: String(cell(row, "Modalidade", "modalidade")),
        m1: num(row, "m1", "M1"),
        m2: num(row, "m2", "M2"),
        m3: num(row, "m3", "M3"),
        m4: num(row, "m4", "M4"),
        m5: num(row, "m5", "M5"),
        m6: num(row, "m6", "M6"),
        m7: num(row, "m7", "M7"),
        m8: num(row, "m8", "M8"),
        m9: num(row, "m9", "M9"),
        m10: num(row, "m10", "M10"),
        m11: num(row, "m11", "M11"),
        m12: num(row, "m12", "M12"),
      };
    })
    .filter(row => row.sku);
}
