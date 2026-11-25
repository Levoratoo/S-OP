/** Valores válidos de tipo comercial (usr_acabado / coluna Tipo do cadastro). */
export const TIPOS_NEGOCIO_VALIDOS = ["JIT", "ATD", "PRG", "VAR"] as const;
export type TipoNegocioValido = (typeof TIPOS_NEGOCIO_VALIDOS)[number];

const VALID = new Set<string>(TIPOS_NEGOCIO_VALIDOS);

export function normalizeTipoNegocioComercial(value: string | null | undefined): TipoNegocioValido | null {
  const u = String(value ?? "")
    .trim()
    .toUpperCase();
  if (VALID.has(u)) return u as TipoNegocioValido;
  return null;
}

export function isTipoNegocioComercial(value: string | null | undefined): boolean {
  return normalizeTipoNegocioComercial(value) !== null;
}
