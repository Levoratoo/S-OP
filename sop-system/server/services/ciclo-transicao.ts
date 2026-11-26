import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { cicloStatusHistorico, ciclosComerciais } from "../../drizzle/schema";
import { assertCicloStatusTransition, passosFecharCiclo } from "./ciclo-status-flow";
import { captureCicloSnapshot } from "./ciclo-snapshot";
import { avaliarCompraPapelParaAprovacao, congelarCompraPapel } from "./compra-papel";
import { mensagemPendenciasCompraPapel } from "@shared/compra-papel";
import type { CicloStatus } from "@shared/ciclo-status";
import { isCicloStatus } from "@shared/ciclo-status";

export async function transicionarCiclo(input: {
  cicloId: number;
  next: CicloStatus;
  usuario?: string | null;
  comentario?: string | null;
  isAdmin: boolean;
  viaFechar?: boolean;
}) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  const [ciclo] = await db.select().from(ciclosComerciais).where(eq(ciclosComerciais.id, input.cicloId)).limit(1);
  if (!ciclo) throw new TRPCError({ code: "NOT_FOUND", message: "Ciclo não encontrado." });
  if (!isCicloStatus(ciclo.status)) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Status atual inválido: ${ciclo.status}` });
  }
  assertCicloStatusTransition(ciclo.status, input.next, {
    isAdmin: input.isAdmin,
    motivo: input.comentario,
    viaFechar: input.viaFechar,
  });

  let comentario = input.comentario ?? null;
  if (input.next === "APROVADO") {
    const analise = await avaliarCompraPapelParaAprovacao(input.cicloId);
    const bloqueio = mensagemPendenciasCompraPapel(analise.pendentes);
    if (bloqueio) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: bloqueio });
    }
    if (analise.total === 0) {
      comentario = [comentario, "Análise de compra de papel com 0 linhas."].filter(Boolean).join(" ");
    }
    await captureCicloSnapshot({
      cicloId: input.cicloId,
      createdBy: input.usuario,
      comentario: comentario || "Snapshot da aprovação",
      retroativo: false,
    });
    await congelarCompraPapel(
      input.cicloId,
      input.usuario ?? null,
      analise.total === 0 ? "Análise de compra de papel com 0 linhas." : comentario || "Snapshot da compra de papel"
    );
  }

  await db.insert(cicloStatusHistorico).values({
    cicloId: input.cicloId,
    statusDe: ciclo.status,
    statusPara: input.next,
    usuario: input.usuario ?? null,
    comentario,
  });
  await db.update(ciclosComerciais).set({ status: input.next }).where(eq(ciclosComerciais.id, input.cicloId));
  return { status: input.next };
}

/** Fechar: se ainda está em colaboração, grava CONSENSO e em seguida APROVADO. */
export async function fecharCicloComHistorico(input: {
  cicloId: number;
  usuario?: string | null;
  isAdmin: boolean;
}) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  const [ciclo] = await db.select().from(ciclosComerciais).where(eq(ciclosComerciais.id, input.cicloId)).limit(1);
  if (!ciclo) throw new TRPCError({ code: "NOT_FOUND", message: "Ciclo não encontrado." });
  if (!isCicloStatus(ciclo.status)) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Status atual inválido: ${ciclo.status}` });
  }
  const passos = passosFecharCiclo(ciclo.status);
  let last: CicloStatus = ciclo.status;
  for (const next of passos) {
    const result = await transicionarCiclo({
      cicloId: input.cicloId,
      next,
      usuario: input.usuario,
      comentario:
        next === "CONSENSO"
          ? "Fechar ciclo: passagem automática por CONSENSO"
          : "Fechar ciclo → aprovado (foto imutável)",
      isAdmin: input.isAdmin,
    });
    last = result.status;
  }
  return { status: last };
}
