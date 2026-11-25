import { describe, expect, it } from "vitest";
import { monthEffectiveQty, sumItemMonths } from "./db";

describe("monthEffectiveQty (fechamento / consolidado)", () => {
  it("usa colaboração do vendedor quando preenchida", () => {
    const item = { m1: "120", e1: "100", m2: "", e2: "80" };
    expect(monthEffectiveQty(item, 0)).toBe(120);
    expect(monthEffectiveQty(item, 1)).toBe(80);
    expect(sumItemMonths(item)).toBe(200);
  });

  it("ignora mês com string vazia e cai na estatística", () => {
    const item = { m3: "   ", e3: "45" };
    expect(monthEffectiveQty(item, 2)).toBe(45);
  });
});
