/** Layout CRM Ciclo (15 colunas, ordem fixa). */
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
  "Temperatura",
] as const;

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
    .replace(/\s+/g, " ");
}

const EXPECTED_NORMALIZED = CRM_EXCEL_HEADERS.map(normalizeCrmHeader);

export function validateCrmExcelHeaders(headers: string[]) {
  const trimmed = headers.map(h => String(h ?? "").trim());
  if (trimmed.length !== CRM_EXCEL_HEADERS.length) {
    throw new CrmExcelLayoutError(
      `O CRM deve ter exatamente ${CRM_EXCEL_HEADERS.length} colunas nesta ordem: ${CRM_EXCEL_HEADERS.join(", ")}. Encontradas: ${trimmed.length}.`
    );
  }
  const mismatches: string[] = [];
  for (let i = 0; i < CRM_EXCEL_HEADERS.length; i++) {
    const got = normalizeCrmHeader(trimmed[i]);
    const expected = EXPECTED_NORMALIZED[i]!;
    if (got !== expected) {
      mismatches.push(`coluna ${i + 1}: esperado "${CRM_EXCEL_HEADERS[i]}", recebido "${trimmed[i]}"`);
    }
  }
  if (mismatches.length) {
    throw new CrmExcelLayoutError(
      `Layout CRM inválido. ${mismatches.join("; ")}. Ordem esperada: ${CRM_EXCEL_HEADERS.join(" | ")}.`
    );
  }
}
