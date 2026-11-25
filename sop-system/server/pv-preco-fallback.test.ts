import { describe, expect, it } from "vitest";
import { resolvePvPrecoUnitarioComOrigem } from "@shared/pv-preco-fallback";

describe("pv-preco-fallback", () => {
  it("usa fallback carteira quando ERP preço zero", () => {
    const r = resolvePvPrecoUnitarioComOrigem({
      erpPreco: 0,
      receitaBruta: 0,
      quantidade: 350,
      sku: "80.06.001730",
      carteiraPrecoPorSku: new Map([["80.06.001730", 12.5]]),
    });
    expect(r.preco).toBe(12.5);
    expect(r.origem).toBe("carteira_outro_pedido");
  });

  it("usa faturamento 12m depois da carteira", () => {
    const r = resolvePvPrecoUnitarioComOrigem({
      erpPreco: 0,
      receitaBruta: 0,
      quantidade: 250,
      sku: "80.06.001731",
      faturamento12mPorSku: new Map([["80.06.001731", 9.8]]),
    });
    expect(r.preco).toBe(9.8);
    expect(r.origem).toBe("faturamento_12m");
  });
});