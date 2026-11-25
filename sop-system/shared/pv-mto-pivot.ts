import { cicloHorizonCalendar, cicloHorizonIndexFromCalendar } from "@shared/ciclo-horizon";

export type PvMtoEntregaInput = {
  codigo: string;
  sku: string;
  precoUnitario: number;
  anoEnt: number;
  mesEnt: number;
  quantidade: number;
  receitaBruta?: number;
};

export type PvMtoPivotLine = {
  lineKey: string;
  numPedido: string;
  sku: string;
  precoUnitario: number;
  meses: number[];
  quantidadeTotal: number;
  receitaTotal: number;
};

const MESES_CURTO = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

export function pvMtoPivotLineKey(codigo: string, sku: string, precoUnitario: number): string {
  const preco = Math.round((Number(precoUnitario) || 0) * 100) / 100;
  return `${String(codigo).trim().toUpperCase()}||${String(sku).trim().toUpperCase()}||${preco.toFixed(2)}`;
}

/** Agrupa entregas em linhas pivot (pedido × SKU × preço) com m1…m12 no horizonto do ciclo. */
export function buildPvMtoPivotLinesFromEntregas(
  entregas: PvMtoEntregaInput[],
  anoInicio: number,
  mesInicio: number
): PvMtoPivotLine[] {
  const groups = new Map<string, PvMtoPivotLine>();

  for (const row of entregas) {
    const codigo = String(row.codigo || "").trim();
    const sku = String(row.sku || "").trim();
    if (!codigo || !sku) continue;
    const qtd = Number(row.quantidade) || 0;
    if (qtd <= 0) continue;
    const preco = Number(row.precoUnitario) || 0;
    const key = pvMtoPivotLineKey(codigo, sku, preco);
    const idx = cicloHorizonIndexFromCalendar(
      anoInicio,
      mesInicio,
      Number(row.anoEnt),
      Number(row.mesEnt)
    );
    if (idx == null) continue;

  let line = groups.get(key);
    if (!line) {
      line = {
        lineKey: key,
        numPedido: codigo,
        sku,
        precoUnitario: Math.round(preco * 100) / 100,
        meses: Array(12).fill(0),
        quantidadeTotal: 0,
        receitaTotal: 0,
      };
      groups.set(key, line);
    }
    line.meses[idx] += qtd;
    line.quantidadeTotal += qtd;
    line.receitaTotal += Number(row.receitaBruta) || 0;
  }

  for (const line of groups.values()) {
    line.meses = line.meses.map(v => Math.round(v * 100) / 100);
    line.quantidadeTotal = Math.round(line.quantidadeTotal * 100) / 100;
    line.receitaTotal = Math.round(line.receitaTotal * 100) / 100;
  }

  return Array.from(groups.values());
}

export function pvMtoHorizonMonthLabel(
  anoInicio: number,
  mesInicio: number,
  index: number
): string {
  const { year, month } = cicloHorizonCalendar(anoInicio, mesInicio, index);
  return `${MESES_CURTO[month - 1]}/${String(year).slice(-2)}`;
}

/** Agrega linhas pivot para SKU × mês (conferência com ciclo_comercial_itens). */
export function aggregatePvMtoPivotBySkuMes(
  lines: PvMtoPivotLine[]
): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const line of lines) {
    const key = line.sku.toUpperCase();
    const bucket = out.get(key) ?? Array(12).fill(0);
    for (let i = 0; i < 12; i++) bucket[i] += line.meses[i] || 0;
    out.set(key, bucket);
  }
  return out;
}

export function sumPvMtoPivotMonthTotals(lines: PvMtoPivotLine[]): number[] {
  const totals = Array(12).fill(0);
  for (const line of lines) {
    for (let i = 0; i < 12; i++) totals[i] += line.meses[i] || 0;
  }
  return totals.map(v => Math.round(v * 100) / 100);
}