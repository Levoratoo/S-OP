import { sql } from "drizzle-orm";
import { getCicloComercial, getDb } from "../db";
import { cicloHorizonCalendar } from "@shared/ciclo-horizon";
import { getLatestSnapshot } from "./ciclo-snapshot";

function juntarItens(linhas: Array<{ tipo: string; payloadJson: string }>) {
  return linhas
    .filter(l => l.tipo === "itens")
    .flatMap(l => {
      try {
        const parsed = JSON.parse(l.payloadJson);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }) as Array<Record<string, unknown>>;
}

/** Previsão do snapshot aprovado × faturamento real. WMAPE e bias. */
export async function acuracidadeSnapshot(cicloId: number) {
  const snap = await getLatestSnapshot(cicloId);
  if (!snap) throw new Error("Este ciclo não tem snapshot aprovado.");
  const ciclo = await getCicloComercial(cicloId);
  if (!ciclo) throw new Error("Ciclo não encontrado");
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const previsto = new Map<string, { sku: string; marca: string; ano: number; mes: number; qtd: number }>();
  for (const item of juntarItens(snap.linhas)) {
    const sku = String(item.sku || "").trim().toUpperCase();
    if (!sku) continue;
    for (let i = 0; i < 12; i++) {
      const qtd = Number(item[`m${i + 1}`] || 0);
      if (!qtd) continue;
      const { year, month } = cicloHorizonCalendar(ciclo.anoInicio, ciclo.mesInicio, i);
      const key = `${sku}|${year}|${month}`;
      const prev = previsto.get(key) ?? { sku, marca: String(item.marca || ""), ano: year, mes: month, qtd: 0 };
      prev.qtd += qtd;
      previsto.set(key, prev);
    }
  }

  const inicio = cicloHorizonCalendar(ciclo.anoInicio, ciclo.mesInicio, 0);
  const fim = cicloHorizonCalendar(ciclo.anoInicio, ciclo.mesInicio, 11);
  const desde = `${inicio.year}-${String(inicio.month).padStart(2, "0")}-01`;
  const ateAno = fim.month === 12 ? fim.year + 1 : fim.year;
  const ateMes = fim.month === 12 ? 1 : fim.month + 1;
  const ate = `${ateAno}-${String(ateMes).padStart(2, "0")}-01`;

  const result = await db.execute(sql`
    SELECT UPPER(TRIM(codMaterial)) AS sku, YEAR(dataEmissao) AS ano, MONTH(dataEmissao) AS mes, SUM(qtd) AS qtd
    FROM faturamento
    WHERE tipoFaturamento = 'SAIDA'
      AND dataEmissao >= ${desde}
      AND dataEmissao < ${ate}
      AND codMaterial IS NOT NULL
    GROUP BY UPPER(TRIM(codMaterial)), YEAR(dataEmissao), MONTH(dataEmissao)
  `);
  const real = new Map<string, number>();
  for (const row of (result[0] as unknown as Array<{ sku: string; ano: number; mes: number; qtd: unknown }>) ?? []) {
    real.set(`${row.sku}|${row.ano}|${row.mes}`, Number(row.qtd || 0));
  }

  let absErr = 0;
  let sumReal = 0;
  let sumPrev = 0;
  const linhas = [];
  const keys = new Set([...previsto.keys(), ...real.keys()]);
  for (const key of keys) {
    const prev = previsto.get(key);
    const qtdPrev = prev?.qtd ?? 0;
    const qtdReal = real.get(key) ?? 0;
    absErr += Math.abs(qtdPrev - qtdReal);
    sumReal += qtdReal;
    sumPrev += qtdPrev;
    if (prev || qtdReal) {
      linhas.push({
        sku: prev?.sku ?? key.split("|")[0],
        marca: prev?.marca ?? "",
        ano: prev?.ano ?? Number(key.split("|")[1]),
        mes: prev?.mes ?? Number(key.split("|")[2]),
        previsto: qtdPrev,
        real: qtdReal,
      });
    }
  }
  const wmape = sumReal > 0 ? absErr / sumReal : null;
  const bias = sumReal > 0 ? (sumPrev - sumReal) / sumReal : null;
  return {
    cicloId,
    retroativo: snap.retroativo,
    aviso: snap.retroativo ? snap.comentario : null,
    wmape,
    bias,
    linhas: linhas.slice(0, 300),
  };
}
