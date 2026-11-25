/** Código acabado no layout SNOP (80.xx.xxxxxx). */
export const CRM_SKU_PATTERN = /^\d{2}\.\d{2}\.\d{6}$/;

export function isCrmSkuCodigoValido(sku: string | null | undefined): boolean {
  return CRM_SKU_PATTERN.test(String(sku ?? "").trim());
}

/** Coluna Tipo do Excel CRM → tipoEstoque. PRG → MTS; JIT (MTO) → MTO. */
export function crmTipoExcelParaEstoque(tipoExcel: string | null | undefined): "MTS" | "MTO" {
  const u = String(tipoExcel ?? "")
    .trim()
    .toUpperCase();
  if (u.includes("MTO") || (u.includes("JIT") && !u.includes("MTS"))) return "MTO";
  return "MTS";
}

/** Extrai JIT / PRG / VAR / ATD quando legível. */
export function crmTipoExcelParaNegocio(tipoExcel: string | null | undefined): string | null {
  const u = String(tipoExcel ?? "")
    .trim()
    .toUpperCase();
  if (u.includes("PRG")) return "PRG";
  if (u.includes("ATD")) return "ATD";
  if (u.includes("VAR")) return "VAR";
  if (u.includes("JIT")) return "JIT";
  return null;
}

export const CADASTRO_ORIGEM_CRM_AUTO = "CRM_AUTO";

const GENERICO_RE = /generico|genérico/i;

/** Mesma regex usada na carga CRM: código ou descrição com “genérico”. */
export function textoPareceSkuGenerico(
  sku: string | null | undefined,
  ...textos: Array<string | null | undefined>
): boolean {
  if (GENERICO_RE.test(String(sku ?? ""))) return true;
  return textos.some(texto => GENERICO_RE.test(String(texto ?? "")));
}

/**
 * A importação Excel bloqueia Aposta genérica sem orçamento.
 * A sincronização do Pipedrive passa `permitirSemOrcamento` e só alerta.
 */
export function apostaGenericaSemOrcamentoDeveBloquear(
  generico: boolean,
  crmTipo: string,
  orcamento: number,
  permitirSemOrcamento = false
): boolean {
  return generico && crmTipo === "APOSTA" && orcamento <= 0 && !permitirSemOrcamento;
}