/**
 * Ciclo comercial S&OP — ciclo de vida.
 * Nasce ABERTO (igual ao default histórico). Avanço só para a frente.
 * APROVADO grava snapshot imutável. CONGELADO é ação explícita depois (somente leitura total).
 */
export const CICLO_STATUS_ORDER = [
  "ABERTO",
  "EM_COLABORACAO",
  "CONSENSO",
  "APROVADO",
  "CONGELADO",
] as const;

export type CicloStatus = (typeof CICLO_STATUS_ORDER)[number];

export const CICLO_STATUS_LABEL: Record<CicloStatus, string> = {
  ABERTO: "Aberto",
  EM_COLABORACAO: "Em colaboração",
  CONSENSO: "Consenso",
  APROVADO: "Aprovado",
  CONGELADO: "Congelado",
};

export function isCicloStatus(value: string): value is CicloStatus {
  return (CICLO_STATUS_ORDER as readonly string[]).includes(value);
}

/** Aprovado e congelado não voltam e bloqueiam edição do ciclo. */
export function isCicloSomenteLeitura(status: string): boolean {
  return status === "APROVADO" || status === "CONGELADO";
}

export function cicloStatusIndex(status: string): number {
  return CICLO_STATUS_ORDER.indexOf(status as CicloStatus);
}

export function nextCicloStatus(status: string): CicloStatus | null {
  const i = cicloStatusIndex(status);
  if (i < 0 || i >= CICLO_STATUS_ORDER.length - 1) return null;
  return CICLO_STATUS_ORDER[i + 1]!;
}

export function prevCicloStatus(status: string): CicloStatus | null {
  const i = cicloStatusIndex(status);
  if (i <= 0) return null;
  return CICLO_STATUS_ORDER[i - 1]!;
}
