import { TRPCError } from "@trpc/server";
import {
  nextCicloStatus,
  prevCicloStatus,
  type CicloStatus,
} from "@shared/ciclo-status";

export type { CicloStatus };

export function assertCicloStatusTransition(
  current: CicloStatus,
  next: CicloStatus,
  opts: { isAdmin: boolean; motivo?: string | null; viaFechar?: boolean }
): void {
  if (current === next) return;

  if (current === "CONGELADO" || (current === "APROVADO" && next !== "CONGELADO")) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Ciclo aprovado só pode ir para CONGELADO. Congelado não volta.",
    });
  }

  const forward = nextCicloStatus(current);
  const back = prevCicloStatus(current);

  if (next === forward) return;

  if (opts.viaFechar && next === "APROVADO" && (current === "EM_COLABORACAO" || current === "CONSENSO")) {
    return;
  }

  if (next === back) {
    if (!opts.isAdmin) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Somente admin pode reabrir um passo do ciclo.",
      });
    }
    if (!opts.motivo?.trim()) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Reabrir exige motivo obrigatório.",
      });
    }
    return;
  }

  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: `Transição ${current} → ${next} não é permitida. Avance um passo ou reabra um passo (admin).`,
  });
}

export function mensagemCicloSomenteLeitura(): string {
  return "Ciclo aprovado ou congelado está somente leitura (foto imutável). Não é possível alterar MTS, CRM, PV nem sincronizar este ciclo.";
}
