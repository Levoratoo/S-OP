import { carregarConfigPipedrive, type ConfigPipedrive } from "@shared/pipedrive-config";
import {
  canonicoPreviaPipedrive,
  cicloAceitaSyncPipedrive,
  extrairLinhasExportacao,
  mensagemSyncPipedriveRecusada,
  montarPreviaCrm,
  prepararItemCrm,
  tratarLinhasExportacao,
  type CargaCrmResumo,
  type ContextoTratamentoCrm,
  type LinhaCrmTratada,
  type PacotePipedrive,
  type PreviaCrm,
  type ResultadoTratamento,
} from "@shared/pipedrive-crm";
import { isCicloSomenteLeitura } from "@shared/ciclo-status";
import { hashPreviaPipedrive } from "./hash";

export class PipedriveSyncError extends Error {
  constructor(
    message: string,
    readonly codigo:
      | "SEM_TOKEN"
      | "CICLO_AUSENTE"
      | "SOMENTE_LEITURA"
      | "CONSENSO"
      | "FORA_COLABORACAO"
      | "HASH_DIVERGENTE"
      | "VAZIO"
      | "SEM_SNAPSHOT"
  ) {
    super(message);
    this.name = "PipedriveSyncError";
  }
}

export type CicloPipedrive = {
  id: number;
  status: string;
  anoInicio: number;
  mesInicio: number;
};

export type MaterializacaoCrm = {
  itens: object[];
  skusCriados: string[];
  erros: string[];
  avisos: string[];
  foraHorizonte: number;
};

export type RegistroSync = {
  id: number;
  cicloId: number;
  usuario: string | null;
  previewHash: string;
  negocios: number;
  linhas: number;
  quantidade: number;
  valor: number;
  alertasQtd: number;
  totaisJson: string;
  snapshotJson: string;
  createdAt: string;
  desfeitoEm: string | null;
};

export type NovoRegistroSync = {
  cicloId: number;
  usuario: string;
  previewHash: string;
  negocios: number;
  linhas: number;
  quantidade: number;
  valor: number;
  alertasQtd: number;
  totaisJson: string;
  snapshotJson: string;
};

export type TransacaoPipedrive = {
  statusCiclo: (cicloId: number) => Promise<string | null>;
  snapshotCarga: (cicloId: number) => Promise<object[]>;
  substituirCarga: (cicloId: number, itens: object[]) => Promise<void>;
  registrarSync: (registro: NovoRegistroSync) => Promise<void>;
  registrarHistorico: (entrada: {
    cicloId: number;
    status: string;
    usuario: string;
    comentario: string;
  }) => Promise<void>;
  ultimaSync: (cicloId: number) => Promise<RegistroSync | null>;
  marcarDesfeita: (id: number, quando: Date) => Promise<void>;
  substituirNegocios: (
    cicloId: number,
    parcelas: NonNullable<ResultadoTratamento["parcelasNegocio"]>
  ) => Promise<void>;
  limparNegocios: (cicloId: number) => Promise<void>;
};

export type RepositorioPipedrive = {
  obterCiclo: (cicloId: number) => Promise<CicloPipedrive | null>;
  listarGestores: () => Promise<string[]>;
  listarProdutos: () => Promise<Array<{ codigo: string; descricao: string | null; marca?: string | null }>>;
  listarDePara: () => Promise<Array<{ skuAntigo: string; skuNovo: string }>>;
  listarCargaCrm: (cicloId: number) => Promise<CargaCrmResumo[]>;
  materializar: (cicloId: number, linhas: LinhaCrmTratada[]) => Promise<MaterializacaoCrm>;
  transacao: <T>(fn: (tx: TransacaoPipedrive) => Promise<T>) => Promise<T>;
  ultimaSincronizacao: (cicloId: number) => Promise<RegistroSync | null>;
};

export type PreviaPipedrive = PreviaCrm & { previewHash: string };

export function assertCicloAceitaSyncPipedrive(status: string) {
  if (cicloAceitaSyncPipedrive(status)) return;
  const codigo = isCicloSomenteLeitura(status)
    ? "SOMENTE_LEITURA"
    : status === "CONSENSO"
      ? "CONSENSO"
      : "FORA_COLABORACAO";
  throw new PipedriveSyncError(mensagemSyncPipedriveRecusada(status), codigo);
}

function exigirToken(config: ConfigPipedrive) {
  if (!config.token) {
    throw new PipedriveSyncError(
      "Token do Pipedrive não configurado. Defina PIPEDRIVE_API_TOKEN no servidor.",
      "SEM_TOKEN"
    );
  }
}

async function contextoDe(
  repo: RepositorioPipedrive,
  ciclo: CicloPipedrive
): Promise<ContextoTratamentoCrm & { carga: CargaCrmResumo[] }> {
  const [gestores, produtos, dePara, carga] = await Promise.all([
    repo.listarGestores(),
    repo.listarProdutos(),
    repo.listarDePara(),
    repo.listarCargaCrm(ciclo.id),
  ]);
  return {
    anoInicio: ciclo.anoInicio,
    mesInicio: ciclo.mesInicio,
    gestores,
    produtos,
    dePara,
    carga,
  };
}

export function avaliarPacotePipedrive(input: {
  pacote: PacotePipedrive;
  config: ConfigPipedrive;
  cicloId: number;
  ctx: ContextoTratamentoCrm;
}) {
  const extraido = extrairLinhasExportacao(input.pacote, input.config);
  const tratamento = tratarLinhasExportacao(extraido.linhas, input.ctx, extraido);
  const canonico = canonicoPreviaPipedrive({
    cicloId: input.cicloId,
    anoInicio: input.ctx.anoInicio,
    mesInicio: input.ctx.mesInicio,
    pipelineId: extraido.config.pipelineId,
    labelCiclo: extraido.config.labels.ciclo,
    linhas: tratamento.linhas,
    dePara: input.ctx.dePara,
  });
  return { tratamento, hash: hashPreviaPipedrive(canonico) };
}

async function cicloEmColaboracao(repo: RepositorioPipedrive, cicloId: number) {
  const ciclo = await repo.obterCiclo(cicloId);
  if (!ciclo) throw new PipedriveSyncError("Ciclo não encontrado.", "CICLO_AUSENTE");
  assertCicloAceitaSyncPipedrive(ciclo.status);
  return ciclo;
}

export async function previaPipedrive(input: {
  config: ConfigPipedrive;
  repo: RepositorioPipedrive;
  extrair: () => Promise<PacotePipedrive>;
  cicloId: number;
}): Promise<PreviaPipedrive> {
  exigirToken(input.config);
  const ciclo = await cicloEmColaboracao(input.repo, input.cicloId);
  const ctx = await contextoDe(input.repo, ciclo);
  const pacote = await input.extrair();
  const avaliado = avaliarPacotePipedrive({
    pacote,
    config: input.config,
    cicloId: ciclo.id,
    ctx,
  });
  const previa = montarPreviaCrm({
    anoInicio: ciclo.anoInicio,
    mesInicio: ciclo.mesInicio,
    tratamento: avaliado.tratamento,
    cargaAtual: ctx.carga,
    marcasCadastro: ctx.produtos,
    dePara: ctx.dePara,
  });
  return { ...previa, previewHash: avaliado.hash };
}

export async function syncPipedrive(input: {
  config: ConfigPipedrive;
  repo: RepositorioPipedrive;
  extrair: () => Promise<PacotePipedrive>;
  cicloId: number;
  previewHash: string;
  usuario: string;
}): Promise<{
  itensCriados: number;
  skusCriados: string[];
  erros: string[];
  avisos: string[];
  negocios: number;
  linhasProduto: number;
  parcelas: number;
  quantidade: number;
  valor: number;
  alertas: number;
  previewHash: string;
}> {
  exigirToken(input.config);
  const ciclo = await cicloEmColaboracao(input.repo, input.cicloId);
  const ctx = await contextoDe(input.repo, ciclo);
  const pacote = await input.extrair();
  const avaliado = avaliarPacotePipedrive({
    pacote,
    config: input.config,
    cicloId: ciclo.id,
    ctx,
  });
  if (avaliado.hash !== input.previewHash) {
    throw new PipedriveSyncError(
      "Os dados do Pipedrive mudaram desde a prévia. Gere uma nova prévia antes de confirmar.",
      "HASH_DIVERGENTE"
    );
  }
  const materializado = await input.repo.materializar(ciclo.id, avaliado.tratamento.linhas);
  if (materializado.erros.length) {
    throw new PipedriveSyncError(
      `A carga não foi substituída. ${materializado.erros.slice(0, 3).join(" ")}`,
      "VAZIO"
    );
  }
  if (!materializado.itens.length) {
    throw new PipedriveSyncError(
      "Nenhuma parcela do Pipedrive cai no horizonte deste ciclo. A carga CRM atual foi mantida.",
      "VAZIO"
    );
  }
  const previa = montarPreviaCrm({
    anoInicio: ciclo.anoInicio,
    mesInicio: ciclo.mesInicio,
    tratamento: avaliado.tratamento,
    cargaAtual: ctx.carga,
    marcasCadastro: ctx.produtos,
    dePara: ctx.dePara,
  });
  const itens = materializado.itens.map(item => prepararItemCrm(item as Record<string, unknown>, ciclo.id));
  await input.repo.transacao(async tx => {
    const status = await tx.statusCiclo(ciclo.id);
    if (!status) throw new PipedriveSyncError("Ciclo não encontrado.", "CICLO_AUSENTE");
    assertCicloAceitaSyncPipedrive(status);
    const anteriores = await tx.snapshotCarga(ciclo.id);
    await tx.substituirCarga(ciclo.id, itens);
    await tx.substituirNegocios(ciclo.id, avaliado.tratamento.parcelasNegocio ?? []);
    await tx.registrarSync({
      cicloId: ciclo.id,
      usuario: input.usuario,
      previewHash: avaliado.hash,
      negocios: previa.totais.negocios,
      linhas: previa.totais.parcelas,
      quantidade: previa.totais.quantidade,
      valor: previa.totais.valor,
      alertasQtd: avaliado.tratamento.alertas.length,
      totaisJson: JSON.stringify({ totais: previa.totais, contagens: previa.contagens }),
      snapshotJson: JSON.stringify(anteriores),
    });
    await tx.registrarHistorico({
      cicloId: ciclo.id,
      status,
      usuario: input.usuario,
      comentario: `Sincronização do Pipedrive: ${materializado.itens.length} itens, ${previa.totais.quantidade} un., R$ ${previa.totais.valor}, ${avaliado.tratamento.alertas.length} alertas.`,
    });
  });
  return {
    itensCriados: materializado.itens.length,
    skusCriados: materializado.skusCriados,
    erros: materializado.erros,
    avisos: materializado.avisos,
    negocios: previa.totais.negocios,
    linhasProduto: previa.totais.linhasProduto,
    parcelas: previa.totais.parcelas,
    quantidade: previa.totais.quantidade,
    valor: previa.totais.valor,
    alertas: avaliado.tratamento.alertas.length,
    previewHash: avaliado.hash,
  };
}

export async function desfazerPipedrive(input: {
  repo: RepositorioPipedrive;
  cicloId: number;
  usuario?: string;
}): Promise<{ itensRestaurados: number }> {
  const ciclo = await cicloEmColaboracao(input.repo, input.cicloId);
  return input.repo.transacao(async tx => {
    const status = await tx.statusCiclo(ciclo.id);
    if (!status) throw new PipedriveSyncError("Ciclo não encontrado.", "CICLO_AUSENTE");
    assertCicloAceitaSyncPipedrive(status);
    const ultima = await tx.ultimaSync(ciclo.id);
    if (!ultima || ultima.desfeitoEm) {
      throw new PipedriveSyncError(
        "Não há sincronização do Pipedrive para desfazer neste ciclo.",
        "SEM_SNAPSHOT"
      );
    }
    const bruto = JSON.parse(ultima.snapshotJson) as unknown;
    if (!Array.isArray(bruto)) {
      throw new PipedriveSyncError("O snapshot da carga anterior está inválido.", "SEM_SNAPSHOT");
    }
    const itens = bruto.map(item => prepararItemCrm(item as Record<string, unknown>, ciclo.id));
    await tx.substituirCarga(ciclo.id, itens);
    await tx.limparNegocios(ciclo.id);
    await tx.marcarDesfeita(ultima.id, new Date());
    await tx.registrarHistorico({
      cicloId: ciclo.id,
      status,
      usuario: input.usuario || "sistema",
      comentario: `Desfeita a última sincronização do Pipedrive (${itens.length} itens da carga CRM restaurados).`,
    });
    return { itensRestaurados: itens.length };
  });
}

export async function statusPipedrive(input: {
  config?: ConfigPipedrive;
  repo: RepositorioPipedrive;
  cicloId: number;
}) {
  const config = input.config ?? carregarConfigPipedrive();
  const ultima = await input.repo.ultimaSincronizacao(input.cicloId);
  return {
    tokenConfigurado: Boolean(config.token),
    ultima,
  };
}
