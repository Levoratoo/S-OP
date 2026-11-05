import { describe, expect, it } from "vitest";
import { buildValidatedDeParaMap } from "./de-para-map";
import {
  consolidateVendasAggByDePara,
  isDeParaAliasSku,
  remapCodificacaoByDePara,
  resolveSkuCodificacao,
} from "./previsao-etl";

describe("consolidação De-Para na geração de previsão", () => {
  const dePara = buildValidatedDeParaMap([
    { skuAntigo: "80.01.000100", skuNovo: "80.01.000200" },
  ]);
  const oficial = new Map<string, string>([
    ["80.01.000200", "80.01.000200-Marca Teste"],
  ]);

  it("marca SKU alias no De-Para", () => {
    expect(isDeParaAliasSku("80.01.000100", dePara)).toBe(true);
    expect(isDeParaAliasSku("80.01.000200", dePara)).toBe(false);
  });

  it("remapa codificação do SKU antigo para o de referência", () => {
    const antigo = resolveSkuCodificacao("80.01.000100", "Marca Teste", oficial);
    const canonical = remapCodificacaoByDePara(antigo, dePara, oficial);
    expect(canonical).toBe("80.01.000200-Marca Teste");
  });

  it("soma históricos de alias e referência em uma linha", () => {
    const vendas = new Map<string, Map<string, number>>([
      [
        resolveSkuCodificacao("80.01.000100", "Marca Teste", oficial),
        new Map([
          ["jan-26", 10],
          ["fev-26", 5],
        ]),
      ],
      [
        resolveSkuCodificacao("80.01.000200", "Marca Teste", oficial),
        new Map([["jan-26", 7]]),
      ],
    ]);

    const merged = consolidateVendasAggByDePara(vendas, dePara, oficial);
    expect(merged.size).toBe(1);
    const only = merged.get("80.01.000200-Marca Teste");
    expect(only?.get("jan-26")).toBe(17);
    expect(only?.get("fev-26")).toBe(5);
  });
});
