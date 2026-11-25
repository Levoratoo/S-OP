/**
 * Constantes da conta Printbag no Pipedrive.
 * Os hashes e ids vêm do mapa validado em 25/11/2026 e podem ser
 * sobrescritos por variável de ambiente. Se um hash sumir do /v1/dealFields,
 * a resolução por nome em `resolverCamposPipedrive` assume o campo novo.
 */

export type ConfigPipedrive = {
  apiBase: string;
  token: string;
  pipelineId: number;
  labels: {
    ciclo: number;
    clienteNovo: number;
    recompra: number;
    repeticao: number;
    frio: number;
    morno: number;
    quente: number;
  };
  campos: {
    marca: string;
    calculo: string;
    entregasTexto: string;
    entregasNumero: string;
    tipo: string;
    produtoCalculo: string;
  };
  tiposPorId: Record<string, string>;
};

export const PIPEDRIVE_API_BASE_PADRAO = "https://api.pipedrive.com";

export const CONFIG_PIPEDRIVE_PADRAO: ConfigPipedrive = {
  apiBase: PIPEDRIVE_API_BASE_PADRAO,
  token: "",
  pipelineId: 6,
  labels: {
    ciclo: 3257,
    clienteNovo: 3168,
    recompra: 3171,
    repeticao: 27,
    frio: 3251,
    morno: 3252,
    quente: 3253,
  },
  campos: {
    marca: "b964a5c63a76b1f6c3c4c3460eff8383c1b710e7",
    calculo: "38adbe9b848685584d240665b6b8e6e9477bdf35",
    entregasTexto: "1c824b5b35a340d1151934bc1f6b0f7160822a86",
    entregasNumero: "824dd74944397ebf1a9e5233ed1aa73353315899",
    tipo: "e951528b28949ffaa019c0907c58a7da59a16031",
    produtoCalculo: "3870d65d3e39eba656eaa28fc20a595fff629f9d",
  },
  tiposPorId: {
    "941": "PRG",
    "939": "JIT (MTO)",
    "3293": "JIT (MTS)",
    "938": "ATD",
    "940": "Outros",
    "942": "VAR",
    "943": "VDS",
  },
};

export type EnvPipedrive = Record<string, string | undefined>;

function inteiro(env: EnvPipedrive, nome: string, fallback: number): number {
  const bruto = env[nome]?.trim();
  if (!bruto) return fallback;
  const n = Number(bruto);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function texto(env: EnvPipedrive, nome: string, fallback: string): string {
  const bruto = env[nome]?.trim();
  return bruto || fallback;
}

/** Domínio nu não troca o host: o token da API já escolhe a conta em api.pipedrive.com. */
export function resolverBasePipedrive(env: EnvPipedrive): string {
  const base = env.PIPEDRIVE_API_BASE?.trim();
  if (base) return base.replace(/\/+$/, "");
  const dominio = env.PIPEDRIVE_COMPANY_DOMAIN?.trim();
  if (dominio && /^https?:\/\//i.test(dominio)) return dominio.replace(/\/+$/, "");
  return PIPEDRIVE_API_BASE_PADRAO;
}

export function carregarConfigPipedrive(env: EnvPipedrive = process.env): ConfigPipedrive {
  const padrao = CONFIG_PIPEDRIVE_PADRAO;
  return {
    apiBase: resolverBasePipedrive(env),
    token: env.PIPEDRIVE_API_TOKEN?.trim() ?? "",
    pipelineId: inteiro(env, "PIPEDRIVE_PIPELINE_ID", padrao.pipelineId),
    labels: {
      ciclo: inteiro(env, "PIPEDRIVE_LABEL_CICLO", padrao.labels.ciclo),
      clienteNovo: inteiro(env, "PIPEDRIVE_LABEL_CLIENTE_NOVO", padrao.labels.clienteNovo),
      recompra: inteiro(env, "PIPEDRIVE_LABEL_RECOMPRA", padrao.labels.recompra),
      repeticao: inteiro(env, "PIPEDRIVE_LABEL_REPETICAO", padrao.labels.repeticao),
      frio: inteiro(env, "PIPEDRIVE_LABEL_FRIO", padrao.labels.frio),
      morno: inteiro(env, "PIPEDRIVE_LABEL_MORNO", padrao.labels.morno),
      quente: inteiro(env, "PIPEDRIVE_LABEL_QUENTE", padrao.labels.quente),
    },
    campos: {
      marca: texto(env, "PIPEDRIVE_FIELD_MARCA", padrao.campos.marca),
      calculo: texto(env, "PIPEDRIVE_FIELD_CALCULO", padrao.campos.calculo),
      entregasTexto: texto(env, "PIPEDRIVE_FIELD_ENTREGAS_TEXTO", padrao.campos.entregasTexto),
      entregasNumero: texto(env, "PIPEDRIVE_FIELD_ENTREGAS_NUMERO", padrao.campos.entregasNumero),
      tipo: texto(env, "PIPEDRIVE_FIELD_TIPO", padrao.campos.tipo),
      produtoCalculo: texto(env, "PIPEDRIVE_FIELD_PRODUTO_CALCULO", padrao.campos.produtoCalculo),
    },
    tiposPorId: { ...padrao.tiposPorId },
  };
}
