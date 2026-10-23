import { describe, expect, it } from "vitest";
import {
  alignCycleMonths,
  calculateRateio,
  getClosedWindowBounds,
  getSeasonalityIndex,
  netSalesQuantity,
} from "./desagregacao";
import { buildValidatedDeParaMap, resolveCodigoAtual } from "./de-para-map";

describe("calendário da previsão", () => {
  it("usa exatamente os 6 e 12 meses fechados", () => {
    const bounds = getClosedWindowBounds(new Date(2026, 8, 17));

    expect(bounds.cutoff6).toEqual(new Date(2026, 2, 1));
    expect(bounds.cutoff12).toEqual(new Date(2025, 8, 1));
    expect(bounds.endExclusive).toEqual(new Date(2026, 8, 1));
  });

  it("desloca sazonalidade Jan-Dez para o mês inicial do ciclo", () => {
    expect(getSeasonalityIndex(9, 0)).toBe(8);
    expect(getSeasonalityIndex(9, 3)).toBe(11);
    expect(getSeasonalityIndex(9, 4)).toBe(0);
    expect(getSeasonalityIndex(1, 11)).toBe(11);
  });

  it("liquida devoluções sem inverter duas vezes valores já negativos", () => {
    expect(netSalesQuantity("SAIDA", 100)).toBe(100);
    expect(netSalesQuantity("DEVOLUCAO", 25)).toBe(-25);
    expect(netSalesQuantity("DEVOLUCAO", -25)).toBe(-25);
  });

  it("calcula rateio 6M e aplica fallback 12M somente sem base", () => {
    expect(calculateRateio(30, 120)).toBe(0.25);
    expect(calculateRateio(0, 0, 0.4)).toBe(0.4);
    expect(calculateRateio(0, 120, 0.4)).toBe(0);
  });

  it("alinha colaboração anterior por competência e cruza o ano", () => {
    const aligned = alignCycleMonths(
      2026,
      9,
      2026,
      10,
      {
        m1: "1",
        m2: "2",
        m3: "3",
        m4: "4",
        m5: "5",
        m6: "6",
        m7: "7",
        m8: "8",
        m9: "9",
        m10: "10",
        m11: "11",
        m12: "12",
      }
    );

    expect(aligned).toEqual({
      m1: "2",
      m2: "3",
      m3: "4",
      m4: "5",
      m5: "6",
      m6: "7",
      m7: "8",
      m8: "9",
      m9: "10",
      m10: "11",
      m11: "12",
      m12: "0",
    });
  });
});

describe("integridade do De-Para", () => {
  it("resolve cadeias válidas", () => {
    const map = buildValidatedDeParaMap([
      { skuAntigo: "a", skuNovo: "B" },
      { skuAntigo: "B", skuNovo: "C" },
    ]);

    expect(resolveCodigoAtual("A", map)).toBe("C");
  });

  it("bloqueia relações conflitantes", () => {
    expect(() =>
      buildValidatedDeParaMap([
        { skuAntigo: "A", skuNovo: "B" },
        { skuAntigo: "a", skuNovo: "C" },
      ])
    ).toThrow(/conflitante/i);
  });

  it("bloqueia autorreferência e ciclos", () => {
    expect(() =>
      buildValidatedDeParaMap([{ skuAntigo: "A", skuNovo: "a" }])
    ).toThrow(/ele mesmo/i);
    expect(() =>
      buildValidatedDeParaMap([
        { skuAntigo: "A", skuNovo: "B" },
        { skuAntigo: "B", skuNovo: "A" },
      ])
    ).toThrow(/ciclo/i);
  });
});
