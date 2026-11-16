import { normalizeTipoNegocioComercial } from "./tipo-negocio";

/** ATD/JITO entra na aba MTS; MTO sem ATD → PV_MTO. */
export function resolvePlanoColab(
  tipoEstoque: "MTS" | "MTO",
  tipoNegocioHint?: string | null
): "MTS" | "PV_MTO" {
  if (normalizeTipoNegocioComercial(tipoNegocioHint) === "ATD") return "MTS";
  if (tipoEstoque === "MTO") return "PV_MTO";
  return "MTS";
}
