/**
 * Nomes físicos das colunas no MariaDB (snake_case onde o Drizzle usa camelCase no TS).
 * Use em SQL cru; os testes validam que os serviços não referenciam aliases errados.
 */
export const SQL_PHYSICAL = {
  de_para_codigos: {
    sku_antigo: "sku_antigo",
    sku_novo: "sku_novo",
  },
  produtos: {
    codItem: "codItem",
    codigo: "codigo",
    descricao: "descricao",
    nome: "nome",
    marca: "marca",
  },
  carteira_pv_entregas: {
    codigo: "codigo",
    sku: "sku",
    precoUnitario: "precoUnitario",
    anoEnt: "anoEnt",
    mesEnt: "mesEnt",
    quantidade: "quantidade",
    receitaBruta: "receitaBruta",
  },
  faturamento: {
    codMaterial: "codMaterial",
    descricaoItem: "descricaoItem",
    marca: "marca",
    dataEmissao: "dataEmissao",
    tipoFaturamento: "tipoFaturamento",
    qtd: "qtd",
    valorTotal: "valorTotal",
  },
} as const;