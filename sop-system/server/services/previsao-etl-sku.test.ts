import { describe, expect, it } from "vitest";
import {
  buildSkuCodificacao,
  isTmlCodificacao,
  loadSkuMarcaOficial,
  resolveSkuCodificacao,
} from "./previsao-etl";

describe("previsao ETL SKU keys", () => {
  it("monta sku_marca como no Skus Projetar", () => {
    expect(buildSkuCodificacao("80.06.001505", "Fórmula Animal")).toBe(
      "80.06.001505-Fórmula Animal"
    );
  });

  it("não duplica marca se já veio no formato sku_marca", () => {
    expect(
      buildSkuCodificacao("80.06.001505-Fórmula Animal", "Fórmula Animal")
    ).toBe("80.06.001505-Fórmula Animal");
  });

  it("usa sku_marca oficial quando o cadastro tem marca mais curta", () => {
    const oficial = loadSkuMarcaOficial();
    expect(resolveSkuCodificacao("80.01.000869", "Calvin Klein", oficial)).toBe(
      "80.01.000869-Calvin Klein Jeans"
    );
    expect(resolveSkuCodificacao("80.06.000980", "Adidas", oficial)).toBe(
      "80.06.000980-Adidas OCS Colect"
    );
    expect(resolveSkuCodificacao("80.06.001142", "Adidas", oficial)).toBe(
      "80.06.001142-Adidas Performace"
    );
  });
  it("detecta codificação TML legada", () => {
    expect(isTmlCodificacao("MTO-Fórmula Animal-Automática")).toBe(true);
    expect(isTmlCodificacao("80.06.001505-Fórmula Animal")).toBe(false);
  });
});
