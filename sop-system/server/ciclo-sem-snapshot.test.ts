import { describe, expect, it } from "vitest";
import { acuracidadeSnapshot } from "./services/ciclo-acuracidade";
import { compararCiclos } from "./services/ciclo-snapshot";

describe("ciclo sem snapshot", () => {
  it("acuracidadeSnapshot devolve vazio sem lançar", async () => {
    const result = await acuracidadeSnapshot(999999);
    expect(result.temSnapshot).toBe(false);
    expect(result.linhas).toEqual([]);
    expect(result.wmape).toBeNull();
    expect(result.bias).toBeNull();
  });

  it("compararCiclos devolve disponivel false sem lançar", async () => {
    const result = await compararCiclos(999999, 999998);
    expect(result.disponivel).toBe(false);
    expect(result.motivo).toMatch(/snapshot aprovado/i);
    expect(result.ciclosSemSnapshot.length).toBeGreaterThan(0);
    expect(result.porSkuMes).toEqual([]);
    expect(result.porMarcaMes).toEqual([]);
  });
});
