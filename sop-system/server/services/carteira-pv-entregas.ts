import { carteiraPvEntregas, type InsertCarteiraPvEntrega } from "../../drizzle/schema";
import { getDb } from "../db";
import { loadDeParaMap, resolveCodigoAtual } from "./de-para-map";
import type { CarteiraEntregaPersistRow } from "./erp-mssql";
type DbConn = NonNullable<Awaited<ReturnType<typeof getDb>>>;

function toNum(v: unknown) {
  const n = Number(String(v ?? "0").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function entregaAggKey(
  codigo: string,
  sku: string,
  preco: number,
  anoEnt: number,
  mesEnt: number
) {
  return `${codigo.toUpperCase()}||${sku.toUpperCase()}||${preco.toFixed(4)}||${anoEnt}||${mesEnt}`;
}

export function buildCarteiraPvEntregasInserts(
  rows: CarteiraEntregaPersistRow[],
  dePara: Map<string, string>
): InsertCarteiraPvEntrega[] {
  const agg = new Map<
    string,
    {
      codigo: string;
      sku: string;
      precoUnitario: number;
      anoEnt: number;
      mesEnt: number;
      quantidade: number;
      receitaBruta: number;
    }
  >();

  for (const row of rows) {
    const codigo = String(row.codigo || "").trim();
    const skuRaw = String(row.sku || "").trim();
    if (!codigo || !skuRaw) continue;
    const sku = resolveCodigoAtual(skuRaw, dePara) || skuRaw;
    const qtd = toNum(row.quantidade);
    if (qtd <= 0) continue;
    const preco = Math.round((toNum(row.precoUnitario)) * 10000) / 10000;
    const anoEnt = Number(row.anoEnt);
    const mesEnt = Number(row.mesEnt);
    const key = entregaAggKey(codigo, sku, preco, anoEnt, mesEnt);
    const rec = toNum(row.receitaBruta);
    const existing = agg.get(key);
    if (!existing) {
      agg.set(key, {
        codigo,
        sku,
        precoUnitario: preco,
        anoEnt,
        mesEnt,
        quantidade: qtd,
        receitaBruta: rec,
      });
    } else {
      existing.quantidade += qtd;
      existing.receitaBruta += rec;
    }
  }

  return Array.from(agg.values()).map(r => ({
    codigo: r.codigo,
    sku: r.sku,
    precoUnitario: String(r.precoUnitario),
    anoEnt: r.anoEnt,
    mesEnt: r.mesEnt,
    quantidade: String(Math.round(r.quantidade * 10000) / 10000),
    receitaBruta: String(Math.round(r.receitaBruta * 100) / 100),
  }));
}

export async function replaceCarteiraPvEntregas(rows: CarteiraEntregaPersistRow[], tx?: DbConn) {
  const db = tx ?? (await getDb());
  if (!db) throw new Error("Database not available");
  const dePara = await loadDeParaMap();
  const toInsert = buildCarteiraPvEntregasInserts(rows, dePara);

  if (!tx) {
    await db.delete(carteiraPvEntregas);
  } else {
    await tx.delete(carteiraPvEntregas);
  }

  for (let i = 0; i < toInsert.length; i += 300) {
    await db.insert(carteiraPvEntregas).values(toInsert.slice(i, i + 300));
  }

  return { linhas: toInsert.length };
}

export async function listCarteiraPvEntregas() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(carteiraPvEntregas);
}