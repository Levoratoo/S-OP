import { describe, expect, it } from "vitest";
import {
  alternarSelecaoProduto,
  contarSkusSemCadastro,
  escolherReferenciaSku,
  itemAceiteCarteira,
  linhasAposCadastro,
  payloadConfirmarReferencias,
  validarParesDePara,
} from "@shared/de-para-combobox";
import { filtrarProdutosBusca } from "@shared/produto-busca";

const catalogo = [
  { codigo: "80.02.000955", descricao: "Sacola EXPP- Pink Cheeks FSC Misto", marca: "Pink Cheeks" },
  { codigo: "80.02.000956", descricao: "Sacola P - Pink Cheeks FSC Misto", marca: "Pink Cheeks" },
  { codigo: "80.04.000010", descricao: "Açúcar União especial", marca: "União" },
  { codigo: "80.01.000001", descricao: "Sacola Aurora", marca: "Aurora" },
];

describe("busca de produtos cadastrados", () => {
  it("acha pelo código e por trechos da descrição sem acento nem caixa", () => {
    expect(filtrarProdutosBusca(catalogo, "000955", 30).map(item => item.codigo)).toEqual(["80.02.000955"]);
    expect(filtrarProdutosBusca(catalogo, "pink che", 30).map(item => item.codigo)).toEqual([
      "80.02.000955",
      "80.02.000956",
    ]);
    expect(filtrarProdutosBusca(catalogo, "ACUCAR uniao", 30).map(item => item.codigo)).toEqual(["80.04.000010"]);
    expect(filtrarProdutosBusca(catalogo, "inexistente", 30)).toEqual([]);
  });
});

describe("seleção De-Para", () => {
  it("acumula vários SKUs antigos e recusa repetir o SKU novo", () => {
    const primeiro = alternarSelecaoProduto([], catalogo[0]!).selecionados;
    const dois = alternarSelecaoProduto(primeiro, catalogo[1]!).selecionados;
    expect(dois.map(item => item.codigo)).toEqual(["80.02.000955", "80.02.000956"]);
    expect(validarParesDePara(dois.map(item => item.codigo), "80.01.000001")).toBeNull();
    const removido = alternarSelecaoProduto(dois, catalogo[0]!).selecionados;
    expect(removido).toHaveLength(1);
    expect(validarParesDePara(["80.01.000001"], "80.01.000001")).toMatch(/não pode ser igual/);
    expect(
      alternarSelecaoProduto([], catalogo[0]!, { proibido: "80.02.000955" }).erro
    ).toMatch(/própria referência/);
  });

  it("troca a sugestão de Skus Novos e envia o SKU escolhido no confirmar", () => {
    let linha = {
      codMaterial: "80.02.000957",
      skuAntigo: "80.02.000955",
      sugestaoCodigo: "80.02.000955",
    };
    const trocada = escolherReferenciaSku(linha, { codigo: "80.01.000001" });
    expect(trocada.erro).toBeNull();
    linha = trocada.linha;
    expect(payloadConfirmarReferencias([linha])).toEqual([
      { codMaterial: "80.02.000957", skuAntigo: "80.01.000001" },
    ]);
    linha = escolherReferenciaSku(linha, "sugestao").linha;
    expect(linha.skuAntigo).toBe("80.02.000955");
    linha = escolherReferenciaSku(linha, "sem").linha;
    expect(payloadConfirmarReferencias([linha])[0]?.skuAntigo).toBeNull();
    expect(escolherReferenciaSku(linha, { codigo: "80.02.000957" }).erro).toMatch(/próprio código/);
  });
});

describe("cadastro a partir da carteira", () => {
  const base = {
    codItem: "80.06.001773",
    descricao: "Sacola P - Alakazoo FSC Misto",
    marca: "Alakazoo",
    tipoNegocio: "PRG",
    precoUnitario: 1.5,
  };

  it("monta o aceite com e sem SKU antigo", () => {
    const sem = itemAceiteCarteira({ ...base, skuAntigo: null });
    expect(sem.erro).toBeNull();
    expect(sem.item).toMatchObject({
      codMaterial: "80.06.001773",
      skuAntigo: null,
      cadastro: { descricao: base.descricao, tipoNegocio: "PRG", precoUnitario: 1.5 },
    });
    const com = itemAceiteCarteira({ ...base, skuAntigo: "80.01.000001" });
    expect(com.item?.skuAntigo).toBe("80.01.000001");
    expect(itemAceiteCarteira({ ...base, skuAntigo: "80.06.001773" }).erro).toMatch(/próprio item/);
    expect(itemAceiteCarteira({ ...base, descricao: "  ", skuAntigo: null }).erro).toMatch(/descrição/);
  });

  it("tira o badge de todas as linhas do mesmo código", () => {
    const rows = [
      { codItem: "80.06.001773", semCadastro: true },
      { codItem: "80.06.001773", semCadastro: true },
      { codItem: "80.03.002343", semCadastro: true },
    ];
    expect(contarSkusSemCadastro(rows)).toBe(2);
    const depois = linhasAposCadastro(rows, "80.06.001773");
    expect(depois.filter(row => row.codItem === "80.06.001773").every(row => !row.semCadastro)).toBe(true);
    expect(contarSkusSemCadastro(depois)).toBe(1);
  });
});
