import { describe, expect, it } from "vitest";
import { mapErpRowToFaturamento } from "./faturamento-sql-sync";

describe("mapErpRowToFaturamento", () => {
  it("maps MetricsPROD aliases into SNOP faturamento fields", () => {
    const mapped = mapErpRowToFaturamento({
      Marca: "Printbag",
      Grupo: "VAR",
      Descricao_Item: "Sacola X",
      Tipo: "MTS",
      Cod_Material: "11.22.333",
      CNPJ: "12345678000199",
      Cod_Cliente: "1001",
      Unidade: "Franquia",
      NF: "555",
      UF: "SP",
      Cidade: "Campinas",
      Emissao: "15/01/2026",
      Qtd: "12,5",
      Total: "1500,75",
      Linha_Prod: "Classic",
      Representante: "Maria",
      CFOP: "5102",
      Desc_CFOP: "Venda",
      Motivo_Canc: "",
    });

    expect(mapped).not.toBeNull();
    expect(mapped!.marca).toBe("Printbag");
    expect(mapped!.tipoNegocio).toBe("VAR");
    expect(mapped!.codMaterial).toBe("11.22.333");
    expect(mapped!.nfNumero).toBe("555");
    expect(mapped!.qtd).toBe("12.5");
    expect(mapped!.valorTotal).toBe("1500.75");
    expect(mapped!.gestor).toBe("Maria");
    expect(mapped!.linhaProduto).toBe("Classic");
    expect(mapped!.tipoEstoque).toBe("MTS");
    expect(mapped!.tipoFaturamento).toBe("SAIDA");
    expect(mapped!.dataEmissao).toEqual(new Date(2026, 0, 15));
  });

  it("marks devolucao when Motivo Canc is present", () => {
    const mapped = mapErpRowToFaturamento({
      Emissao: new Date(2026, 2, 10),
      Qtd: 1,
      Total: 10,
      Motivo_Canc: "Cliente devolveu",
      CFOP: "5102",
    });
    expect(mapped!.tipoFaturamento).toBe("DEVOLUCAO");
  });

  it("skips rows without emission date", () => {
    expect(mapErpRowToFaturamento({ Qtd: 1, Total: 10 })).toBeNull();
  });
});
