/** Preço pivot com 4 casas (alinha à chave e à carteira_pv_entregas). */
export function roundPrecoPv4(value: number): number {
  const n = Number(value) || 0;
  return Math.round(n * 10000) / 10000;
}

export function formatPrecoPvDisplay(value: number, decimals: 2 | 4 = 2): string {
  const n = roundPrecoPv4(value);
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}