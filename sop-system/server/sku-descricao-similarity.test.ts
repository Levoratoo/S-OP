import { describe, expect, it } from "vitest";
import { rankSkuSimilarityCandidates, scoreSkuDescricaoSimilarity } from "@shared/sku-descricao-similarity";

describe("sku-descricao-similarity", () => {
  it("prioriza mesma marca e descrição parecida", () => {
    const target = {
      codigo: "80.02.000956",
      descricao: "Sacola M - Digiplast Embalagens FSC Misto",
      marca: "Digiplast Embalagens",
    };
    const scoreDigiplast = scoreSkuDescricaoSimilarity(target, {
      codigo: "80.02.000100",
      descricao: "Sacola M Digiplast Embalagens FSC",
      marca: "Digiplast Embalagens",
    });
    const scoreOutra = scoreSkuDescricaoSimilarity(target, {
      codigo: "80.02.000200",
      descricao: "Sacola M - Karsten FSC Misto",
      marca: "Karsten",
    });
    expect(scoreDigiplast).toBeGreaterThan(scoreOutra);
  });

  it("ignora ano e tamanho na comparação", () => {
    const target = {
      codigo: "80.06.000888",
      descricao: "Sacola P 2026 - Aramis FSC Misto",
      marca: "Aramis",
    };
    const ranked = rankSkuSimilarityCandidates(target, [
      { codigo: "80.06.000001", descricao: "Sacola P - Aramis FSC Misto", marca: "Aramis" },
      { codigo: "80.06.000002", descricao: "Envelope G - Aramis", marca: "Aramis" },
    ]);
    expect(ranked[0]?.codigo).toBe("80.06.000001");
  });
});