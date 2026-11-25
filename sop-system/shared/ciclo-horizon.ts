/**
 * Horizonte S&OP: `mesInicio`/`anoInicio` do ciclo = mês do processo (ex.: nov/2026).
 * m1…m12 cobrem os 12 meses seguintes (ex.: dez/2026 … nov/2027).
 */

export function cicloHorizonCalendar(
  anoInicio: number,
  mesCiclo: number,
  index: number
): { year: number; month: number } {
  const t = mesCiclo + index;
  const month = (t % 12) + 1;
  const year = anoInicio + Math.floor(t / 12);
  return { year, month };
}

export function cicloHorizonIsoDate(anoInicio: number, mesCiclo: number, index: number): string {
  const { year, month } = cicloHorizonCalendar(anoInicio, mesCiclo, index);
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

/** Competência (ano/mês calendário) → índice 0…11 no horizonte, ou null fora da janela. */
export function cicloHorizonIndexFromCalendar(
  anoInicio: number,
  mesCiclo: number,
  ano: number,
  mes: number
): number | null {
  const abs = ano * 12 + (mes - 1);
  const absFirst = cicloHorizonStartAbsolute(anoInicio, mesCiclo);
  const idx = abs - absFirst;
  if (idx < 0 || idx > 11) return null;
  return idx;
}

export function cicloHorizonStartAbsolute(anoInicio: number, mesCiclo: number): number {
  const first = cicloHorizonCalendar(anoInicio, mesCiclo, 0);
  return first.year * 12 + (first.month - 1);
}
