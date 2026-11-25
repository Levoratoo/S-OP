import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { CRM_EXCEL_HEADERS } from "@shared/crm-excel-layout";
import { orcamentoFromCalculoOr, parseCrmExcel } from "@shared/crm-excel-parse";
import { carregarConfigPipedrive } from "@shared/pipedrive-config";
import {
  casarGestor,
  classificarColaboracao,
  classificarEtiquetas,
  configPadraoParaTeste,
  extrairLinhasExportacao,
  interpretarEntregas,
  linhasExportacaoParaMatriz,
  mesesConsecutivos,
  montarPreviaCrm,
  parseMatrizExportacaoAq,
  ratearCentavos,
  ratearInteiro,
  resolverCamposPipedrive,
  separarCodigoProduto,
  tratarLinhasExportacao,
  tratarPacotePipedrive,
  type LinhaCrmTratada,
  type LinhaExportacaoPipedrive,
} from "@shared/pipedrive-crm";
import { CONTEXTO_FICTICIO, pacoteFicticio } from "./services/pipedrive/fixture";

function doDeal(linhas: LinhaCrmTratada[], dealId: number) {
  return linhas.filter(linha => linha.dealId === dealId);
}

function soma(linhas: LinhaCrmTratada[], campo: "qtdMes" | "valorTotalMes") {
  return Math.round(linhas.reduce((total, linha) => total + linha[campo], 0) * 100) / 100;
}

function assinatura(linhas: LinhaExportacaoPipedrive[]) {
  return linhas.map(linha => ({
    dealId: linha.dealId,
    marca: linha.marca,
    proprietario: linha.proprietario,
    dataFechamento: linha.dataFechamento,
    nomeProduto: linha.nomeProduto,
    preco: linha.preco,
    quantidade: linha.quantidade,
    valor: linha.valor,
    etiquetas: linha.etiquetas,
    calculo: linha.calculo,
    entregasTexto: linha.entregasTexto,
    tipo: linha.tipo,
    codigoProduto: linha.codigoProduto,
  }));
}

describe("parser Pipedrive da coluna G", () => {
  it("separa o padrão NN.NN.NNNNNN-Descrição", () => {
    expect(separarCodigoProduto("80.01.000968-SKU GENÉRICO - ENVELOPE", "80.01.000968")).toEqual({
      sku: "80.01.000968",
      descricao: "SKU GENÉRICO - ENVELOPE",
      semCodigo: false,
    });
  });

  it("trata prefixo duplicado, separador atípico e espaço duplo", () => {
    expect(
      separarCodigoProduto("80.03.002339 : 80.03.002339 - Sacola  Reciclável P", "80.03.002339")
    ).toEqual({
      sku: "80.03.002339",
      descricao: "Sacola Reciclável P",
      semCodigo: false,
    });
  });

  it("trata o caso invertido, código só no product.code e a ausência de código", () => {
    expect(separarCodigoProduto("80.06.001744", "Sacola  G - Tea Shop FSC Misto")).toEqual({
      sku: "80.06.001744",
      descricao: "Sacola G - Tea Shop FSC Misto",
      semCodigo: false,
    });
    expect(separarCodigoProduto("Caixa  especial", "80.05.000005")).toEqual({
      sku: "80.05.000005",
      descricao: "Caixa especial",
      semCodigo: false,
    });
    expect(separarCodigoProduto("envelope e-commerce genérico", "NAO-E-SKU").semCodigo).toBe(true);
  });
});

describe("etiquetas, entregas e rateio", () => {
  it("mapeia modalidade e temperatura e descarta o resto", () => {
    expect(
      classificarEtiquetas([
        "RECOMPRA/REATIVAÇÃO (podemos perder o pedido)",
        "Morno",
        "Ciclo",
        "Contas Chaves",
        "Exportação",
        "RESERVA",
        "ABF 2025",
      ])
    ).toMatchObject({ modalidade: "RECOMPRA", temperatura: "Morno" });
    expect(classificarEtiquetas(["Cliente Novo", "Quente"]).modalidade).toBe("CLIENTE_NOVO");
    expect(classificarEtiquetas(["Repetição (pedido garantido)"]).modalidade).toBe("REPETICAO");
    expect(classificarEtiquetas(["Ciclo"]).temperatura).toBe("");
  });

  it("Cliente Novo é sempre Aposta; recompra segue genérico ou específico", () => {
    expect(
      classificarColaboracao({
        modalidade: "CLIENTE_NOVO",
        sku: "80.01.000001",
        descricoes: ["Sacola específica"],
      })
    ).toBe("Aposta");
    expect(
      classificarColaboracao({
        modalidade: "RECOMPRA",
        sku: "80.02.000002",
        descricoes: ["SKU GENÉRICO - ENVELOPE"],
      })
    ).toBe("Aposta");
    expect(
      classificarColaboracao({
        modalidade: "REPETICAO",
        sku: "80.01.000001",
        descricoes: ["Sacola específica"],
      })
    ).toBe("Colaboração");
  });

  it("interpreta entregas inválidas como 1 e usa o numérico legado só quando o texto está vazio", () => {
    expect(interpretarEntregas("12", null)).toMatchObject({ entregas: 12, alerta: false });
    expect(interpretarEntregas("6\n", null)).toMatchObject({ entregas: 6, alerta: false });
    expect(interpretarEntregas("0", null)).toMatchObject({ entregas: 1, alerta: true });
    for (const texto of ["NA", "-", "Lista de distribuição", "2.5"]) {
      expect(interpretarEntregas(texto, 8).entregas).toBe(1);
      expect(interpretarEntregas(texto, 8).alerta).toBe(true);
    }
    expect(interpretarEntregas("", 4)).toMatchObject({ entregas: 4, alerta: false });
    expect(interpretarEntregas("\n", 0)).toMatchObject({ entregas: 1, alerta: true });
    expect(interpretarEntregas("   ", null)).toMatchObject({ entregas: 1, alerta: true });
  });

  it("rateia quantidade inteira e valor em centavos com a sobra na última parcela", () => {
    const doze = ratearInteiro(5_000_000, 12);
    expect(doze).toHaveLength(12);
    expect(doze.reduce((a, b) => a + b, 0)).toBe(5_000_000);
    expect(doze.slice(0, 11).every(qtd => qtd === 416_666)).toBe(true);
    expect(doze[11]).toBe(416_674);
    expect(ratearInteiro(8000, 1)).toEqual([8000]);
    expect(ratearInteiro(10, 3)).toEqual([3, 3, 4]);
    const dinheiro = ratearCentavos(100, 3);
    expect(dinheiro).toEqual([33.33, 33.33, 33.34]);
    expect(Math.round(dinheiro.reduce((a, b) => a + b, 0) * 100) / 100).toBe(100);
    const virada = mesesConsecutivos("2026-12-15", 2);
    expect(virada.map(mes => mes.iso)).toEqual(["2026-12-01", "2027-01-01"]);
  });

  it("casa gestor sem acento e sem diferenciar maiúsculas", () => {
    expect(casarGestor("Francine Sapelli Custodio", ["Francine Sapelli Custódio"])).toEqual({
      gestor: "Francine Sapelli Custódio",
      encontrado: true,
    });
    expect(casarGestor("ana souza", ["Ana Souza"]).encontrado).toBe(true);
    expect(casarGestor("Pessoa Sem Cadastro", ["Ana Souza"]).encontrado).toBe(false);
  });
});

describe("configuração e horizonte", () => {
  it("resolve hash ausente pelo nome e aceita override de ambiente", () => {
    const config = configPadraoParaTeste();
    config.campos.marca = "hash-antigo";
    config.labels.ciclo = 3257;
    const resolvido = resolverCamposPipedrive(
      config,
      [
        { key: "marca-nova", name: "Marca" },
        { key: "label", name: "Etiqueta", options: [{ id: 9999, label: "Ciclo" }] },
      ],
      []
    );
    expect(resolvido.config.campos.marca).toBe("marca-nova");
    expect(resolvido.config.labels.ciclo).toBe(9999);

    const porEnv = carregarConfigPipedrive({
      PIPEDRIVE_API_TOKEN: "abc",
      PIPEDRIVE_PIPELINE_ID: "8",
      PIPEDRIVE_API_BASE: "https://exemplo.test/",
      PIPEDRIVE_COMPANY_DOMAIN: "printbag",
    });
    expect(porEnv.token).toBe("abc");
    expect(porEnv.pipelineId).toBe(8);
    expect(porEnv.apiBase).toBe("https://exemplo.test");
    expect(carregarConfigPipedrive({ PIPEDRIVE_COMPANY_DOMAIN: "https://printbag.pipedrive.com/" }).apiBase).toBe(
      "https://printbag.pipedrive.com"
    );
    expect(carregarConfigPipedrive({}).token).toBe("");
  });
});

describe("pacote fictício da API v2", () => {
  const config = configPadraoParaTeste();
  const tratamento = tratarPacotePipedrive(pacoteFicticio(), config, CONTEXTO_FICTICIO);

  it("filtra funil, etiqueta, apagados e produto desabilitado", () => {
    const ids = new Set(tratamento.linhas.map(linha => linha.dealId));
    expect(ids.has(910009)).toBe(false);
    expect(ids.has(910010)).toBe(false);
    expect(ids.has(910011)).toBe(false);
    expect(ids.has(910012)).toBe(false);
    expect(tratamento.linhas.some(linha => linha.sku === "80.09.000009")).toBe(false);
    expect(tratamento.negocios).toBe(8);
    expect(tratamento.negociosSemProduto).toBe(1);
    expect(tratamento.produtosDesabilitados).toBe(1);
  });

  it("espalha 12 entregas com soma exata e virada de ano", () => {
    const linhas = doDeal(tratamento.linhas, 910001);
    expect(linhas).toHaveLength(12);
    expect(soma(linhas, "qtdMes")).toBe(5_000_000);
    expect(soma(linhas, "valorTotalMes")).toBe(10_000_000);
    expect(linhas[0]?.dataFaturamento).toBe("2026-12-01");
    expect(linhas[11]?.dataFaturamento).toBe("2027-11-01");
    expect(linhas[0]?.tipo).toBe("Colaboração");
    expect(linhas[0]?.orcamento).toBe(61888);
    expect(linhas[1]?.orcamento).toBe(0);
    expect(linhas.reduce((total, linha) => total + linha.orcamento, 0)).toBe(61888);
    expect(linhas[0]?.marca).toBe("Aurora");
    expect(linhas[0]?.gestor).toBe("Ana Souza");
    expect(linhas[0]?.temperatura).toBe("Morno");
    expect(linhas[0]?.tipoNegocio).toBe("PRG");
    expect(linhas[0]?.modalidade).toContain("RECOMPRA");
    expect(tratamento.alertas.some(alerta => alerta.dealId === 910001)).toBe(false);
  });

  it("Cliente Novo genérico sem cálculo alerta e não bloqueia; específico também é Aposta", () => {
    const generico = doDeal(tratamento.linhas, 910002);
    expect(generico).toHaveLength(1);
    expect(generico[0]?.tipo).toBe("Aposta");
    expect(generico[0]?.orcamento).toBe(0);
    expect(generico[0]?.temperatura).toBe("");
    expect(generico[0]?.tipoNegocio).toBe("JIT (MTO)");
    expect(tratamento.alertas.some(alerta => alerta.dealId === 910002 && alerta.tipo === "generico_sem_calculo")).toBe(
      true
    );

    const especifico = doDeal(tratamento.linhas, 910008);
    expect(especifico[0]?.tipo).toBe("Aposta");
    expect(especifico[0]?.sku).toBe("80.05.000005");
    expect(especifico[0]?.descricao).toBe("Caixa especial");
    expect(especifico[0]?.orcamento).toBe(4242);
    expect(
      tratamento.alertas.some(alerta => alerta.dealId === 910008 && alerta.tipo === "generico_sem_calculo")
    ).toBe(false);
  });

  it("importa preço zero, entregas NA, gestor desconhecido e SKU novo com alerta", () => {
    const linhas = doDeal(tratamento.linhas, 910003);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.sku).toBe("80.03.000003");
    expect(linhas[0]?.descricao).toBe("Sacola Reciclável");
    expect(linhas[0]?.qtdMes).toBe(100);
    expect(linhas[0]?.gestor).toBe("Pessoa Sem Cadastro");
    const tipos = tratamento.alertas.filter(alerta => alerta.dealId === 910003).map(alerta => alerta.tipo);
    expect(tipos).toEqual(
      expect.arrayContaining(["entregas_assumidas", "preco_zero", "gestor_nao_encontrado", "sku_fora_cadastro"])
    );
  });

  it("prefere o cálculo do item, usa o legado numérico e descreve o código invertido", () => {
    const linhas = doDeal(tratamento.linhas, 910004);
    expect(linhas.map(linha => linha.dataFaturamento)).toEqual(["2027-08-01", "2027-09-01"]);
    expect(soma(linhas, "qtdMes")).toBe(7);
    expect(soma(linhas, "valorTotalMes")).toBe(10.01);
    expect(linhas[0]?.orcamento).toBe(orcamentoFromCalculoOr("56423"));
    expect(linhas[0]?.orcamento).not.toBe(99999);
    expect(linhas[0]?.descricao).toBe("Sacola G - Tea Shop");
    expect(linhas[0]?.tipo).toBe("Colaboração");
    expect(linhas[0]?.tipoNegocio).toBe("JIT (MTS)");
    expect(linhas[0]?.temperatura).toBe("Frio");
  });

  it("não importa sem código e descarta o que cai fora do horizonte", () => {
    expect(doDeal(tratamento.linhas, 910005)).toHaveLength(0);
    expect(tratamento.alertas.some(alerta => alerta.dealId === 910005 && alerta.tipo === "sem_codigo")).toBe(true);
    expect(doDeal(tratamento.linhas, 910006)).toHaveLength(0);
    expect(tratamento.alertas.some(alerta => alerta.dealId === 910006 && alerta.tipo === "fora_horizonte")).toBe(true);

    const parcial = doDeal(tratamento.linhas, 910007);
    expect(parcial).toHaveLength(1);
    expect(parcial[0]?.dataFaturamento).toBe("2027-11-01");
    expect(parcial[0]?.qtdMes).toBe(3);
    expect(parcial[0]?.valorTotalMes).toBe(3.33);
    expect(parcial[0]?.tipoNegocio).toBe("ATD");
    expect(tratamento.parcelasFora).toBeGreaterThanOrEqual(3);
  });

  it("a prévia soma o horizonte e compara com a carga atual", () => {
    const previa = montarPreviaCrm({
      anoInicio: 2026,
      mesInicio: 11,
      tratamento,
      cargaAtual: [
        { marca: "Aurora", valorVenda: 2, meses: [10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
      ],
    });
    expect(previa.totais.parcelas).toBe(tratamento.linhas.length);
    expect(previa.totais.quantidade).toBe(soma(tratamento.linhas, "qtdMes"));
    expect(previa.totais.valor).toBe(soma(tratamento.linhas, "valorTotalMes"));
    expect(previa.meses[0]?.rotulo).toBe("dez/2026");
    expect(previa.meses[0]?.antesQtd).toBe(10);
    expect(previa.meses[0]?.antesValor).toBe(20);
    expect(previa.meses[0]?.depoisQtd).toBeGreaterThan(0);
    expect(previa.contagens.sem_codigo).toBeGreaterThan(0);
    expect(previa.contagens.generico_sem_calculo).toBeGreaterThan(0);
  });

  it("o mapeador gera as mesmas linhas que o Excel A–Q e que o parser das 15 colunas", () => {
    const extraido = extrairLinhasExportacao(pacoteFicticio(), config);
    const comparaveis = extraido.linhas.filter(linha => linha.dealId !== 910004);
    const lidas = parseMatrizExportacaoAq(linhasExportacaoParaMatriz(comparaveis));
    expect(assinatura(lidas)).toEqual(assinatura(comparaveis));
    expect(tratarLinhasExportacao(lidas, CONTEXTO_FICTICIO).linhas).toEqual(
      tratarLinhasExportacao(comparaveis, CONTEXTO_FICTICIO).linhas
    );

    const matriz = [
      [...CRM_EXCEL_HEADERS],
      ...tratamento.linhas.map(linha => [
        linha.marca,
        linha.gestor,
        `${linha.sku}-${linha.descricao}`,
        linha.valorVenda,
        linha.qtdMes,
        linha.valorTotalMes,
        linha.orcamento ? String(linha.orcamento) : "",
        1,
        linha.qtdMes,
        linha.valorTotalMes,
        linha.dataFaturamento,
        linha.modalidade,
        linha.tipoNegocio,
        linha.tipo,
        linha.temperatura,
      ]),
    ];
    const sheet = XLSX.utils.aoa_to_sheet(matriz);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "CRM");
    const buffer = XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const parsed = parseCrmExcel(buffer);
    expect(parsed.rows).toHaveLength(tratamento.linhas.length);
    tratamento.linhas.forEach((linha, index) => {
      const excel = parsed.rows[index];
      expect(excel?.sku).toBe(linha.sku);
      expect(excel?.descricao).toBe(linha.descricao);
      expect(excel?.marca).toBe(linha.marca);
      expect(excel?.gestor).toBe(linha.gestor);
      expect(excel?.tipo).toBe(linha.tipo);
      expect(excel?.tipoNegocio).toBe(linha.tipoNegocio);
      expect(excel?.temperatura).toBe(linha.temperatura);
      expect(excel?.modalidade).toBe(linha.modalidade);
      expect(excel?.orcamento).toBe(linha.orcamento);
      expect(excel?.qtdMes).toBe(linha.qtdMes);
      expect(excel?.dataFaturamento).toBe(linha.dataFaturamento);
      expect(excel?.valorVenda).toBeCloseTo(linha.valorVenda, 2);
    });
  });
});
