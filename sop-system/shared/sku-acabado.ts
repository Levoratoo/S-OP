/** Produto acabado: código começa em 80, 81, 82, 83, 84, 85 ou 86. */
export function isSkuAcabado(code: string | null | undefined): boolean {
  const digits = String(code ?? "").replace(/\D/g, "");
  if (digits.length < 2) return false;
  const prefix = Number(digits.slice(0, 2));
  return prefix >= 80 && prefix <= 86;
}
