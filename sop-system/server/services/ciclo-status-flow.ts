import { TRPCError } from "@trpc/server";

export type CicloStatus = "ABERTO" | "EM_COLABORACAO" | "CONSOLIDADO" | "FECHADO";

/** Transições permitidas fora de fecharCiclo (fechamento único via fecharCiclo). */
export function assertCicloStatusTransition(
  current: CicloStatus,
  next: CicloStatus,
  isAdmin: boolean
): void {
  if (next === "CONSOLIDADO" || next === "FECHADO") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Use o botão Fechar ciclo na aba Consolidado para encerrar o ciclo.",
    });
  }

  if (current === "FECHADO") {
    if (next !== "ABERTO") {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Ciclo fechado só pode ser reaberto para ABERTO (Master/Admin).",
      });
    }
    if (!isAdmin) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Somente Master/Admin pode reabrir um ciclo fechado.",
      });
    }
  }
}
