import { describe, expect, it } from "vitest";
import { CFOPS_FATURAMENTO_PERMITIDOS, isCfopFaturamentoPermitido } from "@shared/cfop-faturamento";
import { addCalendarDays, formatCalendarDate } from "@shared/calendar-date";
import { buildFaturamentoErpRangeQuery } from "./erp-mssql";
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
    expect(mapErpRowToFaturamento({ Qtd: 1, Total: 10, CFOP: "5.102" })).toBeNull();
  });

  it("descarta CFOP fora da lista e aceita o código com ou sem pontos", () => {
    expect(CFOPS_FATURAMENTO_PERMITIDOS).toHaveLength(60);
    expect(isCfopFaturamentoPermitido("6.933")).toBe(true);
    expect(isCfopFaturamentoPermitido("6933")).toBe(true);
    expect(isCfopFaturamentoPermitido("6.105.01")).toBe(true);
    expect(isCfopFaturamentoPermitido("6.949")).toBe(false);
    expect(isCfopFaturamentoPermitido("6.105.02")).toBe(false);
    expect(isCfopFaturamentoPermitido("5.949")).toBe(false);
    expect(isCfopFaturamentoPermitido("5.949.01")).toBe(true);
    expect(isCfopFaturamentoPermitido("")).toBe(false);

    expect(
      mapErpRowToFaturamento({
        Emissao: new Date(2026, 9, 9),
        Qtd: 1,
        Total: 10,
        CFOP: "6.949",
      })
    ).toBeNull();

    const servico = mapErpRowToFaturamento({
      Emissao: "09/10/2026",
      Qtd: 2,
      Total: 20,
      CFOP: "6.933",
    });
    expect(servico?.tipoFaturamento).toBe("SAIDA");
    expect(servico?.cfop).toBe("6.933");

    const devolucao = mapErpRowToFaturamento({
      Emissao: "09/10/2026",
      Qtd: 1,
      Total: 10,
      CFOP: "1.201.01",
    });
    expect(devolucao?.tipoFaturamento).toBe("DEVOLUCAO");
  });

  it("mostra a data de calendário mesmo quando o JSON vem em meia-noite UTC", () => {
    expect(formatCalendarDate("2026-10-09T00:00:00.000Z")).toBe("09/10/2026");
    expect(formatCalendarDate("2026-10-09")).toBe("09/10/2026");
    expect(addCalendarDays("2026-10-09", -2)).toBe("2026-10-07");
    expect(addCalendarDays("2026-10-31", 1)).toBe("2026-11-01");
  });

  it("restringe a query do ERP aos CFOP permitidos", () => {
    const { sqlText } = buildFaturamentoErpRangeQuery();
    expect(sqlText).toContain("'6933'");
    expect(sqlText).toContain("'610501'");
    expect(sqlText).not.toContain("'6949'");
    expect(sqlText).not.toContain("'610502'");
  });
});
