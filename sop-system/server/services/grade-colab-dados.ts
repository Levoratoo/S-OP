import { and, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getCicloComercial, getDb } from "../db";
import { cicloSnapshot, cicloSnapshotLinhas, ciclosComerciais } from "../../drizzle/schema";
import { loadDeParaMap, resolveCodigoAtual } from "./de-para-map";
import { getRealizadoAnualPorSku } from "./ciclo-colab-extras";
import {
  anosDaGrade,
  escolherCicloDoMes,
  chaveMes,
  mesesPassadosGrade,
  type CicloCobertura,
} from "@shared/grade-colab";

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

/** Realizado e previsto congelado da grade MTS, em duas leituras agregadas. */
export async function getGradeMtsDados(cicloId: number) {
  const ciclo = await getCicloComercial(cicloId);
  if (!ciclo) throw new TRPCError({ code: "NOT_FOUND", message: "Ciclo não encontrado." });
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });

  const anos = anosDaGrade(ciclo.anoInicio, ciclo.mesInicio);
  const passados = mesesPassadosGrade(ciclo.anoInicio, ciclo.mesInicio);
  const [realizado, ciclosFoto, fotos] = await Promise.all([
    getRealizadoAnualPorSku(anos),
    db
      .select({
        id: ciclosComerciais.id,
        anoInicio: ciclosComerciais.anoInicio,
        mesInicio: ciclosComerciais.mesInicio,
        status: ciclosComerciais.status,
      })
      .from(ciclosComerciais)
      .where(inArray(ciclosComerciais.status, ["APROVADO", "CONGELADO"])),
    db
      .select({
        id: cicloSnapshot.id,
        cicloId: cicloSnapshot.cicloId,
        versao: cicloSnapshot.versao,
      })
      .from(cicloSnapshot),
  ]);

  const ultimaFoto = new Map<number, { id: number; versao: number }>();
  for (const foto of fotos) {
    const atual = ultimaFoto.get(foto.cicloId);
    if (!atual || foto.versao > atual.versao) ultimaFoto.set(foto.cicloId, { id: foto.id, versao: foto.versao });
  }

  const ciclosComFoto: CicloCobertura[] = ciclosFoto
    .filter(cicloFoto => ultimaFoto.has(cicloFoto.id))
    .map(cicloFoto => ({ id: cicloFoto.id, anoInicio: cicloFoto.anoInicio, mesInicio: cicloFoto.mesInicio }));

  const snapshotIds = [...new Set(ciclosComFoto.map(cicloFoto => ultimaFoto.get(cicloFoto.id)!.id))];
  const linhas = snapshotIds.length
    ? await db
        .select({
          snapshotId: cicloSnapshotLinhas.snapshotId,
          payloadJson: cicloSnapshotLinhas.payloadJson,
        })
        .from(cicloSnapshotLinhas)
        .where(
          and(inArray(cicloSnapshotLinhas.snapshotId, snapshotIds), eq(cicloSnapshotLinhas.tipo, "itens"))
        )
    : [];

  const itensPorSnapshot = new Map<number, string[]>();
  for (const linha of linhas) {
    const lista = itensPorSnapshot.get(linha.snapshotId) ?? [];
    lista.push(linha.payloadJson);
    itensPorSnapshot.set(linha.snapshotId, lista);
  }

  const dePara = await loadDeParaMap();
  const itensPorCiclo = new Map<number, Array<Record<string, unknown>>>();
  for (const cicloFoto of ciclosComFoto) {
    const snapId = ultimaFoto.get(cicloFoto.id)!.id;
    itensPorCiclo.set(cicloFoto.id, juntarItens(itensPorSnapshot.get(snapId) ?? []));
  }

  const previsto: Record<string, Record<string, number>> = {};
  const mesesSemFoto: string[] = [];
  for (const mes of passados) {
    const escolha = escolherCicloDoMes(mes, ciclosComFoto);
    const chave = chaveMes(mes.ano, mes.mes);
    if (!escolha) {
      mesesSemFoto.push(chave);
      continue;
    }
    const campo = `m${escolha.indice + 1}`;
    for (const item of itensPorCiclo.get(escolha.id) ?? []) {
      const sku = resolveCodigoAtual(String(item.sku || "").trim(), dePara).toUpperCase();
      if (!sku) continue;
      const qtd = Number(item[campo] || 0);
      if (!previsto[sku]) previsto[sku] = {};
      previsto[sku][chave] = (previsto[sku][chave] || 0) + qtd;
    }
  }

  return {
    anoInicio: ciclo.anoInicio,
    mesInicio: ciclo.mesInicio,
    realizado,
    previsto,
    mesesSemFoto,
  };
}
