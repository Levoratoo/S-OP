import { CONFIG_PIPEDRIVE_PADRAO } from "@shared/pipedrive-config";
import type {
  CampoPipedrive,
  DealPipedrive,
  DealProdutoPipedrive,
  PacotePipedrive,
} from "@shared/pipedrive-crm";

const C = CONFIG_PIPEDRIVE_PADRAO.campos;

export const CONTEXTO_FICTICIO = {
  anoInicio: 2026,
  mesInicio: 11,
  gestores: ["Ana Souza", "Bruno Lima"],
  produtos: [
    { codigo: "80.01.000001", descricao: "Sacola específica Aurora" },
    { codigo: "80.02.000002", descricao: "SKU GENÉRICO - ENVELOPE" },
  ],
  dePara: [] as Array<{ skuAntigo: string; skuNovo: string }>,
};

function camposDeal(): CampoPipedrive[] {
  return [
    {
      key: "label",
      name: "Etiqueta",
      options: [
        { id: 3257, label: "Ciclo" },
        { id: 3168, label: "Cliente Novo" },
        { id: 3171, label: "RECOMPRA/REATIVAÇÃO (podemos perder o pedido)" },
        { id: 27, label: "Repetição (pedido garantido)" },
        { id: 3251, label: "Frio" },
        { id: 3252, label: "Morno" },
        { id: 3253, label: "Quente" },
        { id: 3263, label: "Contas Chaves" },
        { id: 3226, label: "Exportação" },
      ],
    },
    { key: C.marca, name: "Marca" },
    { key: C.calculo, name: "Número do Cálculo (Deal)", field_type: "text" },
    {
      key: C.entregasTexto,
      name: "Quantidade de Entregas (Se tiver) - COLOCAR SÓ NÚMEROS",
      field_type: "text",
    },
    { key: C.entregasNumero, name: "Quantidade de Entregas", field_type: "double" },
    {
      key: C.tipo,
      name: "Tipo",
      options: [
        { id: 941, label: "PRG" },
        { id: 939, label: "JIT (MTO)" },
        { id: 3293, label: "JIT (MTS)" },
        { id: 938, label: "ATD" },
      ],
    },
  ];
}

function custom(input: {
  marca?: string;
  calculo?: string;
  entregas?: string;
  legado?: number | null;
  tipo?: number;
}) {
  return {
    [C.marca]: input.marca ?? "Aurora",
    [C.calculo]: input.calculo ?? "",
    [C.entregasTexto]: input.entregas ?? "1",
    [C.entregasNumero]: input.legado ?? null,
    [C.tipo]: input.tipo ?? 941,
  };
}

function deal(parcial: Partial<DealPipedrive> & Pick<DealPipedrive, "id">): DealPipedrive {
  return {
    title: `Negócio fictício ${parcial.id}`,
    owner_id: 1,
    org_id: 50,
    stage_id: 38,
    pipeline_id: 6,
    status: "open",
    label_ids: [3257, 3171],
    is_deleted: false,
    is_archived: false,
    expected_close_date: "2027-02-01",
    custom_fields: custom({}),
    ...parcial,
  };
}

function produtoDeal(
  parcial: Partial<DealProdutoPipedrive> & Pick<DealProdutoPipedrive, "id" | "deal_id">
): DealProdutoPipedrive {
  return {
    product_id: parcial.id,
    name: "80.01.000001-Sacola Aurora",
    item_price: 2,
    quantity: 10,
    sum: 20,
    comments: "",
    is_enabled: true,
    ...parcial,
  };
}

/** Oito negócios fictícios no formato da API v2, mais exclusões de funil/etiqueta. */
export function pacoteFicticio(): PacotePipedrive {
  const deals: DealPipedrive[] = [
    deal({
      id: 910001,
      title: "Aurora 12 entregas",
      owner_id: 1,
      label_ids: [3257, 3171, 3252, 3263],
      expected_close_date: "2026-12-15",
      custom_fields: custom({
        marca: "Aurora ",
        calculo: "61888\n61889\n63162",
        entregas: "12",
        tipo: 941,
      }),
    }),
    deal({
      id: 910002,
      title: "Cliente novo genérico",
      owner_id: 2,
      label_ids: [3257, 3168],
      expected_close_date: "2027-01-10",
      custom_fields: custom({ marca: "Boreal", entregas: "1", calculo: "", tipo: 939 }),
    }),
    deal({
      id: 910003,
      title: "Prefixo duplicado",
      owner_id: 3,
      label_ids: [3257, 3171, 3253, 3226],
      expected_close_date: "2027-03-01",
      custom_fields: custom({ marca: "Boreal", entregas: "NA", tipo: 941 }),
    }),
    deal({
      id: 910004,
      title: "Código invertido",
      owner_id: 2,
      label_ids: [3257, 27, 3251],
      expected_close_date: "2027-08-01",
      custom_fields: custom({
        marca: "Aurora",
        calculo: "99999/2",
        entregas: "",
        legado: 2,
        tipo: 3293,
      }),
    }),
    deal({
      id: 910005,
      title: "Sem código",
      owner_id: 1,
      label_ids: [3257, 3168],
      expected_close_date: "2027-02-01",
      custom_fields: custom({ entregas: "1" }),
    }),
    deal({
      id: 910006,
      title: "Fora do horizonte",
      owner_id: 1,
      expected_close_date: "2026-10-01",
      custom_fields: custom({ entregas: "1" }),
    }),
    deal({
      id: 910007,
      title: "Vira o ano do horizonte",
      owner_id: 1,
      label_ids: [3257, 27],
      expected_close_date: "2027-11-01",
      custom_fields: custom({ entregas: "3", tipo: 938 }),
    }),
    deal({
      id: 910008,
      title: "Cliente novo específico",
      owner_id: 1,
      label_ids: [3257, 3168, 3253],
      expected_close_date: "2027-04-01",
      custom_fields: custom({ marca: "Aurora", calculo: "", entregas: "1", tipo: 941 }),
    }),
    deal({
      id: 910009,
      title: "Outro funil",
      pipeline_id: 8,
      label_ids: [3257, 3171],
    }),
    deal({
      id: 910010,
      title: "Sem etiqueta Ciclo",
      label_ids: [3171, 3252],
    }),
    deal({
      id: 910011,
      title: "Apagado",
      is_deleted: true,
    }),
    deal({
      id: 910012,
      title: "Ganho",
      status: "won",
    }),
    deal({
      id: 910014,
      title: "Ciclo sem produto",
      label_ids: [3257],
    }),
  ];

  const dealProducts: DealProdutoPipedrive[] = [
    produtoDeal({
      id: 1,
      deal_id: 910001,
      product_id: 101,
      name: "80.01.000001-Sacola Aurora",
      item_price: 2,
      quantity: 5_000_000,
      sum: 10_000_000,
    }),
    produtoDeal({
      id: 2,
      deal_id: 910002,
      product_id: 102,
      name: "80.02.000002-SKU GENÉRICO - ENVELOPE",
      item_price: 1.5,
      quantity: 1000,
      sum: 1500,
    }),
    produtoDeal({
      id: 3,
      deal_id: 910003,
      product_id: 103,
      name: "80.03.000003 : 80.03.000003 - Sacola  Reciclável",
      item_price: 0,
      quantity: 100,
      sum: 0,
    }),
    produtoDeal({
      id: 4,
      deal_id: 910004,
      product_id: 104,
      name: "80.04.000004",
      item_price: 5,
      quantity: 7,
      sum: 10.01,
      comments: "56423",
    }),
    produtoDeal({
      id: 5,
      deal_id: 910005,
      product_id: 105,
      name: "envelope e-commerce genérico",
      item_price: 3,
      quantity: 20,
      sum: 60,
    }),
    produtoDeal({
      id: 6,
      deal_id: 910006,
      product_id: 101,
      quantity: 50,
      sum: 100,
    }),
    produtoDeal({
      id: 7,
      deal_id: 910007,
      product_id: 101,
      item_price: 1,
      quantity: 10,
      sum: 10,
    }),
    produtoDeal({
      id: 8,
      deal_id: 910008,
      product_id: 108,
      name: null,
      item_price: 4,
      quantity: 8,
      sum: 32,
    }),
    produtoDeal({
      id: 9,
      deal_id: 910008,
      product_id: 109,
      name: "80.09.000009-Desabilitado",
      is_enabled: false,
    }),
    produtoDeal({ id: 10, deal_id: 910009, product_id: 101, quantity: 999, sum: 999 }),
    produtoDeal({ id: 11, deal_id: 910010, product_id: 101 }),
  ];

  return {
    deals,
    dealProducts,
    products: [
      { id: 101, name: "80.01.000001-Sacola Aurora", code: "80.01.000001" },
      { id: 102, name: "80.02.000002-SKU GENÉRICO - ENVELOPE", code: "80.02.000002" },
      { id: 103, name: "80.03.000003-Sacola", code: "80.03.000003" },
      {
        id: 104,
        name: "80.04.000004",
        code: "Sacola  G - Tea Shop",
        custom_fields: { [C.produtoCalculo]: "11111" },
      },
      { id: 105, name: "envelope e-commerce genérico", code: "NAO-E-SKU" },
      {
        id: 108,
        name: "Caixa  especial",
        code: "80.05.000005",
        custom_fields: { [C.produtoCalculo]: "4242" },
      },
      { id: 109, name: "80.09.000009-Desabilitado", code: "80.09.000009" },
    ],
    organizations: [{ id: 50, name: "Cliente Aurora Ltda" }],
    users: [
      { id: 1, name: "ana souza" },
      { id: 2, name: "Bruno Lima" },
      { id: 3, name: "Pessoa Sem Cadastro" },
    ],
    stages: [{ id: 38, name: "Identificar necessidades" }],
    pipelines: [
      { id: 6, name: "Pipeline de Vendas" },
      { id: 8, name: "Contratos" },
    ],
    dealFields: camposDeal(),
    productFields: [{ key: C.produtoCalculo, name: "Número do Cálculo" }],
  };
}
