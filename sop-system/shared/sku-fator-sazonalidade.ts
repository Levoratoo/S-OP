/** Fatores % do ano por mês de calendário (jan=0 … dez=11). */
export const FATOR_MESES_LABEL = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
] as const;

export const FATOR_SOMA_ALVO = 100;
export const FATOR_SOMA_TOLERANCIA_PP = 0.5;

export function getSeasonalityIndex(mesInicio: number, offset: number): number {
  return ((mesInicio - 1 + offset) % 12 + 12) % 12;
}

export function validateFatoresPercentuais(fatores: readonly number[]): {
  ok: boolean;
  soma: number;
  message?: string;
} {
  if (fatores.length !== 12) {
    return { ok: false, soma: 0, message: "Informe 12 fatores (jan a dez)." };
  }
  for (let i = 0; i < 12; i++) {
    const n = fatores[i];
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, soma: 0, message: `Fator inválido em ${FATOR_MESES_LABEL[i]}.` };
    }
  }
  const soma = fatores.reduce((a, b) => a + b, 0);
  if (Math.abs(soma - FATOR_SOMA_ALVO) > FATOR_SOMA_TOLERANCIA_PP) {
    return {
      ok: false,
      soma,
      message: `Soma dos fatores = ${soma.toFixed(2)}% (esperado 100% ± ${FATOR_SOMA_TOLERANCIA_PP} pp).`,
    };
  }
  return { ok: true, soma };
}

/** Converte fatores % (soma ~100) em pesos que somam 1. */
export function fatoresToPesosNormalizados(fatores: readonly number[]): number[] {
  const soma = fatores.reduce((a, b) => a + b, 0);
  if (soma <= 0) return Array(12).fill(1 / 12);
  return fatores.map(v => v / soma);
}

const MES_KEYS = [
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
] as const;

export type MesesCicloDistribuidos = Record<(typeof MES_KEYS)[number], number>;

/** Redistribui total 12M do SKU nos meses do ciclo conforme fatores jan-dez. */
export function redistribuirTotalComFatores(
  total12m: number,
  fatoresPercentJanDez: readonly number[],
  mesInicioCiclo: number
): MesesCicloDistribuidos {
  const pesos = fatoresToPesosNormalizados(fatoresPercentJanDez);
  const out = Object.fromEntries(MES_KEYS.map(k => [k, 0])) as MesesCicloDistribuidos;
  for (let i = 0; i < 12; i++) {
    const calIdx = getSeasonalityIndex(mesInicioCiclo, i);
    const q = Math.round(total12m * pesos[calIdx] * 100) / 100;
    out[MES_KEYS[i]] = q;
  }
  return out;
}
