import { and, eq, inArray, ne } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getCicloComercial, getDb, monthEffectiveQty } from "../db";
import {
  cicloComercialItens,
  cicloSnapshot,
  cicloSnapshotLinhas,
  ciclosComerciais,
  previsaoPythonJobs,
} from "../../drizzle/schema";
import { loadDeParaMap, resolveCodigoAtual } from "./de-para-map";
import { getRealizadoAnualPorSku } from "./ciclo-colab-extras";
import { lerEstatisticaJobs } from "./grade-job-estatistica";
import {
  anosDaGrade,
  chaveMes,
  escolherCicloDoMes,
  escolherCicloRecenteDoMes,
  mesesPassadosGrade,
  resolverPrevistoMes,
  rotuloOrigemPrevisto,
  type CelulaPrevisto,
  type CicloCobertura,
} from "@shared/grade-colab";
import { cicloHorizonCalendar } from "@shared/ciclo-horizon";

type ItemMeses = {
  cicloId: number;
  sku: string;
  m1: string | null;
  m2: string | null;
  m3: string | null;
  m4: string | null;
  m5: string | null;
  m6: string | null;
  m7: string | null;
  m8: string | null;
  m9: string | null;
  m10: string | null;
  m11: string | null;
  m12: string | null;
  e1: string | null;
  e2: string | null;
  e3: string | null;
  e4: string | null;
  e5: string | null;
  e6: string | null;
  e7: string | null;
  e8: string | null;
  e9: string | null;
  e10: string | null;
  e11: string | null;
  e12: string | null;
};

const CAMPOS_M = ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9", "m10", "m11", "m12"] as const;
const CAMPOS_E = ["e1", "e2", "e3", "e4", "e5", "e6", "e7", "e8", "e9", "e10", "e11", "e12"] as const;

function juntarItens(payloads: string[]): Array<Record<string, unknown>> {
  const saida: Array<Record<string, unknown>> = [];
  for (const payload of payloads) {
    try {
      const parsed = JSON.parse(payload);
      if (Array.isArray(parsed)) saida.push(...parsed);
    } catch {
      continue;
    }
  }
  return saida;
}

function somar(mapa: Record<string, number>, sku: string, valor: number) {
  mapa[sku] = (mapa[sku] ?? 0) + valor;
}

function porSkuNoMes(serie: Record<string, Record<string, number>>, chave: string): Record<string, number> {
  const saida: Record<string, number> = {};
  for (const [sku, meses] of Object.entries(serie)) {
    if (Object.prototype.hasOwnProperty.call(meses, chave)) saida[sku] = meses[chave] ?? 0;
  }
  return saida;
}

function aplicarPlanilha(
  destino: Record<string, Record<string, number>>,
  origem: Record<string, Record<string, number>>,
  resolverSku: (sku: string) => string
) {
  for (const [skuBruto, meses] of Object.entries(origem)) {
    const sku = resolverSku(skuBruto);
    if (!sku) continue;
    destino[sku] = { ...destino[sku], ...meses };
  }
}

/** Realizado e previsto da grade MTS. Fotos, ciclos e jobs entram em leituras únicas. */
export async function getGradeMtsDados(cicloId: number) {
  const ciclo = await getCicloComercial(cicloId);
  if (!ciclo) throw new TRPCError({ code: "NOT_FOUND", message: "Ciclo não encontrado." });
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });

  const anos = anosDaGrade(ciclo.anoInicio, ciclo.mesInicio);
  const passados = mesesPassadosGrade(ciclo.anoInicio, ciclo.mesInicio);
  const [realizado, ciclos, fotos, itens, jobs] = await Promise.all([
    getRealizadoAnualPorSku(anos),
    db
      .select({
        id: ciclosComerciais.id,
        anoInicio: ciclosComerciais.anoInicio,
        mesInicio: ciclosComerciais.mesInicio,
        status: ciclosComerciais.status,
        jobId: ciclosComerciais.jobId,
      })
      .from(ciclosComerciais),
    db
      .select({
        id: cicloSnapshot.id,
        cicloId: cicloSnapshot.cicloId,
        versao: cicloSnapshot.versao,
      })
      .from(cicloSnapshot),
    db
      .select({
        cicloId: cicloComercialItens.cicloId,
        sku: cicloComercialItens.sku,
        m1: cicloComercialItens.m1,
        m2: cicloComercialItens.m2,
        m3: cicloComercialItens.m3,
        m4: cicloComercialItens.m4,
        m5: cicloComercialItens.m5,
        m6: cicloComercialItens.m6,
        m7: cicloComercialItens.m7,
        m8: cicloComercialItens.m8,
        m9: cicloComercialItens.m9,
        m10: cicloComercialItens.m10,
        m11: cicloComercialItens.m11,
        m12: cicloComercialItens.m12,
        e1: cicloComercialItens.e1,
        e2: cicloComercialItens.e2,
        e3: cicloComercialItens.e3,
        e4: cicloComercialItens.e4,
        e5: cicloComercialItens.e5,
        e6: cicloComercialItens.e6,
        e7: cicloComercialItens.e7,
        e8: cicloComercialItens.e8,
        e9: cicloComercialItens.e9,
        e10: cicloComercialItens.e10,
        e11: cicloComercialItens.e11,
        e12: cicloComercialItens.e12,
      })
      .from(cicloComercialItens)
      .where(and(eq(cicloComercialItens.planoColab, "MTS"), ne(cicloComercialItens.cicloId, cicloId))),
    db
      .select({
        id: previsaoPythonJobs.id,
        workdir: previsaoPythonJobs.workdir,
        outputFileName: previsaoPythonJobs.outputFileName,
      })
      .from(previsaoPythonJobs)
      .where(eq(previsaoPythonJobs.status, "SUCCESS")),
  ]);

  const ultimaFoto = new Map<number, { id: number; versao: number }>();
  for (const foto of fotos) {
    const atual = ultimaFoto.get(foto.cicloId);
    if (!atual || foto.versao > atual.versao) ultimaFoto.set(foto.cicloId, { id: foto.id, versao: foto.versao });
  }

  const ciclosComFoto: CicloCobertura[] = ciclos
    .filter(candidato => (candidato.status === "APROVADO" || candidato.status === "CONGELADO") && ultimaFoto.has(candidato.id))
    .map(candidato => ({ id: candidato.id, anoInicio: candidato.anoInicio, mesInicio: candidato.mesInicio }));

  const snapshotIds = [...new Set(ciclosComFoto.map(cicloFoto => ultimaFoto.get(cicloFoto.id)!.id))];
  const linhas = snapshotIds.length
    ? await db
        .select({
          snapshotId: cicloSnapshotLinhas.snapshotId,
          payloadJson: cicloSnapshotLinhas.payloadJson,
        })
        .from(cicloSnapshotLinhas)
        .where(and(inArray(cicloSnapshotLinhas.snapshotId, snapshotIds), eq(cicloSnapshotLinhas.tipo, "itens")))
    : [];

  const itensPorSnapshot = new Map<number, string[]>();
  for (const linha of linhas) {
    const lista = itensPorSnapshot.get(linha.snapshotId) ?? [];
    lista.push(linha.payloadJson);
    itensPorSnapshot.set(linha.snapshotId, lista);
  }

  const dePara = await loadDeParaMap();
  const resolverSku = (sku: string) => resolveCodigoAtual(sku.trim(), dePara).toUpperCase();
  const itensFotoPorCiclo = new Map<number, Array<Record<string, unknown>>>();
  for (const cicloFoto of ciclosComFoto) {
    const snapId = ultimaFoto.get(cicloFoto.id)!.id;
    itensFotoPorCiclo.set(cicloFoto.id, juntarItens(itensPorSnapshot.get(snapId) ?? []));
  }

  const itensPorCiclo = new Map<number, ItemMeses[]>();
  for (const item of itens) {
    const lista = itensPorCiclo.get(item.cicloId) ?? [];
    lista.push(item);
    itensPorCiclo.set(item.cicloId, lista);
  }

  const cicloPorId = new Map(ciclos.map(candidato => [candidato.id, candidato]));
  const cicloDoJob = new Map<number, number>();
  for (const candidato of ciclos) {
    if (!candidato.jobId || candidato.id === cicloId) continue;
    const atual = cicloDoJob.get(candidato.jobId);
    if (!atual || candidato.id > atual) cicloDoJob.set(candidato.jobId, candidato.id);
  }

  const seriePorJob = new Map<number, Record<string, Record<string, number>>>();
  for (const [jobId, cicloOrigem] of cicloDoJob) {
    const origem = cicloPorId.get(cicloOrigem);
    if (!origem) continue;
    const serie: Record<string, Record<string, number>> = {};
    for (const item of itensPorCiclo.get(cicloOrigem) ?? []) {
      const sku = resolverSku(item.sku);
      if (!sku) continue;
      for (let indice = 0; indice < 12; indice++) {
        const bruto = item[CAMPOS_E[indice]!];
        if (bruto == null || String(bruto).trim() === "") continue;
        const valor = Number(bruto);
        if (!Number.isFinite(valor)) continue;
        const calendario = cicloHorizonCalendar(origem.anoInicio, origem.mesInicio, indice);
        const chave = chaveMes(calendario.year, calendario.month);
        const meses = serie[sku] ?? {};
        meses[chave] = (meses[chave] ?? 0) + valor;
        serie[sku] = meses;
      }
    }
    seriePorJob.set(jobId, serie);
  }

  const precisaDeJob = passados.some(mes => !escolherCicloDoMes(mes, ciclosComFoto));
  const planilhas = precisaDeJob ? await lerEstatisticaJobs(jobs) : new Map<number, Record<string, Record<string, number>>>();
  for (const [jobId, serie] of planilhas) {
    const atual = seriePorJob.get(jobId) ?? {};
    aplicarPlanilha(atual, serie, resolverSku);
    seriePorJob.set(jobId, atual);
  }

  const previsto: Record<string, Record<string, CelulaPrevisto>> = {};
  const mesesComFoto: Record<string, { rotulo: string }> = {};
  const consolidadoPorCiclo = new Map<number, Map<number, Record<string, number>>>();

  function consolidado(cicloOrigem: number, indice: number): Record<string, number> {
    const porIndice = consolidadoPorCiclo.get(cicloOrigem) ?? new Map<number, Record<string, number>>();
    const guardado = porIndice.get(indice);
    if (guardado) return guardado;
    const mapa: Record<string, number> = {};
    for (const item of itensPorCiclo.get(cicloOrigem) ?? []) {
      const sku = resolverSku(item.sku);
      if (!sku) continue;
      somar(mapa, sku, monthEffectiveQty(item as unknown as Record<string, unknown>, indice));
    }
    porIndice.set(indice, mapa);
    consolidadoPorCiclo.set(cicloOrigem, porIndice);
    return mapa;
  }

  for (const mes of passados) {
    const chave = chaveMes(mes.ano, mes.mes);
    const fotoEscolha = escolherCicloDoMes(mes, ciclosComFoto);
    const foto = fotoEscolha
      ? {
          cicloId: fotoEscolha.id,
          porSku: (() => {
            const mapa: Record<string, number> = {};
            const campo = CAMPOS_M[fotoEscolha.indice]!;
            for (const item of itensFotoPorCiclo.get(fotoEscolha.id) ?? []) {
              const sku = resolverSku(String(item.sku || ""));
              if (!sku) continue;
              somar(mapa, sku, Number(item[campo] || 0));
            }
            return mapa;
          })(),
        }
      : null;
    if (foto) mesesComFoto[chave] = { rotulo: rotuloOrigemPrevisto({ tipo: "foto", cicloId: foto.cicloId }) };

    const recente = foto ? null : escolherCicloRecenteDoMes(mes, ciclos, cicloId);
    const cicloRecente = recente
      ? {
          cicloId: recente.id,
          status: cicloPorId.get(recente.id)?.status ?? "",
          porSku: consolidado(recente.id, recente.indice),
        }
      : null;

    const jobsDoMes = foto
      ? []
      : [...seriePorJob.entries()]
          .sort((a, b) => b[0] - a[0])
          .map(([jobId, serie]) => ({ jobId, porSku: porSkuNoMes(serie, chave) }))
          .filter(job => Object.keys(job.porSku).length > 0);

    const skus = new Set<string>([
      ...Object.keys(foto?.porSku ?? {}),
      ...Object.keys(cicloRecente?.porSku ?? {}),
      ...jobsDoMes.flatMap(job => Object.keys(job.porSku)),
    ]);
    for (const sku of skus) {
      const celula = resolverPrevistoMes({ sku, foto, ciclo: cicloRecente, jobs: jobsDoMes });
      if (!celula) continue;
      if (foto && !(sku in foto.porSku)) continue;
      const mesesSku = previsto[sku] ?? {};
      mesesSku[chave] = celula;
      previsto[sku] = mesesSku;
    }
  }

  return {
    anoInicio: ciclo.anoInicio,
    mesInicio: ciclo.mesInicio,
    realizado,
    previsto,
    mesesComFoto,
  };
}
