/** Preço pivot com 4 casas (alinha à chave e à carteira_pv_entregas). */
export function roundPrecoPv4(value: number): number {
  const n = Number(value) || 0;
  return Math.round(n * 10000) / 10000;
}

/** Sempre 4 casas, pt-BR, independente do locale do processo. Ex.: 0.675 → "0,6750". */
export function formatPreco4(value: number): string {
  const negative = value < 0;
  const fixed = Math.abs(roundPrecoPv4(value)).toFixed(4);
  const [intPart, frac] = fixed.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negative ? "-" : ""}${grouped},${frac}`;
}

export function formatPreco4Moeda(value: number): string {
  if (!value) return "—";
  return `R$ ${formatPreco4(value)}`;
}

export function rotuloOrigemPrecoCadastro(origem: string | null | undefined): string {
  switch ((origem || "").trim().toLowerCase()) {
    case "manual":
      return "Manual";
    case "legado_cadastro":
    case "cadastro":
      return "Cadastro legado";
    case "erp_pedido":
    case "carteira":
    case "carteira_outro_pedido":
    case "erp":
      return "Pedido ERP";
    case "faturamento_12m":
      return "Faturamento 12m";
    case "":
      return "—";
    default:
      return origem || "—";
  }
}

export function formatPrecoPvDisplay(value: number, decimals: 2 | 4 = 4): string {
  const n = roundPrecoPv4(value);
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}