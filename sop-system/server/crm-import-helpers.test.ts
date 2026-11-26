import { describe, expect, it } from "vitest";
import {
  CRM_SKU_PATTERN,
  apostaGenericaSemOrcamentoDeveBloquear,
  chaveAgregacaoCrm,
  crmTipoExcelParaEstoque,
  crmTipoExcelParaNegocio,
  isCrmSkuCodigoValido,
  textoPareceSkuGenerico,
  valorGravadoCrm,
} from "@shared/crm-import-helpers";
import { montarPreviaCrm, type LinhaCrmTratada } from "@shared/pipedrive-crm";

describe("crm-import-helpers", () => {
  it("valida padrão NN.NN.NNNNNN", () => {
    expect(CRM_SKU_PATTERN.test("80.02.000951")).toBe(true);
    expect(isCrmSkuCodigoValido(" 80.06.001774 ")).toBe(true);
    expect(isCrmSkuCodigoValido("SKU GENERICO SACOLA")).toBe(false);
    expect(isCrmSkuCodigoValido("SAT49")).toBe(false);
  });

  it("mapeia Tipo Excel para estoque", () => {
    expect(crmTipoExcelParaEstoque("PRG")).toBe("MTS");
    expect(crmTipoExcelParaEstoque("JIT (MTO)")).toBe("MTO");
    expect(crmTipoExcelParaEstoque("MTO")).toBe("MTO");
  });

  it("separa o mesmo SKU por preço e o resumo bate com a prévia", () => {
    const parcelas = [
      { sku: "80.01.000001", tipo: "APOSTA", preco: 1, mes: 0, qtd: 100 },
      { sku: "80.01.000001", tipo: "APOSTA", preco: 2, mes: 1, qtd: 300 },
    ];
    const gravado = valorGravadoCrm(parcelas);
    expect(chaveAgregacaoCrm("80.01.000001", "APOSTA", 1)).not.toBe(
      chaveAgregacaoCrm("80.01.000001", "APOSTA", 2)
    );
    expect(gravado.grupos).toBe(2);
    expect(gravado.total).toBe(700);
    expect(gravado.porMes[0]).toBe(100);
    expect(gravado.porMes[1]).toBe(600);

    const mesmoPreco = valorGravadoCrm([
      { sku: "80.01.000001", tipo: "COLABORACAO", preco: 1.5, mes: 0, qtd: 10 },
      { sku: "80.01.000001", tipo: "COLABORACAO", preco: 1.5, mes: 0, qtd: 20 },
    ]);
    expect(mesmoPreco.grupos).toBe(1);
    expect(mesmoPreco.porMes[0]).toBe(45);

    const linha = (preco: number, qtd: number, data: string): LinhaCrmTratada => ({
      sku: "80.01.000001",
      descricao: "Sacola",
      marca: "Aurora",
      gestor: "Ana",
      temperatura: "",
      tipo: "Aposta",
      orcamento: 0,
      dataFaturamento: data,
      qtdMes: qtd,
      valorVenda: preco,
      valorTotalMes: qtd * preco,
      modalidade: "",
      tipoNegocio: "PRG",
      dealId: preco === 1 ? 1 : 2,
    });
    const previa = montarPreviaCrm({
      anoInicio: 2026,
      mesInicio: 11,
      tratamento: {
        linhas: [linha(1, 100, "2026-12-01"), linha(2, 300, "2027-01-01")],
        alertas: [],
        negocios: 2,
        negociosSemProduto: 0,
        linhasProduto: 2,
        produtosDesabilitados: 0,
        parcelasFora: 0,
      },
      cargaAtual: [],
    });
    expect(previa.totais.valor).toBe(700);
    expect(previa.meses[0]?.depoisValor).toBe(gravado.porMes[0]);
    expect(previa.meses[1]?.depoisValor).toBe(gravado.porMes[1]);
  });

  it("reconhece SKU genérico e o bloqueio de aposta sem cálculo", () => {
    expect(textoPareceSkuGenerico("80.02.000002", "SKU GENÉRICO - ENVELOPE")).toBe(true);
    expect(textoPareceSkuGenerico("80.01.000001", "Sacola específica")).toBe(false);
    expect(apostaGenericaSemOrcamentoDeveBloquear(true, "APOSTA", 0, false)).toBe(true);
    expect(apostaGenericaSemOrcamentoDeveBloquear(true, "APOSTA", 0, true)).toBe(false);
    expect(apostaGenericaSemOrcamentoDeveBloquear(true, "APOSTA", 61888, false)).toBe(false);
  });

  it("mapeia Tipo Excel para tipoNegocio", () => {
    expect(crmTipoExcelParaNegocio("JIT (MTO)")).toBe("JIT");
    expect(crmTipoExcelParaNegocio("PRG")).toBe("PRG");
  });
});