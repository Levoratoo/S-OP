/** Layout CRM Ciclo (15 colunas — modelo Pedro / PipeDrive). */
export const CRM_EXCEL_HEADERS = [
  "Marca",
  "Gestor",
  "Produto",
  "R$ Venda",
  "Qtde Total",
  "R$ Total",
  "Cálculo OR",
  "Qtde Entregas",
  "Qtd Mês",
  "R$ Total Mês",
  "Data de Faturamento",
  "Modalidade",
  "Tipo",
  "ColaboracaoAposta/Oportunidade",
  "Tp",
] as const;

export type CrmExcelField =
  | "marca"
  | "gestor"
  | "produto"
  | "valorVenda"
  | "qtdeTotal"
  | "valorTotal"
  | "calculoOr"
  | "qtdeEntregas"
  | "qtdMes"
  | "valorTotalMes"
  | "dataFaturamento"
  | "modalidade"
  | "tipoNegocio"
  | "classificacao"
  | "temperatura";

export const CRM_EXCEL_FIELD_ORDER: CrmExcelField[] = [
  "marca",
  "gestor",
  "produto",
  "valorVenda",
  "qtdeTotal",
  "valorTotal",
  "calculoOr",
  "qtdeEntregas",
  "qtdMes",
  "valorTotalMes",
  "dataFaturamento",
  "modalidade",
  "tipoNegocio",
  "classificacao",
  "temperatura",
];

export class CrmExcelLayoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CrmExcelLayoutError";
  }
}

export function normalizeCrmHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.$]/g, "");
}

function headerMatchesField(normalized: string, field: CrmExcelField): boolean {
  switch (field) {
    case "marca":
      return normalized === "marca";
    case "gestor":
      return normalized === "gestor";
    case "produto":
      return normalized === "produto";
    case "valorVenda":
      return normalized === "r venda" || normalized === "rs venda" || normalized === "valor venda";
    case "qtdeTotal":
      return normalized === "qtde total" || normalized === "qtd total";
    case "valorTotal":
      return normalized === "r total" || normalized === "rs total" || normalized === "valor total";
    case "calculoOr":
      return normalized === "calculo or" || normalized === "cálculo or";
    case "qtdeEntregas":
      return normalized === "qtde entregas" || normalized === "qtd entregas";
    case "qtdMes":
      return normalized === "qtd mes" || normalized === "qtd mês" || normalized === "qtdmes";
    case "valorTotalMes":
      return normalized === "r total mes" || normalized === "r total mês" || normalized === "rs total mes";
    case "dataFaturamento":
      return normalized === "data de faturamento" || normalized === "data faturamento";
    case "modalidade":
      return normalized === "modalidade";
    case "tipoNegocio":
      return normalized === "tipo";
    case "classificacao":
      return (
        normalized === "colaboracaoaposta/oportunidade" ||
        normalized === "colaboracao aposta/oportunidade" ||
        (normalized.includes("colaboracao") && normalized.includes("oportunidade"))
      );
    case "temperatura":
      return normalized === "tp" || normalized === "temperatura";
    default:
      return false;
  }
}

/** Índice de coluna (0-based) para cada campo canônico; falha se layout incompleto ou duplicado. */
export function resolveCrmColumnMap(headers: string[]): Map<CrmExcelField, number> {
  const trimmed = headers.map(h => String(h ?? "").trim());
  if (trimmed.length !== CRM_EXCEL_HEADERS.length) {
    throw new CrmExcelLayoutError(
      `O CRM deve ter exatamente ${CRM_EXCEL_HEADERS.length} colunas. Encontradas: ${trimmed.length}.`
    );
  }
  const map = new Map<CrmExcelField, number>();
  const used = new Set<number>();
  for (let i = 0; i < trimmed.length; i++) {
    const norm = normalizeCrmHeader(trimmed[i]);
    for (const field of CRM_EXCEL_FIELD_ORDER) {
      if (!headerMatchesField(norm, field)) continue;
      if (map.has(field)) {
        throw new CrmExcelLayoutError(`Coluna duplicada para “${field}” no cabeçalho CRM.`);
      }
      map.set(field, i);
      used.add(i);
      break;
    }
  }
  const missing = CRM_EXCEL_FIELD_ORDER.filter(f => !map.has(f));
  if (missing.length) {
    throw new CrmExcelLayoutError(
      `Layout CRM inválido. Colunas não reconhecidas: ${missing.join(", ")}. ` +
        `Cabeçalho recebido: ${trimmed.join(" | ")}.`
    );
  }
  return map;
}

/** Valida cabeçalho tolerante (sinônimos, acentos, Tp/Temperatura). */
export function validateCrmExcelHeaders(headers: string[]) {
  resolveCrmColumnMap(headers);
}