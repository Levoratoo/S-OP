import { describe, expect, it } from "vitest";
import {
  FATOR_SOMA_TOLERANCIA_PP,
  fatoresToPesosNormalizados,
  redistribuirTotalComFatores,
  validateFatoresPercentuais,
} from "@shared/sku-fator-sazonalidade";
import { validateFatoresPercentuais as validateAgain } from "@shared/sku-fator-sazonalidade";

describe("fatores % sazonais SKU", () => {
  it("valida soma ~100%", () => {
    const uniform = Array(12).fill(100 / 12);
    expect(validateFatoresPercentuais(uniform).ok).toBe(true);
    const bad = [...uniform];
    bad[0] = 50;
    expect(validateFatoresPercentuais(bad).ok).toBe(false);
  });

  it("rejeita soma fora da tolerância", () => {
    const soma99 = Array(11)
      .fill(100 / 12)
      .concat([100 / 12 - FATOR_SOMA_TOLERANCIA_PP - 0.1]);
    expect(validateAgain(soma99).ok).toBe(false);
  });

  it("redistribui total 12M com fatores cadastrados", () => {
    const fatores = [20, 10, 5, 5, 5, 5, 10, 10, 10, 10, 5, 5];
    expect(validateFatoresPercentuais(fatores).ok).toBe(true);
    const pesos = fatoresToPesosNormalizados(fatores);
    expect(pesos.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
    const dist = redistribuirTotalComFatores(12000, fatores, 1);
    const total = Object.values(dist).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(12000, 0);
    expect(dist.m1).toBeCloseTo(12000 * pesos[0], 0);
  });

  it("fallback: fatores uniformes equivalem a divisão igual", () => {
    const uniform = Array(12).fill(100 / 12);
    const dist = redistribuirTotalComFatores(1200, uniform, 3);
    const vals = Object.values(dist);
    vals.forEach(v => expect(v).toBeCloseTo(100, 0));
  });
});
