import { describe, expect, it } from "vitest";
import {
  rankSkuSimilarityCandidates,
  scoreSkuDescricaoSimilarity,
  SKU_SIMILARITY_DEPARA_AUTO_PICK,
} from "@shared/sku-descricao-similarity";

describe("sku-descricao-similarity", () => {
  it("prioriza mesma marca e tipo Sacola", () => {
    const target = {
      codigo: "80.02.000956",
      descricao: "Sacola P - Pink Cheeks FSC Misto",
      marca: "Pink Cheeks",
    };
    const scoreSacolaExpp = scoreSkuDescricaoSimilarity(target, {
      codigo: "80.02.000955",
      descricao: "Sacola EXPP - Pink Cheeks FSC Misto",
      marca: "Pink Cheeks",
    });
    const scoreSacola81 = scoreSkuDescricaoSimilarity(target, {
      codigo: "80.02.000100",
      descricao: "Sacola P Digiplast FSC",
      marca: "Pink Cheeks",
    });
    expect(scoreSacolaExpp).toBeGreaterThan(0.6);
    expect(scoreSacolaExpp).toBeGreaterThanOrEqual(scoreSacola81);
  });

  it("não confunde Papel de Seda com Sacola", () => {
    const target = {
      codigo: "82.02.000468",
      descricao: "Papel de Seda - Pink Cheeks",
      marca: "Pink Cheeks",
    };
    const scoreSacola = scoreSkuDescricaoSimilarity(target, {
      codigo: "80.02.000956",
      descricao: "Sacola P - Pink Cheeks FSC Misto",
      marca: "Pink Cheeks",
    });
    expect(scoreSacola).toBeLessThan(SKU_SIMILARITY_DEPARA_AUTO_PICK);
  });

  it("não ranqueia outro pendente se filtrado pelo caller", () => {
    const target = {
      codigo: "80.02.000956",
      descricao: "Sacola P - Pink Cheeks FSC Misto",
      marca: "Pink Cheeks",
    };
    const registered = [
      { codigo: "80.02.000955", descricao: "Sacola EXPP - Pink Cheeks", marca: "Pink Cheeks" },
    ];
    const ranked = rankSkuSimilarityCandidates(target, registered);
    expect(ranked[0]?.codigo).toBe("80.02.000955");
    expect(ranked.some(r => r.codigo === "80.02.000957")).toBe(false);
  });

  it("ignora ano na comparação (sacola P Aramis)", () => {
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