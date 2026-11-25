export function toNum(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const n = Number(String(value ?? "0").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** Preço cadastro; senão receitaBruta/quantidade do pedido/carteira. */
export function precoCadastroProduto(
  prod: { precoUnitario?: unknown; valorVenda?: unknown } | null | undefined
): number {
  const unit = toNum(prod?.precoUnitario);
  if (unit > 0) return unit;
  return toNum(prod?.valorVenda);
}

export function precoUnitario4(value: number): string {
  return (Math.round((Number(value) || 0) * 10000) / 10000).toFixed(4);
}
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