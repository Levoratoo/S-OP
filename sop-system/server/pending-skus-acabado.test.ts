import { describe, expect, it } from "vitest";
import { isSkuAcabado } from "@shared/sku-acabado";

/** Espelha o filtro de listPendingSkusFromFaturamento. */
function isPendingAcabadoSku(codMaterial: string) {
  return isSkuAcabado(codMaterial);
}

describe("SKUs pendentes — filtro acabado 80–86", () => {
  it("inclui códigos 80–86", () => {
    expect(isPendingAcabadoSku("80.03.002154")).toBe(true);
    expect(isPendingAcabadoSku("86.01.000001")).toBe(true);
  });

  it("exclui outros prefixos", () => {
    expect(isPendingAcabadoSku("79.01.000001")).toBe(false);
    expect(isPendingAcabadoSku("87.01.000001")).toBe(false);
    expect(isPendingAcabadoSku("99.99.999999")).toBe(false);
  });
});
