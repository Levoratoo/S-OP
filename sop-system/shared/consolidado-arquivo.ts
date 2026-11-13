/** Layout do arquivo Consolidado (modelo padrão — uma linha por SKU × mês × origem). */

import { normalizeTipoNegocioComercial } from "./tipo-negocio";

export type ConsolidadoRelatorio = "MTS" | "MTO PV" | "CRM";

export function resolveConsolidadoRelatorio(planoColab: string): ConsolidadoRelatorio {
  const plano = String(planoColab || "").trim().toUpperCase();
  if (plano === "PV_MTO") return "MTO PV";
  if (plano === "CRM") return "CRM";
  return "MTS";
}

/** Tipo Comercial na aba MTS: ATD para SKUs ATD; demais JIT. PV/CRM = PRG. */
export function consolidadoTipoComercial(
  relatorio: ConsolidadoRelatorio,
  tipoNegocioProduto: string | null | undefined
): string {
  if (relatorio === "MTO PV" || relatorio === "CRM") return "PRG";
  if (normalizeTipoNegocioComercial(tipoNegocioProduto) === "ATD") return "ATD";
  return "JIT";
}

/** Tp: JIT padrão MTS; ATD (JITO) = PRG; PV/CRM = PRG. */
export function consolidadoTp(
  relatorio: ConsolidadoRelatorio,
  tipoNegocioProduto: string | null | undefined
): string {
  if (relatorio !== "MTS") return "PRG";
  if (normalizeTipoNegocioComercial(tipoNegocioProduto) === "ATD") return "PRG";
  return "JIT";
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
