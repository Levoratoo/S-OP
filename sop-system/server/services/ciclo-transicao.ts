import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { cicloStatusHistorico, ciclosComerciais } from "../../drizzle/schema";
import { assertCicloStatusTransition } from "./ciclo-status-flow";
import { captureCicloSnapshot } from "./ciclo-snapshot";
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
  if (!db) throw new Error("Database not available");
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

  if (input.next === "APROVADO") {
    await captureCicloSnapshot({
      cicloId: input.cicloId,
      createdBy: input.usuario,
      comentario: input.comentario || "Snapshot da aprovação",
      retroativo: false,
    });
  }

  await db.insert(cicloStatusHistorico).values({
    cicloId: input.cicloId,
    statusDe: ciclo.status,
    statusPara: input.next,
    usuario: input.usuario ?? null,
    comentario: input.comentario ?? null,
  });
  await db.update(ciclosComerciais).set({ status: input.next }).where(eq(ciclosComerciais.id, input.cicloId));
  return { status: input.next };
}
