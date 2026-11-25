import { carteiraPvEntregas, type InsertCarteiraPvEntrega } from "../../drizzle/schema";
import { getDb } from "../db";
import { loadDeParaMap, resolveCodigoAtual } from "./de-para-map";
import type { CarteiraEntregaPersistRow } from "./erp-mssql";

export async function replaceCarteiraPvEntregas(rows: CarteiraEntregaPersistRow[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const dePara = await loadDeParaMap();

  await db.delete(carteiraPvEntregas);

  const toInsert: InsertCarteiraPvEntrega[] = [];
  for (const row of rows) {
    const codigo = String(row.codigo || "").trim();
    const skuRaw = String(row.sku || "").trim();
    if (!codigo || !skuRaw) continue;
    const sku = resolveCodigoAtual(skuRaw, dePara) || skuRaw;
    const qtd = Number(row.quantidade) || 0;
    if (qtd <= 0) continue;
    toInsert.push({
      codigo,
      sku,
      precoUnitario: String(Math.round((Number(row.precoUnitario) || 0) * 10000) / 10000),
      anoEnt: Number(row.anoEnt),
      mesEnt: Number(row.mesEnt),
      quantidade: String(qtd),
      receitaBruta: String(Number(row.receitaBruta) || 0),
    });
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