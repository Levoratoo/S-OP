/**
 * Tratamento Pipedrive → linhas da carga CRM (o mesmo layout das 15 colunas do Excel).
 *
 * Regras decididas:
 * 1. Negócios abertos do funil configurado com a etiqueta Ciclo. O horizonte do ciclo
 *    descarta parcelas fora de M1–M12 (`filtrarParcelaNoHorizonte` / `tratarLinhaProduto`).
 * 2. Funil só entra se `pipeline_id` for o configurado (`dealNoRecorte`).
 * 3. Cliente Novo é sempre Aposta (`classificarColaboracao`). Recompra e Repetição
 *    seguem a regra já usada na planilha tratada e reforçada em `importCrmParaCiclo`:
 *    descrição/código com “genérico” = Aposta; SKU específico = Colaboração.
 * 4. Etiquetas de modalidade e temperatura viram Tipo do negócio e Tp.
 *    As demais são ignoradas (`classificarEtiquetas`).
 * 5. SKU genérico sem número de cálculo gera alerta e segue na carga
 *    (`alertaGenericoSemCalculo`). O bloqueio do Excel fica desligado na sync.
 * 6. Entregas vazias ou não numéricas viram 1 com alerta (`interpretarEntregas`).
 * 7. A gravação substitui a carga CRM; isto aqui só monta as linhas.
 */
import { cicloHorizonCalendar, cicloHorizonIndexFromCalendar } from "@shared/ciclo-horizon";
import { isCicloSomenteLeitura } from "@shared/ciclo-status";
import { precoUnitario4 } from "@shared/preco-unitario";
import { orcamentoFromCalculoOr } from "@shared/crm-excel-parse";
import { isCrmSkuCodigoValido, textoPareceSkuGenerico } from "@shared/crm-import-helpers";
import {
  type ConfigPipedrive,
  CONFIG_PIPEDRIVE_PADRAO,
} from "@shared/pipedrive-config";

export const PIPEDRIVE_EXPORT_HEADERS = [
  "Negócio - ID",
  "Organização - Nome",
  "Negócio - Marca",
  "Negócio - Proprietário",
  "Negócio - Etapa",
  "Negócio - Data de fechamento esperada",
  "Negócio - Nome do produto",
  "Negócio - Preço do produto",
  "Negócio - Quantidade de produtos",
  "Negócio - Quantia do produto",
  "Negócio - Etiqueta",
  "Negócio - Número do Cálculo (Deal)",
  "Negócio - Quantidade de Entregas (Se tiver) - COLOCAR SÓ NÚMEROS",
  "Negócio - Tipo",
  "Negócio - Código do produto",
  "Negócio - Funil",
  "Organização - Marca",
] as const;

export type TipoAlertaPipedrive =
  | "generico_sem_calculo"
  | "entregas_assumidas"
  | "sem_codigo"
  | "preco_zero"
  | "gestor_nao_encontrado"
  | "sku_fora_cadastro"
  | "fora_horizonte";

export const ROTULOS_ALERTA: Record<TipoAlertaPipedrive, string> = {
  generico_sem_calculo: "Genérico sem cálculo",
  entregas_assumidas: "Entregas assumidas = 1",
  sem_codigo: "Sem código",
  preco_zero: "Preço zero",
  gestor_nao_encontrado: "Gestor não encontrado",
  sku_fora_cadastro: "SKU fora do cadastro",
  fora_horizonte: "Fora do horizonte",
};

export const ORDEM_ALERTAS: TipoAlertaPipedrive[] = [
  "sem_codigo",
  "generico_sem_calculo",
  "entregas_assumidas",
  "preco_zero",
  "gestor_nao_encontrado",
  "sku_fora_cadastro",
  "fora_horizonte",
];

export function gravidadeAlerta(tipo: TipoAlertaPipedrive): "amarelo" | "vermelho" {
  switch (tipo) {
    case "sem_codigo":
    case "fora_horizonte":
      return "vermelho";
    case "generico_sem_calculo":
    case "entregas_assumidas":
    case "preco_zero":
    case "gestor_nao_encontrado":
    case "sku_fora_cadastro":
      return "amarelo";
    default: {
      const nunca: never = tipo;
      return nunca;
    }
  }
}

export type AlertaPipedrive = {
  tipo: TipoAlertaPipedrive;
  dealId: number;
  titulo: string;
  sku: string;
  detalhe: string;
  proprietario: string;
  proprietarioEmail: string;
};

export const COLUNAS_CSV_ALERTAS = [
  { key: "tipo", title: "Alerta" },
  { key: "dealId", title: "Negócio" },
  { key: "titulo", title: "Título" },
  { key: "proprietario", title: "Proprietário" },
  { key: "proprietarioEmail", title: "E-mail do proprietário" },
  { key: "sku", title: "SKU" },
  { key: "detalhe", title: "Detalhe" },
] as const;

export function linhaCsvAlerta(
  alerta: AlertaPipedrive,
  rotulo = ROTULOS_ALERTA[alerta.tipo]
): Record<(typeof COLUNAS_CSV_ALERTAS)[number]["key"], string | number> {
  return {
    tipo: rotulo,
    dealId: alerta.dealId,
    titulo: alerta.titulo,
    proprietario: alerta.proprietario,
    proprietarioEmail: alerta.proprietarioEmail,
    sku: alerta.sku,
    detalhe: alerta.detalhe,
  };
}

export type LinhaCrmTratada = {
  sku: string;
  descricao: string;
  marca: string;
  gestor: string;
  temperatura: string;
  tipo: string;
  orcamento: number;
  dataFaturamento: string;
  qtdMes: number;
  valorVenda: number;
  valorTotalMes: number;
  modalidade: string;
  tipoNegocio: string;
  dealId: number;
};

export type OpcaoCampo = { id: number | string; label?: string; name?: string };

export type CampoPipedrive = {
  id?: number;
  key: string;
  name: string;
  field_type?: string;
  options?: OpcaoCampo[];
};

export type DealPipedrive = {
  id: number;
  title?: string | null;
  owner_id?: number | { id?: number; name?: string | null; email?: string | null } | null;
  /** Campo legado da API v1. A v2 manda `owner_id`. */
  user_id?: number | { id?: number; name?: string | null; email?: string | null } | null;
  org_id?: number | { id?: number; name?: string | null } | null;
  stage_id?: number | null;
  pipeline_id?: number | null;
  status?: string | null;
  expected_close_date?: string | null;
  label_ids?: Array<number | string> | null;
  custom_fields?: Record<string, unknown> | null;
  is_deleted?: boolean | null;
  is_archived?: boolean | null;
};

export type DealProdutoPipedrive = {
  id: number;
  deal_id: number;
  product_id?: number | null;
  name?: string | null;
  item_price?: number | string | null;
  quantity?: number | string | null;
  sum?: number | string | null;
  comments?: string | null;
  is_enabled?: boolean | null;
};

export type ProdutoPipedrive = {
  id: number;
  name?: string | null;
  code?: string | null;
  custom_fields?: Record<string, unknown> | null;
};

export type OrgPipedrive = { id: number; name?: string | null };
export type UsuarioPipedrive = {
  id: number;
  name?: string | null;
  email?: string | Array<{ value?: string | null; primary?: boolean }> | null;
};
export type EtapaPipedrive = { id: number; name?: string | null };
export type FunilPipedrive = { id: number; name?: string | null };

export type PacotePipedrive = {
  deals: DealPipedrive[];
  dealProducts: DealProdutoPipedrive[];
  products: ProdutoPipedrive[];
  organizations: OrgPipedrive[];
  users: UsuarioPipedrive[];
  stages: EtapaPipedrive[];
  pipelines: FunilPipedrive[];
  dealFields: CampoPipedrive[];
  productFields: CampoPipedrive[];
};

export type LinhaExportacaoPipedrive = {
  dealId: number;
  titulo: string;
  organizacao: string;
  marca: string;
  proprietario: string;
  proprietarioEmail: string;
  etapa: string;
  dataFechamento: string;
  nomeProduto: string;
  preco: number;
  quantidade: number;
  valor: number;
  etiquetas: string[];
  calculo: string;
  entregasTexto: string;
  entregasNumeroLegado: number | null;
  tipo: string;
  codigoProduto: string;
  funil: string;
  marcaOrganizacao: string;
};

export type ContextoTratamentoCrm = {
  anoInicio: number;
  mesInicio: number;
  gestores: string[];
  produtos: Array<{ codigo: string; descricao: string | null; marca?: string | null }>;
  dePara: Array<{ skuAntigo: string; skuNovo: string }>;
};

export type ResultadoTratamento = {
  linhas: LinhaCrmTratada[];
  alertas: AlertaPipedrive[];
  negocios: number;
  negociosSemProduto: number;
  linhasProduto: number;
  produtosDesabilitados: number;
  parcelasFora: number;
};

export type MesPreviaCrm = {
  indice: number;
  ano: number;
  mes: number;
  rotulo: string;
  linhas: number;
  antesQtd: number;
  depoisQtd: number;
  antesValor: number;
  depoisValor: number;
};

export type MarcaPreviaCrm = {
  marca: string;
  antesQtd: number;
  depoisQtd: number;
  antesValor: number;
  depoisValor: number;
};

export type CargaCrmResumo = {
  sku?: string | null;
  marca: string | null;
  valorVenda: number;
  meses: number[];
};

export type MarcaCadastroCrm = {
  codigo: string;
  marca?: string | null;
};

export type PreviaCrm = {
  totais: {
    negocios: number;
    negociosSemProduto: number;
    linhasProduto: number;
    parcelas: number;
    parcelasFora: number;
    quantidade: number;
    valor: number;
    produtosDesabilitados: number;
    skusNovos: string[];
  };
  meses: MesPreviaCrm[];
  marcas: MarcaPreviaCrm[];
  alertas: AlertaPipedrive[];
  contagens: Record<TipoAlertaPipedrive, number>;
};

const NOMES_ETIQUETA_PADRAO: Record<number, string> = {
  3168: "Cliente Novo",
  3171: "RECOMPRA/REATIVAÇÃO (podemos perder o pedido)",
  27: "Repetição (pedido garantido)",
  3251: "Frio",
  3252: "Morno",
  3253: "Quente",
  3257: "Ciclo",
};

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function normalizarTexto(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Chave única da marca na prévia: caixa, acento e espaços não separam a mesma marca. */
export function chaveMarcaCrm(nome: string | null | undefined): string {
  return normalizarTexto(nome ?? "") || "sem marca";
}

export function colapsarEspacos(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function rotuloMes(ano: number, mes: number): string {
  const nome = MESES_CURTOS[mes - 1] ?? String(mes);
  return `${nome}/${ano}`;
}

export function separarCodigoProduto(
  nomeRaw: string,
  codigoProdutoRaw: string | null | undefined
): { sku: string | null; descricao: string; semCodigo: boolean } {
  const nome = colapsarEspacos(String(nomeRaw ?? "").replace(/[\r\n]+/g, " "));
  const codigoCampo = colapsarEspacos(String(codigoProdutoRaw ?? "").replace(/[\r\n]+/g, " "));
  const codigoCampoSku = isCrmSkuCodigoValido(codigoCampo) ? codigoCampo : null;
  const encontrados: string[] = nome.match(/\d{2}\.\d{2}\.\d{6}/g) ?? [];
  let sku = encontrados[0] ?? null;
  if (codigoCampoSku && (!sku || encontrados.includes(codigoCampoSku))) sku = codigoCampoSku;
  if (!sku) return { sku: null, descricao: nome || codigoCampo, semCodigo: true };

  const unicos = new Set(encontrados.length ? encontrados : [sku]);
  let resto = nome;
  for (const code of unicos) {
    resto = resto.split(code).join("\u0000");
  }
  resto = colapsarEspacos(resto.replace(/[\s:|\-–]*\u0000[\s:|\-–]*/g, " "));
  let descricao = resto;
  if (!descricao) {
    descricao = codigoCampo && !codigoCampoSku ? codigoCampo : sku;
  }
  return { sku, descricao, semCodigo: false };
}

export type ModalidadeNegocio = "CLIENTE_NOVO" | "RECOMPRA" | "REPETICAO";

export function classificarEtiquetas(nomes: string[]): {
  modalidade: ModalidadeNegocio | null;
  modalidadeRotulo: string;
  temperatura: "" | "Frio" | "Morno" | "Quente";
} {
  let modalidade: ModalidadeNegocio | null = null;
  let modalidadeRotulo = "";
  let temperatura: "" | "Frio" | "Morno" | "Quente" = "";
  for (const nome of nomes) {
    const n = normalizarTexto(nome);
    if (!n || n === "ciclo") continue;
    if (n === "cliente novo") {
      modalidade = "CLIENTE_NOVO";
      modalidadeRotulo = nome.trim();
      continue;
    }
    if (n.includes("recompra")) {
      if (!modalidade) {
        modalidade = "RECOMPRA";
        modalidadeRotulo = nome.trim();
      }
      continue;
    }
    if (n.includes("repeticao")) {
      if (!modalidade) {
        modalidade = "REPETICAO";
        modalidadeRotulo = nome.trim();
      }
      continue;
    }
    if (n === "frio" || n === "morno" || n === "quente") {
      if (!temperatura) {
        temperatura = n === "frio" ? "Frio" : n === "morno" ? "Morno" : "Quente";
      }
    }
  }
  return { modalidade, modalidadeRotulo, temperatura };
}

export function classificarColaboracao(input: {
  modalidade: ModalidadeNegocio | null;
  sku: string | null;
  descricoes: Array<string | null | undefined>;
}): "Aposta" | "Colaboração" {
  if (input.modalidade === "CLIENTE_NOVO") return "Aposta";
  if (textoPareceSkuGenerico(input.sku, ...input.descricoes)) return "Aposta";
  return "Colaboração";
}

export function interpretarEntregas(texto: unknown, legado: unknown): {
  entregas: number;
  alerta: boolean;
  motivo: string;
} {
  const limpo = String(texto ?? "").replace(/[\r\n]+/g, "").trim();
  if (limpo) {
    if (/^\d+$/.test(limpo)) {
      const n = Number(limpo);
      if (!Number.isFinite(n) || n <= 0) {
        return { entregas: 1, alerta: true, motivo: "quantidade de entregas menor ou igual a zero" };
      }
      return { entregas: n, alerta: false, motivo: "" };
    }
    return {
      entregas: 1,
      alerta: true,
      motivo: `quantidade de entregas não numérica (${limpo})`,
    };
  }
  const legadoNum = numeroOuNulo(legado);
  if (legadoNum != null && legadoNum > 0 && Math.abs(legadoNum - Math.round(legadoNum)) < 1e-6) {
    const n = Math.round(legadoNum);
    if (n > 0) return { entregas: n, alerta: false, motivo: "" };
  }
  return { entregas: 1, alerta: true, motivo: "quantidade de entregas vazia" };
}

export function ratearInteiro(total: number, partes: number): number[] {
  const n = Math.max(1, Math.floor(partes));
  const alvo = Math.round(total);
  const base = Math.trunc(alvo / n);
  const resto = alvo - base * n;
  const out = Array.from({ length: n }, () => base);
  out[n - 1] = base + resto;
  return out;
}

/** Rateio monetário na mesma escala de `precoUnitario4` (4 casas). A sobra fica na última parcela. */
export function ratearValor4(total: number, partes: number): number[] {
  const n = Math.max(1, Math.floor(partes));
  const sinal = total < 0 ? -1 : 1;
  const unidades = Math.round(Math.abs(total) * 10000);
  const base = Math.trunc(unidades / n);
  const resto = unidades - base * n;
  const out = Array.from({ length: n }, () => base);
  out[n - 1] = base + resto;
  return out.map(unidade => Number(precoUnitario4((unidade * sinal) / 10000)));
}

export function mesesConsecutivos(isoDate: string, quantidade: number): Array<{ ano: number; mes: number; iso: string }> {
  const match = /^(\d{4})-(\d{2})/.exec(isoDate.trim());
  if (!match) return [];
  const ano0 = Number(match[1]);
  const mes0 = Number(match[2]);
  if (!Number.isFinite(ano0) || mes0 < 1 || mes0 > 12) return [];
  const out: Array<{ ano: number; mes: number; iso: string }> = [];
  for (let i = 0; i < quantidade; i++) {
    const absoluto = ano0 * 12 + (mes0 - 1) + i;
    const ano = Math.floor(absoluto / 12);
    const mes = (absoluto % 12) + 1;
    out.push({ ano, mes, iso: `${ano}-${String(mes).padStart(2, "0")}-01` });
  }
  return out;
}

export function casarGestor(nome: string, gestores: string[]): { gestor: string; encontrado: boolean } {
  const bruto = colapsarEspacos(nome);
  if (!bruto) return { gestor: "", encontrado: false };
  const alvo = normalizarTexto(bruto);
  const hit = gestores.find(gestor => normalizarTexto(gestor) === alvo);
  if (hit) return { gestor: hit, encontrado: true };
  return { gestor: bruto, encontrado: false };
}

function numeroFlex(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const t = value.trim().replace(/\s/g, "");
    if (!t) return 0;
    const normalizado = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
    const n = Number(normalizado);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function numeroOuNulo(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value.trim().replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  if (value && typeof value === "object" && "value" in value) {
    return numeroOuNulo((value as { value: unknown }).value);
  }
  return null;
}

export function customComoTexto(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.value === "string" || typeof obj.value === "number") return String(obj.value);
    if (typeof obj.label === "string") return obj.label;
    if (typeof obj.name === "string") return obj.name;
    if (typeof obj.id === "number" || typeof obj.id === "string") return String(obj.id);
  }
  return "";
}

function idDe(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number(value.trim());
  if (value && typeof value === "object" && "id" in value) return idDe((value as { id: unknown }).id);
  return null;
}

function idsNumericos(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.map(idDe).filter((id): id is number => id != null);
}

function lerEnum(value: unknown, opcoes: Record<string, string>): string {
  if (value == null || value === "") return "";
  if (typeof value === "number" || typeof value === "string") {
    const chave = String(value).trim();
    if (!chave) return "";
    return opcoes[chave] ?? chave;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (obj.id != null && opcoes[String(obj.id)]) return opcoes[String(obj.id)]!;
    if (typeof obj.label === "string" && obj.label.trim()) return obj.label.trim();
    if (obj.value != null) return lerEnum(obj.value, opcoes);
  }
  return "";
}

function nomeOpcao(opcao: OpcaoCampo): string {
  return String(opcao.label ?? opcao.name ?? "").trim();
}

function acharCampo(
  fields: CampoPipedrive[],
  hash: string,
  predicado: (campo: CampoPipedrive) => boolean
): string {
  if (hash && fields.some(campo => campo.key === hash)) return hash;
  return fields.find(predicado)?.key ?? hash;
}

export function resolverCamposPipedrive(
  config: ConfigPipedrive,
  dealFields: CampoPipedrive[],
  productFields: CampoPipedrive[]
): { config: ConfigPipedrive; nomesEtiqueta: Map<number, string>; tiposPorId: Record<string, string> } {
  const marca = acharCampo(dealFields, config.campos.marca, campo => normalizarTexto(campo.name) === "marca");
  const calculo = acharCampo(dealFields, config.campos.calculo, campo => {
    const nome = normalizarTexto(campo.name);
    return nome.includes("numero do calculo");
  });
  const entregasTexto = acharCampo(
    dealFields,
    config.campos.entregasTexto,
    campo => {
      const nome = normalizarTexto(campo.name);
      return nome.includes("colocar") || nome.includes("se tiver");
    }
  );
  const entregasNumero = acharCampo(
    dealFields,
    config.campos.entregasNumero,
    campo => campo.key !== entregasTexto && normalizarTexto(campo.name) === "quantidade de entregas"
  );
  const tipoKey = acharCampo(dealFields, config.campos.tipo, campo => {
    if (normalizarTexto(campo.name) !== "tipo") return false;
    return (campo.options ?? []).some(opcao => /prg|jit|atd/i.test(nomeOpcao(opcao)));
  });
  const produtoCalculo = acharCampo(productFields, config.campos.produtoCalculo, campo =>
    normalizarTexto(campo.name).includes("numero do calculo")
  );

  const tipoCampo = dealFields.find(campo => campo.key === tipoKey);
  const tiposPorId = { ...config.tiposPorId };
  for (const opcao of tipoCampo?.options ?? []) {
    const rotulo = nomeOpcao(opcao);
    if (rotulo) tiposPorId[String(opcao.id)] = rotulo;
  }

  const etiqueta = dealFields.find(campo => {
    const nome = normalizarTexto(campo.name);
    return campo.key === "label" || nome === "etiqueta" || nome === "label";
  });
  const opcoes = etiqueta?.options ?? [];
  const resolverId = (configurado: number, ok: (nome: string) => boolean) => {
    if (opcoes.some(opcao => Number(opcao.id) === configurado)) return configurado;
    const achado = opcoes.find(opcao => ok(normalizarTexto(nomeOpcao(opcao))));
    return achado ? Number(achado.id) : configurado;
  };

  const nomesEtiqueta = new Map<number, string>(Object.entries(NOMES_ETIQUETA_PADRAO).map(([id, nome]) => [Number(id), nome]));
  for (const opcao of opcoes) {
    const rotulo = nomeOpcao(opcao);
    if (rotulo) nomesEtiqueta.set(Number(opcao.id), rotulo);
  }

  return {
    config: {
      ...config,
      labels: {
        ciclo: resolverId(config.labels.ciclo, nome => nome === "ciclo"),
        clienteNovo: resolverId(config.labels.clienteNovo, nome => nome === "cliente novo"),
        recompra: resolverId(config.labels.recompra, nome => nome.includes("recompra")),
        repeticao: resolverId(config.labels.repeticao, nome => nome.includes("repeticao")),
        frio: resolverId(config.labels.frio, nome => nome === "frio"),
        morno: resolverId(config.labels.morno, nome => nome === "morno"),
        quente: resolverId(config.labels.quente, nome => nome === "quente"),
      },
      campos: { marca, calculo, entregasTexto, entregasNumero, tipo: tipoKey, produtoCalculo },
      tiposPorId,
    },
    nomesEtiqueta,
    tiposPorId,
  };
}

function escolherCalculo(comments: unknown, calculoDeal: unknown, calculoProduto: unknown): string {
  const doItem = customComoTexto(comments).replace(/\r/g, "").trim();
  if (doItem && orcamentoFromCalculoOr(doItem) > 0) return doItem;
  const doDeal = customComoTexto(calculoDeal).replace(/\r/g, "").trim();
  if (doDeal) return doDeal;
  return customComoTexto(calculoProduto).replace(/\r/g, "").trim();
}

function nomeRelacionado(
  value: unknown,
  nomes: Map<number, string>
): string {
  const id = idDe(value);
  if (id != null && nomes.has(id)) return nomes.get(id) ?? "";
  if (value && typeof value === "object" && "name" in value) {
    return colapsarEspacos(String((value as { name?: unknown }).name ?? ""));
  }
  return "";
}

export type ProprietarioNegocio = { nome: string; email: string };

/** Nome e e-mail do dono. O mapa vem de `/users` (uma leitura por extração). */
function emailDeUsuario(value: UsuarioPipedrive["email"]): string {
  if (typeof value === "string") return colapsarEspacos(value);
  if (!Array.isArray(value)) return "";
  const primario = value.find(item => item?.primary) ?? value[0];
  return colapsarEspacos(String(primario?.value ?? ""));
}

export function resolverProprietario(
  deal: Pick<DealPipedrive, "owner_id" | "user_id">,
  usuarios: Map<number, ProprietarioNegocio>
): ProprietarioNegocio {
  const fonte = deal.owner_id ?? deal.user_id ?? null;
  const id = idDe(fonte);
  const doCadastro = id != null ? usuarios.get(id) : undefined;
  let nome = doCadastro?.nome ?? "";
  let email = doCadastro?.email ?? "";
  if (fonte && typeof fonte === "object") {
    if (!nome && "name" in fonte) nome = colapsarEspacos(String(fonte.name ?? ""));
    if (!email && "email" in fonte) email = colapsarEspacos(String(fonte.email ?? ""));
  }
  return { nome, email };
}

export function dealNoRecorte(deal: DealPipedrive, config: ConfigPipedrive): boolean {
  if (deal.is_deleted || deal.is_archived) return false;
  if ((deal.status ?? "open") !== "open") return false;
  if (Number(deal.pipeline_id) !== config.pipelineId) return false;
  return idsNumericos(deal.label_ids).includes(config.labels.ciclo);
}

export type ExtracaoExportacao = {
  linhas: LinhaExportacaoPipedrive[];
  negocios: number;
  negociosSemProduto: number;
  linhasProduto: number;
  produtosDesabilitados: number;
  config: ConfigPipedrive;
};

export function extrairLinhasExportacao(pacote: PacotePipedrive, configEntrada: ConfigPipedrive): ExtracaoExportacao {
  const dicionario = resolverCamposPipedrive(configEntrada, pacote.dealFields, pacote.productFields);
  const config = dicionario.config;
  const usuarios = new Map(
    pacote.users.map(usuario => [
      Number(usuario.id),
      {
        nome: colapsarEspacos(usuario.name ?? ""),
        email: emailDeUsuario(usuario.email),
      },
    ])
  );
  const orgs = new Map(pacote.organizations.map(org => [Number(org.id), colapsarEspacos(org.name ?? "")]));
  const etapas = new Map(pacote.stages.map(etapa => [Number(etapa.id), colapsarEspacos(etapa.name ?? "")]));
  const funis = new Map(pacote.pipelines.map(funil => [Number(funil.id), colapsarEspacos(funil.name ?? "")]));
  const produtos = new Map(pacote.products.map(produto => [Number(produto.id), produto]));
  const produtosPorDeal = new Map<number, DealProdutoPipedrive[]>();
  for (const item of pacote.dealProducts) {
    const dealId = Number(item.deal_id);
    const lista = produtosPorDeal.get(dealId) ?? [];
    lista.push(item);
    produtosPorDeal.set(dealId, lista);
  }

  const linhas: LinhaExportacaoPipedrive[] = [];
  let negocios = 0;
  let negociosSemProduto = 0;
  let linhasProduto = 0;
  let produtosDesabilitados = 0;

  for (const deal of pacote.deals) {
    if (!dealNoRecorte(deal, config)) continue;
    const itens = (produtosPorDeal.get(Number(deal.id)) ?? []).slice().sort((a, b) => Number(a.id) - Number(b.id));
    const habilitados = itens.filter(item => item.is_enabled !== false);
    produtosDesabilitados += itens.length - habilitados.length;
    if (!habilitados.length) {
      negociosSemProduto += 1;
      continue;
    }
    negocios += 1;
    linhasProduto += habilitados.length;
    const custom = deal.custom_fields ?? {};
    const etiquetas = idsNumericos(deal.label_ids)
      .map(id => dicionario.nomesEtiqueta.get(id) ?? "")
      .filter(Boolean);
    const data = String(deal.expected_close_date ?? "").trim().slice(0, 10);
    const dono = resolverProprietario(deal, usuarios);
    for (const item of habilitados) {
      const produto = item.product_id != null ? produtos.get(Number(item.product_id)) : undefined;
      const nome = colapsarEspacos(String(item.name ?? "").trim() || String(produto?.name ?? ""));
      const codigo = String(produto?.code ?? "").trim();
      const preco = numeroFlex(item.item_price);
      const quantidade = numeroFlex(item.quantity);
      const somaInformada = item.sum == null || item.sum === "" ? null : numeroFlex(item.sum);
      const valor = somaInformada == null ? Math.round(preco * quantidade * 100) / 100 : somaInformada;
      linhas.push({
        dealId: Number(deal.id),
        titulo: colapsarEspacos(String(deal.title ?? "")) || `Negócio ${deal.id}`,
        organizacao: nomeRelacionado(deal.org_id, orgs),
        marca: customComoTexto(custom[config.campos.marca]).trim(),
        proprietario: dono.nome,
        proprietarioEmail: dono.email,
        etapa: deal.stage_id != null ? etapas.get(Number(deal.stage_id)) ?? "" : "",
        dataFechamento: /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : "",
        nomeProduto: nome,
        preco,
        quantidade,
        valor,
        etiquetas,
        calculo: escolherCalculo(
          item.comments,
          custom[config.campos.calculo],
          produto?.custom_fields?.[config.campos.produtoCalculo]
        ),
        entregasTexto: customComoTexto(custom[config.campos.entregasTexto]),
        entregasNumeroLegado: numeroOuNulo(custom[config.campos.entregasNumero]),
        tipo: lerEnum(custom[config.campos.tipo], dicionario.tiposPorId),
        codigoProduto: codigo,
        funil: deal.pipeline_id != null ? funis.get(Number(deal.pipeline_id)) ?? "" : "",
        marcaOrganizacao: "",
      });
    }
  }

  linhas.sort((a, b) => a.dealId - b.dealId || a.nomeProduto.localeCompare(b.nomeProduto));
  return { linhas, negocios, negociosSemProduto, linhasProduto, produtosDesabilitados, config };
}

const HEADER_EXPORTACAO: Record<string, string> = {
  "negocio - id": "dealId",
  "organizacao - nome": "organizacao",
  "negocio - marca": "marca",
  "negocio - proprietario": "proprietario",
  "negocio - etapa": "etapa",
  "negocio - data de fechamento esperada": "dataFechamento",
  "negocio - nome do produto": "nomeProduto",
  "negocio - preco do produto": "preco",
  "negocio - quantidade de produtos": "quantidade",
  "negocio - quantia do produto": "valor",
  "negocio - etiqueta": "etiquetas",
  "negocio - numero do calculo (deal)": "calculo",
  "negocio - quantidade de entregas (se tiver) - colocar so numeros": "entregasTexto",
  "negocio - tipo": "tipo",
  "negocio - codigo do produto": "codigoProduto",
  "negocio - funil": "funil",
  "organizacao - marca": "marcaOrganizacao",
};

export function linhasExportacaoParaMatriz(linhas: LinhaExportacaoPipedrive[]): unknown[][] {
  return [
    [...PIPEDRIVE_EXPORT_HEADERS],
    ...linhas.map(linha => [
      linha.dealId,
      linha.organizacao,
      linha.marca,
      linha.proprietario,
      linha.etapa,
      linha.dataFechamento,
      linha.nomeProduto,
      linha.preco,
      linha.quantidade,
      linha.valor,
      linha.etiquetas.join(", "),
      linha.calculo,
      linha.entregasTexto,
      linha.tipo,
      linha.codigoProduto,
      linha.funil,
      linha.marcaOrganizacao,
    ]),
  ];
}

export function parseMatrizExportacaoAq(matrix: unknown[][]): LinhaExportacaoPipedrive[] {
  if (!matrix.length) return [];
  const headers = (matrix[0] ?? []).map(cell => normalizarTexto(String(cell ?? "")));
  const idx = new Map<string, number>();
  headers.forEach((header, index) => {
    const campo = HEADER_EXPORTACAO[header];
    if (campo) idx.set(campo, index);
  });
  if (!idx.has("dealId") || !idx.has("nomeProduto")) {
    throw new Error("Planilha A–Q sem as colunas Negócio - ID e Negócio - Nome do produto.");
  }
  const cell = (line: unknown[], campo: string) => {
    const index = idx.get(campo);
    if (index === undefined) return "";
    return line[index] ?? "";
  };
  const linhas: LinhaExportacaoPipedrive[] = [];
  for (let r = 1; r < matrix.length; r++) {
    const line = matrix[r] ?? [];
    const dealId = numeroFlex(cell(line, "dealId"));
    const nomeProduto = colapsarEspacos(String(cell(line, "nomeProduto") ?? ""));
    if (!dealId && !nomeProduto) continue;
    const etiquetasBrutas = String(cell(line, "etiquetas") ?? "");
    const data = String(cell(line, "dataFechamento") ?? "").trim().slice(0, 10);
    linhas.push({
      dealId,
      titulo: `Negócio ${dealId}`,
      organizacao: colapsarEspacos(String(cell(line, "organizacao") ?? "")),
      marca: String(cell(line, "marca") ?? "").trim(),
      proprietario: colapsarEspacos(String(cell(line, "proprietario") ?? "")),
      proprietarioEmail: "",
      etapa: colapsarEspacos(String(cell(line, "etapa") ?? "")),
      dataFechamento: /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : "",
      nomeProduto,
      preco: numeroFlex(cell(line, "preco")),
      quantidade: numeroFlex(cell(line, "quantidade")),
      valor: numeroFlex(cell(line, "valor")),
      etiquetas: etiquetasBrutas.split(",").map(parte => parte.trim()).filter(Boolean),
      calculo: String(cell(line, "calculo") ?? "").replace(/\r/g, "").trim(),
      entregasTexto: String(cell(line, "entregasTexto") ?? ""),
      entregasNumeroLegado: null,
      tipo: String(cell(line, "tipo") ?? "").trim(),
      codigoProduto: String(cell(line, "codigoProduto") ?? "").trim(),
      funil: colapsarEspacos(String(cell(line, "funil") ?? "")),
      marcaOrganizacao: String(cell(line, "marcaOrganizacao") ?? "").trim(),
    });
  }
  return linhas;
}

function mapaDePara(pares: Array<{ skuAntigo: string; skuNovo: string }>): Map<string, string> {
  const map = new Map<string, string>();
  for (const par of pares) {
    const antigo = par.skuAntigo.trim().toUpperCase();
    const novo = par.skuNovo.trim();
    if (!antigo || !novo || antigo === novo.toUpperCase()) continue;
    map.set(antigo, novo);
  }
  return map;
}

function resolverSkuDePara(codigo: string, map: Map<string, string>): string {
  let atual = codigo.trim();
  if (!atual) return atual;
  const seen = new Set<string>();
  let lookup = atual.toUpperCase();
  while (map.has(lookup) && !seen.has(lookup)) {
    seen.add(lookup);
    atual = map.get(lookup)!;
    lookup = atual.toUpperCase();
  }
  return atual;
}

function indiceCatalogo(produtos: ContextoTratamentoCrm["produtos"]) {
  const descricao = new Map<string, string>();
  const existe = new Set<string>();
  for (const produto of produtos) {
    const codigo = produto.codigo.trim().toUpperCase();
    if (!codigo) continue;
    existe.add(codigo);
    if (produto.descricao && !descricao.has(codigo)) descricao.set(codigo, produto.descricao);
  }
  return { descricao, existe };
}

function alerta(
  tipo: TipoAlertaPipedrive,
  linha: Pick<LinhaExportacaoPipedrive, "dealId" | "titulo" | "proprietario" | "proprietarioEmail">,
  sku: string,
  detalhe: string
): AlertaPipedrive {
  return {
    tipo,
    dealId: linha.dealId,
    titulo: linha.titulo,
    sku,
    detalhe,
    proprietario: linha.proprietario,
    proprietarioEmail: linha.proprietarioEmail,
  };
}

export function tratarLinhasExportacao(
  linhas: LinhaExportacaoPipedrive[],
  ctx: ContextoTratamentoCrm,
  meta?: Pick<ResultadoTratamento, "negocios" | "negociosSemProduto" | "linhasProduto" | "produtosDesabilitados">
): ResultadoTratamento {
  const dePara = mapaDePara(ctx.dePara);
  const catalogo = indiceCatalogo(ctx.produtos);
  const saida: LinhaCrmTratada[] = [];
  const alertas: AlertaPipedrive[] = [];
  let parcelasFora = 0;

  for (const linha of linhas) {
    const codigo = separarCodigoProduto(linha.nomeProduto, linha.codigoProduto);
    const classes = classificarEtiquetas(linha.etiquetas);
    const entregas = interpretarEntregas(linha.entregasTexto, linha.entregasNumeroLegado);
    const gestor = casarGestor(linha.proprietario, ctx.gestores);
    const skuResolvido = codigo.sku ? resolverSkuDePara(codigo.sku, dePara) : "";
    const skuValido = Boolean(codigo.sku && isCrmSkuCodigoValido(skuResolvido));
    const descricaoCadastro = skuValido ? catalogo.descricao.get(skuResolvido.toUpperCase()) ?? null : null;
    const colaboracao = classificarColaboracao({
      modalidade: classes.modalidade,
      sku: codigo.sku,
      descricoes: [codigo.descricao, descricaoCadastro, linha.nomeProduto],
    });
    const orcamento = orcamentoFromCalculoOr(linha.calculo);
    const generico = textoPareceSkuGenerico(codigo.sku, codigo.descricao, descricaoCadastro, linha.nomeProduto);

    if (!skuValido) {
      alertas.push(
        alerta(
          "sem_codigo",
          linha,
          codigo.sku ?? "",
          codigo.sku
            ? `código ${codigo.sku} não cabe em NN.NN.NNNNNN após o De-Para (${skuResolvido})`
            : `sem código de SKU em “${linha.nomeProduto || linha.codigoProduto || "produto sem nome"}”`
        )
      );
    }
    if (entregas.alerta) alertas.push(alerta("entregas_assumidas", linha, codigo.sku ?? "", entregas.motivo));
    if (linha.preco <= 0) alertas.push(alerta("preco_zero", linha, codigo.sku ?? "", "preço unitário zero"));
    if (!gestor.encontrado) {
      alertas.push(
        alerta(
          "gestor_nao_encontrado",
          linha,
          codigo.sku ?? "",
          gestor.gestor ? `proprietário “${gestor.gestor}” sem gestor correspondente` : "proprietário vazio"
        )
      );
    }

    const meses = linha.dataFechamento ? mesesConsecutivos(linha.dataFechamento, entregas.entregas) : [];
    const quantidades = ratearInteiro(linha.quantidade, entregas.entregas);
    const valores = ratearValor4(linha.valor, entregas.entregas);
    if (!meses.length) {
      parcelasFora += entregas.entregas;
      alertas.push(alerta("fora_horizonte", linha, codigo.sku ?? "", "sem data de fechamento esperada"));
    }

    const dentro: Array<{ iso: string; qtd: number; valor: number }> = [];
    const fora: string[] = [];
    meses.forEach((mes, index) => {
      const idx = cicloHorizonIndexFromCalendar(ctx.anoInicio, ctx.mesInicio, mes.ano, mes.mes);
      const qtd = quantidades[index] ?? 0;
      const valor = valores[index] ?? 0;
      if (idx == null) {
        if (qtd > 0 || valor > 0) fora.push(rotuloMes(mes.ano, mes.mes));
        return;
      }
      if (qtd > 0) dentro.push({ iso: mes.iso, qtd, valor });
    });
    if (fora.length) {
      parcelasFora += fora.length;
      alertas.push(
        alerta(
          "fora_horizonte",
          linha,
          codigo.sku ?? "",
          `${fora.length} parcela(s) fora do horizonte (${fora.join(", ")})`
        )
      );
    }

    if (!skuValido || !codigo.sku) continue;
    if (generico && colaboracao === "Aposta" && orcamento <= 0) {
      alertas.push(
        alerta(
          "generico_sem_calculo",
          linha,
          codigo.sku,
          "aposta com SKU genérico sem número de cálculo; entra com orçamento vazio"
        )
      );
    }
    if (!dentro.length) continue;
    if (!catalogo.existe.has(skuResolvido.toUpperCase())) {
      alertas.push(
        alerta(
          "sku_fora_cadastro",
          linha,
          codigo.sku,
          skuResolvido.toUpperCase() === codigo.sku.toUpperCase()
            ? `SKU ${codigo.sku} não está no cadastro; será criado na confirmação`
            : `SKU ${codigo.sku} → ${skuResolvido} não está no cadastro; será criado na confirmação`
        )
      );
    }

    dentro.forEach((parcela, index) => {
      saida.push({
        sku: codigo.sku!,
        descricao: codigo.descricao,
        marca: linha.marca.trim(),
        gestor: gestor.gestor,
        temperatura: classes.temperatura,
        tipo: colaboracao,
        orcamento: index === 0 ? orcamento : 0,
        dataFaturamento: parcela.iso,
        qtdMes: parcela.qtd,
        valorVenda: Number(precoUnitario4(linha.preco)),
        valorTotalMes: Number(precoUnitario4(parcela.valor)),
        modalidade: classes.modalidadeRotulo,
        tipoNegocio: linha.tipo.trim(),
        dealId: linha.dealId,
      });
    });
  }

  const ordem = new Map(ORDEM_ALERTAS.map((tipo, index) => [tipo, index]));
  alertas.sort(
    (a, b) =>
      (ordem.get(a.tipo) ?? 0) - (ordem.get(b.tipo) ?? 0) ||
      a.dealId - b.dealId ||
      a.sku.localeCompare(b.sku)
  );

  const negocios = meta?.negocios ?? new Set(linhas.map(linha => linha.dealId)).size;
  return {
    linhas: saida,
    alertas,
    negocios,
    negociosSemProduto: meta?.negociosSemProduto ?? 0,
    linhasProduto: meta?.linhasProduto ?? linhas.length,
    produtosDesabilitados: meta?.produtosDesabilitados ?? 0,
    parcelasFora,
  };
}

export function tratarPacotePipedrive(
  pacote: PacotePipedrive,
  config: ConfigPipedrive,
  ctx: ContextoTratamentoCrm
): ResultadoTratamento {
  const extraido = extrairLinhasExportacao(pacote, config);
  return tratarLinhasExportacao(extraido.linhas, ctx, extraido);
}

function unidadesPreco4(valor: number): number {
  return Math.round((Number(valor) || 0) * 10000);
}

function mapaMarcaCadastro(lista: MarcaCadastroCrm[] | undefined) {
  const map = new Map<string, string>();
  for (const item of lista ?? []) {
    const codigo = item.codigo.trim().toUpperCase();
    const marca = colapsarEspacos(item.marca ?? "");
    if (!codigo || !marca || map.has(codigo)) continue;
    map.set(codigo, marca);
  }
  return map;
}

/**
 * Marca da prévia: a do cadastro do SKU atual (depois do De-Para). Sem cadastro,
 * usa o texto informado, na mesma chave normalizada dos dois lados.
 */
export function resolverMarcaPrevia(
  sku: string | null | undefined,
  informada: string | null | undefined,
  catalogo: Map<string, string>,
  dePara: Map<string, string>
): { chave: string; rotulo: string; cadastro: boolean } {
  const bruto = (sku ?? "").trim();
  const atual = bruto ? resolverSkuDePara(bruto, dePara).trim().toUpperCase() : "";
  const doCadastro = (atual && catalogo.get(atual)) || (bruto && catalogo.get(bruto.toUpperCase())) || "";
  if (doCadastro) return { chave: chaveMarcaCrm(doCadastro), rotulo: doCadastro, cadastro: true };
  const texto = colapsarEspacos(informada ?? "");
  return { chave: chaveMarcaCrm(texto), rotulo: texto || "Sem marca", cadastro: false };
}

export function montarPreviaCrm(input: {
  anoInicio: number;
  mesInicio: number;
  tratamento: ResultadoTratamento;
  cargaAtual: CargaCrmResumo[];
  marcasCadastro?: MarcaCadastroCrm[];
  dePara?: Array<{ skuAntigo: string; skuNovo: string }>;
}): PreviaCrm {
  const meses: MesPreviaCrm[] = Array.from({ length: 12 }, (_, indice) => {
    const cal = cicloHorizonCalendar(input.anoInicio, input.mesInicio, indice);
    return {
      indice,
      ano: cal.year,
      mes: cal.month,
      rotulo: rotuloMes(cal.year, cal.month),
      linhas: 0,
      antesQtd: 0,
      depoisQtd: 0,
      antesValor: 0,
      depoisValor: 0,
    };
  });
  const catalogoMarca = mapaMarcaCadastro(input.marcasCadastro);
  const dePara = mapaDePara(input.dePara ?? []);
  type AccMarca = {
    rotulo: string;
    cadastro: boolean;
    antesQtd: number;
    depoisQtd: number;
    antesCents: number;
    depoisCents: number;
  };
  const marcasMap = new Map<string, AccMarca>();
  const somarMarca = (
    sku: string | null | undefined,
    informada: string | null | undefined,
    qtd: number,
    valorCents: number,
    lado: "antes" | "depois"
  ) => {
    const resolvida = resolverMarcaPrevia(sku, informada, catalogoMarca, dePara);
    const atual = marcasMap.get(resolvida.chave) ?? {
      rotulo: resolvida.rotulo,
      cadastro: resolvida.cadastro,
      antesQtd: 0,
      depoisQtd: 0,
      antesCents: 0,
      depoisCents: 0,
    };
    if (resolvida.cadastro && !atual.cadastro) {
      atual.rotulo = resolvida.rotulo;
      atual.cadastro = true;
    }
    if (lado === "antes") {
      atual.antesQtd += qtd;
      atual.antesCents += valorCents;
    } else {
      atual.depoisQtd += qtd;
      atual.depoisCents += valorCents;
    }
    marcasMap.set(resolvida.chave, atual);
  };

  for (const item of input.cargaAtual) {
    for (let i = 0; i < 12; i++) {
      const qtd = Number(item.meses[i] ?? 0) || 0;
      const valorCents = unidadesPreco4(qtd * item.valorVenda);
      meses[i]!.antesQtd += qtd;
      meses[i]!.antesValor += valorCents;
      somarMarca(item.sku, item.marca, qtd, valorCents, "antes");
    }
  }

  let quantidade = 0;
  let valorCents = 0;
  for (const linha of input.tratamento.linhas) {
    const data = /^(\d{4})-(\d{2})/.exec(linha.dataFaturamento);
    if (!data) continue;
    const indice = cicloHorizonIndexFromCalendar(
      input.anoInicio,
      input.mesInicio,
      Number(data[1]),
      Number(data[2])
    );
    if (indice == null) continue;
    const preco = Number(precoUnitario4(linha.valorVenda > 0 ? linha.valorVenda : 0));
    const linhaCents = unidadesPreco4(linha.qtdMes * preco);
    meses[indice]!.linhas += 1;
    meses[indice]!.depoisQtd += linha.qtdMes;
    meses[indice]!.depoisValor += linhaCents;
    somarMarca(linha.sku, linha.marca, linha.qtdMes, linhaCents, "depois");
    quantidade += linha.qtdMes;
    valorCents += linhaCents;
  }

  for (const mes of meses) {
    mes.antesValor = mes.antesValor / 10000;
    mes.depoisValor = mes.depoisValor / 10000;
  }

  const marcas = Array.from(marcasMap.values()).map(marca => ({
    marca: marca.rotulo,
    antesQtd: marca.antesQtd,
    depoisQtd: marca.depoisQtd,
    antesValor: marca.antesCents / 10000,
    depoisValor: marca.depoisCents / 10000,
  }));
  marcas.sort((a, b) => b.depoisValor - a.depoisValor || b.antesValor - a.antesValor || a.marca.localeCompare(b.marca));

  const contagens = Object.fromEntries(ORDEM_ALERTAS.map(tipo => [tipo, 0])) as Record<TipoAlertaPipedrive, number>;
  for (const item of input.tratamento.alertas) contagens[item.tipo] += 1;
  const skusNovos = Array.from(
    new Set(
      input.tratamento.alertas
        .filter(item => item.tipo === "sku_fora_cadastro" && item.sku)
        .map(item => item.sku)
    )
  ).sort();

  return {
    totais: {
      negocios: input.tratamento.negocios,
      negociosSemProduto: input.tratamento.negociosSemProduto,
      linhasProduto: input.tratamento.linhasProduto,
      parcelas: input.tratamento.linhas.length,
      parcelasFora: input.tratamento.parcelasFora,
      quantidade,
      valor: valorCents / 10000,
      produtosDesabilitados: input.tratamento.produtosDesabilitados,
      skusNovos,
    },
    meses,
    marcas,
    alertas: input.tratamento.alertas,
    contagens,
  };
}

export function canonicoPreviaPipedrive(input: {
  cicloId: number;
  anoInicio: number;
  mesInicio: number;
  pipelineId: number;
  labelCiclo: number;
  linhas: LinhaCrmTratada[];
  dePara: Array<{ skuAntigo: string; skuNovo: string }>;
}) {
  const linhas = input.linhas
    .map(linha => ({
      sku: linha.sku,
      descricao: linha.descricao,
      marca: linha.marca,
      gestor: linha.gestor,
      temperatura: linha.temperatura,
      tipo: linha.tipo,
      orcamento: linha.orcamento,
      dataFaturamento: linha.dataFaturamento,
      qtdMes: linha.qtdMes,
      valorVenda: linha.valorVenda,
      valorTotalMes: linha.valorTotalMes,
      modalidade: linha.modalidade,
      tipoNegocio: linha.tipoNegocio,
      dealId: linha.dealId,
    }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const dePara = input.dePara
    .map(par => ({ skuAntigo: par.skuAntigo.trim().toUpperCase(), skuNovo: par.skuNovo.trim() }))
    .sort((a, b) => a.skuAntigo.localeCompare(b.skuAntigo) || a.skuNovo.localeCompare(b.skuNovo));
  return {
    versao: 1,
    cicloId: input.cicloId,
    anoInicio: input.anoInicio,
    mesInicio: input.mesInicio,
    pipelineId: input.pipelineId,
    labelCiclo: input.labelCiclo,
    dePara,
    linhas,
  };
}

export function paraLinhaImportCrm(linha: LinhaCrmTratada) {
  return {
    sku: linha.sku,
    descricao: linha.descricao,
    marca: linha.marca,
    card: "",
    cliente: "",
    gestor: linha.gestor,
    temperatura: linha.temperatura,
    tipo: linha.tipo,
    orcamento: linha.orcamento,
    dataFaturamento: linha.dataFaturamento,
    qtdMes: linha.qtdMes,
    valorVenda: linha.valorVenda,
    modalidade: linha.modalidade,
    tipoNegocio: linha.tipoNegocio,
  };
}

const CAMPOS_ITEM_CRM = [
  "planoColab",
  "sku",
  "descricao",
  "marca",
  "linha",
  "tipoEstoque",
  "tipoMarcaLinha",
  "projetar",
  "rateio12m",
  "rateio6m",
  "rateioConsiderar",
  "qtdeTotalEstatistica",
  "estatUsouFatorSku",
  "e1",
  "e2",
  "e3",
  "e4",
  "e5",
  "e6",
  "e7",
  "e8",
  "e9",
  "e10",
  "e11",
  "e12",
  "m1",
  "m2",
  "m3",
  "m4",
  "m5",
  "m6",
  "m7",
  "m8",
  "m9",
  "m10",
  "m11",
  "m12",
  "qtdeColaborada",
  "valorVendaSnapshot",
  "familiaSnapshot",
  "gestorSnapshot",
  "crmCard",
  "crmTipo",
  "crmTemperatura",
  "crmModalidade",
  "crmTipoNegocio",
  "crmCliente",
  "crmOrcamento",
  "origem",
] as const;

/** Tira id e carimbos para o INSERT do desfazer não colidir com a chave. */
export function prepararItemCrm(row: Record<string, unknown>, cicloId: number): Record<string, unknown> {
  const sku = String(row.sku ?? "").trim();
  if (!sku) throw new Error("Snapshot CRM sem SKU.");
  const out: Record<string, unknown> = { cicloId, sku };
  for (const campo of CAMPOS_ITEM_CRM) {
    if (campo === "sku") continue;
    if (campo in row) out[campo] = row[campo];
  }
  if (!out.planoColab) out.planoColab = "CRM";
  if (!out.origem) out.origem = "CRM";
  return out;
}

/**
 * Mesmo recorte em que o Excel ainda importa (não é somente leitura) menos CONSENSO.
 * A importação Excel recusa só APROVADO e CONGELADO; a sync do Pipedrive também recusa CONSENSO.
 */
export function cicloAceitaSyncPipedrive(status: string): boolean {
  return status === "ABERTO" || status === "EM_COLABORACAO";
}

export function mensagemSyncPipedriveRecusada(status: string): string {
  if (isCicloSomenteLeitura(status)) {
    return "Ciclo aprovado ou congelado está somente leitura (foto imutável). Não é possível sincronizar o Pipedrive nem desfazer a carga CRM.";
  }
  if (status === "CONSENSO") {
    return "Ciclo em consenso não aceita sincronização do Pipedrive. A importação do Excel continua disponível; a sync do Pipedrive só entra com o ciclo aberto ou em colaboração.";
  }
  return `O status ${status} não aceita sincronização do Pipedrive.`;
}

export function configPadraoParaTeste(): ConfigPipedrive {
  return {
    ...CONFIG_PIPEDRIVE_PADRAO,
    token: "token-de-teste",
    labels: { ...CONFIG_PIPEDRIVE_PADRAO.labels },
    campos: { ...CONFIG_PIPEDRIVE_PADRAO.campos },
    tiposPorId: { ...CONFIG_PIPEDRIVE_PADRAO.tiposPorId },
  };
}
