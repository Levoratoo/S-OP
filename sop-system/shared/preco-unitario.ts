export function toNum(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const n = Number(String(value ?? "0").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** Preço cadastro; senão receitaBruta/quantidade do pedido/carteira. */
export function resolveValorVendaUnitario(
  valorCadastro: unknown,
  receitaBruta: unknown,
  quantidade: unknown
): number {
  const cad = toNum(valorCadastro);
  if (cad > 0) return Math.round(cad * 100) / 100;
  const q = toNum(quantidade);
  const rec = toNum(receitaBruta);
  if (q > 0 && rec > 0) return Math.round((rec / q) * 100) / 100;
  return 0;
}