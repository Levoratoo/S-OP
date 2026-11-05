import { describe, expect, it } from "vitest";
import { isCarteiraPvAbertoRow } from "./services/carteira-pv-aberto";

describe("Carteira PV aberto", () => {
  it("exclui faturado=true", () => {
    expect(isCarteiraPvAbertoRow({ faturado: true })).toBe(false);
    expect(isCarteiraPvAbertoRow({ faturado: false })).toBe(true);
    expect(isCarteiraPvAbertoRow({ faturado: null })).toBe(true);
  });
});
