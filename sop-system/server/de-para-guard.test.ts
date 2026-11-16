import { describe, expect, it } from "vitest";
import { buildValidatedDeParaMap } from "./services/de-para-map";
import { assertDeParaAcyclic, DeParaValidationError } from "./services/de-para-validate";
import { skuProjetarEfetivo } from "@shared/de-para-projetar";
import { resolveValorVendaUnitario } from "@shared/preco-unitario";

describe("de-para acíclico", () => {
  it("recusa ciclo A→B→A na validação", () => {
    expect(() =>
      assertDeParaAcyclic(
        [{ skuAntigo: "A", skuNovo: "B" }],
        { extra: { skuAntigo: "B", skuNovo: "A" } }
      )
    ).toThrow(DeParaValidationError);
  });

  it("aceita cadeia linear", () => {
    expect(() =>
      assertDeParaAcyclic(
        [
          { skuAntigo: "A", skuNovo: "B" },
          { skuAntigo: "B", skuNovo: "C" },
        ],
        { extra: { skuAntigo: "C", skuNovo: "D" } }
      )
    ).not.toThrow();
  });
});

describe("projetar efetivo", () => {
  const dePara = buildValidatedDeParaMap([{ skuAntigo: "80.01.000100", skuNovo: "80.01.000200" }]);
  const byCode = new Map([
    ["80.01.000100", { projetarEstatistica: true }],
    ["80.01.000200", { projetarEstatistica: false }],
  ]);

  it("herda projetar do antigo no canônico", () => {
    expect(skuProjetarEfetivo("80.01.000200", byCode, dePara)).toBe(true);
    expect(skuProjetarEfetivo("80.01.000300", byCode, dePara)).toBe(false);
  });
});

describe("preço unitário PV", () => {
  it("usa receita/qtd quando cadastro vazio", () => {
    expect(resolveValorVendaUnitario(0, 1000, 50)).toBe(20);
    expect(resolveValorVendaUnitario(12.5, 1000, 50)).toBe(12.5);
  });
});