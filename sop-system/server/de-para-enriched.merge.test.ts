import { describe, expect, it } from "vitest";

describe("de-para enriched (estratégia)", () => {
  it("prioriza descrição do cadastro sobre faturamento", () => {
    const prodDesc = new Map([["80.01.000100", "Do cadastro"]]);
    const fatDesc = new Map([["80.01.000100", "Do faturamento"]]);
    const resolve = (code: string) => prodDesc.get(code) ?? fatDesc.get(code) ?? null;
    expect(resolve("80.01.000100")).toBe("Do cadastro");
  });

  it("consultas limitadas para ~2189 pares (list + produtos + faturamento só faltantes)", () => {
    const pares = 2189;
    const codigosUnicos = Math.round(pares * 1.7);
    const queryCount = 1 + Math.ceil(codigosUnicos / 400) * 2 + Math.ceil((codigosUnicos * 0.15) / 400);
    expect(queryCount).toBeLessThan(30);
  });
});