import { describe, expect, it } from "vitest";
import { roundPrecoPv4 } from "@shared/pv-preco-round";
import { pvMtoPivotLineKey } from "@shared/pv-mto-pivot";

describe("roundPrecoPv4 / chave pivot", () => {
  it("mantém 4 casas na chave (0,675 ≠ 0,858)", () => {
    expect(roundPrecoPv4(0.675)).toBe(0.675);
    expect(roundPrecoPv4(0.858)).toBe(0.858);
    const k1 = pvMtoPivotLineKey("176098", "80.06.001730", 0.675);
    const k2 = pvMtoPivotLineKey("176098", "80.06.001730", 0.858);
    expect(k1).not.toBe(k2);
  });

  it("receita usa preço completo (sem arredondar para 2 casas na chave)", () => {
    const preco = roundPrecoPv4(0.675);
    const qtd = 350_000;
    const receita = Math.round(qtd * preco * 100) / 100;
    expect(receita).toBeGreaterThan(350_000 * 0.67);
    expect(receita).toBeLessThan(350_000 * 0.68);
  });
});