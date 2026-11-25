import { toNum, resolveValorVendaUnitario } from "./preco-unitario";

export type PrecoOrigemPv =
  | "erp"
  | "receita_linha"
  | "carteira_outro_pedido"
  | "faturamento_12m"
  | "cadastro"
  | "gravado";

export type ResolvePvPrecoInput = {
  erpPreco: number;
  receitaBruta: number;
  quantidade: number;
  sku: string;
  cadastroPreco?: number;
  gravadoPreco?: number;
  carteiraPrecoPorSku?: Map<string, number>;
  faturamento12mPorSku?: Map<string, number>;
};

export function resolvePvPrecoUnitarioComOrigem(input: ResolvePvPrecoInput): {
  preco: number;
  origem: PrecoOrigemPv;
} {
  const erp = Math.round((toNum(input.erpPreco)) * 10000) / 10000;
  if (erp > 0) return { preco: erp, origem: "erp" };

  const q = toNum(input.quantidade);
  const rec = toNum(input.receitaBruta);
  const receitaUnit = resolveValorVendaUnitario(0, rec, q);
  if (receitaUnit > 0) return { preco: receitaUnit, origem: "receita_linha" };

  const sku = input.sku.trim().toUpperCase();
  const outroPedido = input.carteiraPrecoPorSku?.get(sku);
  if (outroPedido && outroPedido > 0) {
    return { preco: outroPedido, origem: "carteira_outro_pedido" };
  }

  const fat12 = input.faturamento12mPorSku?.get(sku);
  if (fat12 && fat12 > 0) return { preco: fat12, origem: "faturamento_12m" };

  const cad = toNum(input.cadastroPreco);
  if (cad > 0) return { preco: cad, origem: "cadastro" };

  const gravado = toNum(input.gravadoPreco);
  if (gravado > 0) return { preco: gravado, origem: "gravado" };

  return { preco: 0, origem: "erp" };
}

export function precoOrigemPvLabel(origem: PrecoOrigemPv): string {
  switch (origem) {
    case "erp":
      return "Preço do ERP";
    case "receita_linha":
      return "Receita ÷ quantidade da linha";
    case "carteira_outro_pedido":
      return "Outro pedido do mesmo SKU na carteira";
    case "faturamento_12m":
      return "Média faturamento SAÍDA (12 meses, com De-Para)";
    case "cadastro":
      return "Preço no cadastro do produto";
    case "gravado":
      return "Preço já gravado no ciclo";
    default:
      return origem;
  }
}

/** Monta mapa SKU → preço unitário a partir de entregas com preço > 0. */
export function buildCarteiraPrecoPorSkuFromEntregas(
  entregas: Array<{ sku: string; precoUnitario: number; quantidade: number; receitaBruta?: number }>
): Map<string, number> {
  const acc = new Map<string, { valor: number; qtd: number }>();
  for (const e of entregas) {
    const sku = String(e.sku || "").trim().toUpperCase();
    if (!sku) continue;
    let preco = toNum(e.precoUnitario);
    if (preco <= 0) {
      preco = resolveValorVendaUnitario(0, e.receitaBruta, e.quantidade);
    }
    if (preco <= 0) continue;
    const prev = acc.get(sku);
    if (!prev || preco > 0) {
      acc.set(sku, { valor: preco, qtd: 1 });
    }
  }
  const out = new Map<string, number>();
  for (const [sku, { valor }] of acc) {
    out.set(sku, Math.round(valor * 10000) / 10000);
  }
  return out;
}