/** Layout do arquivo Consolidado (modelo padrão — uma linha por SKU × mês × origem). */

export type ConsolidadoRelatorio = "MTS" | "JITO" | "MTO PV" | "CRM";

export function resolveConsolidadoRelatorio(
  planoColab: string,
  tipoNegocioProduto: string | null | undefined
): ConsolidadoRelatorio {
  const plano = String(planoColab || "").trim().toUpperCase();
  if (plano === "PV_MTO") return "MTO PV";
  if (plano === "CRM") return "CRM";
  if (plano === "JITO") return "JITO";
  const neg = String(tipoNegocioProduto || "")
    .trim()
    .toUpperCase();
  if (plano === "MTS" && neg === "ATD") return "JITO";
  return "MTS";
}

export function consolidadoTipoComercial(relatorio: ConsolidadoRelatorio): string {
  switch (relatorio) {
    case "MTS":
      return "JIT";
    case "JITO":
      return "ATD";
    case "MTO PV":
    case "CRM":
      return "PRG";
    default:
      return "PRG";
  }
}

export function consolidadoTp(relatorio: ConsolidadoRelatorio): string {
  return relatorio === "MTS" ? "JIT" : "PRG";
}

/** CRM aposta vem de crmTipo; demais origens = Colaboração. */
export function consolidadoTipoLinha(relatorio: ConsolidadoRelatorio, crmTipo: string | null | undefined): string {
  if (relatorio !== "CRM") return "Colaboração";
  const t = String(crmTipo || "")
    .trim()
    .toUpperCase();
  if (t === "APOSTA") return "Aposta";
  return "Colaboração";
}

export function consolidadoValorTotal(qtd: number, venda: number): number {
  return Math.round(qtd * venda);
}

export function consolidadoQtd(qtd: number): number {
  return Math.round(qtd);
}

export const CONSOLIDADO_EXCEL_HEADERS = [
  "sku/marca",
  "Sku",
  "Descrição",
  "Linha",
  "Marca",
  "Venda",
  "Mês",
  "Qtd",
  "Valor Total",
  "Relatório",
  "Tipo Comercial",
  "Tipo",
  "Tp",
  "Gestor",
  "Familia",
] as const;
