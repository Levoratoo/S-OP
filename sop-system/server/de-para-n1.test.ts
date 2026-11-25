import { describe, expect, it } from "vitest";
import { diagnosticarDePara, somarHistoricoNoSkuCanonico } from "./services/de-para-aggregate";

describe("de-para N:1", () => {
  it("soma 3 antigos no mesmo novo", () => {
    const map = new Map([
      ["A1", "NOVO"],
      ["A2", "NOVO"],
      ["A3", "NOVO"],
    ]);
    const tot = somarHistoricoNoSkuCanonico(
      [
        { sku: "A1", qtd: 10 },
        { sku: "A2", qtd: 20 },
        { sku: "A3", qtd: 5 },
        { sku: "NOVO", qtd: 1 },
      ],
      map
    );
    expect(tot.get("NOVO")).toBe(36);
  });

  it("resolve cadeia A→B→C sem duplicar", () => {
    const map = new Map([
      ["A", "B"],
      ["B", "C"],
    ]);
    const tot = somarHistoricoNoSkuCanonico(
      [
        { sku: "A", qtd: 2 },
        { sku: "B", qtd: 3 },
      ],
      map
    );
    expect(tot.get("C")).toBe(5);
    expect(tot.has("A")).toBe(false);
  });

  it("diagnostica N:1 e não apaga dados", () => {
    const d = diagnosticarDePara([
      { skuAntigo: "1", skuNovo: "9" },
      { skuAntigo: "2", skuNovo: "9" },
      { skuAntigo: "3", skuNovo: "8" },
    ]);
    expect(d.gruposNpara1).toBe(1);
    expect(d.conflitos1n).toEqual([]);
    expect(d.total).toBe(3);
  });
});
