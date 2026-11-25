import {
  FATOR_MESES_LABEL,
  validateFatoresPercentuais,
  type MesesCicloDistribuidos,
} from "@shared/sku-fator-sazonalidade";
import {
  produtoSazonalidadeFatores,
  produtos,
  type InsertProdutoSazonalidadeFatores,
  type ProdutoSazonalidadeFatores,
} from "../../drizzle/schema";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../db";

const FATOR_COLS = [
  "fatorJan",
  "fatorFev",
  "fatorMar",
  "fatorAbr",
  "fatorMai",
  "fatorJun",
  "fatorJul",
  "fatorAgo",
  "fatorSet",
  "fatorOut",
  "fatorNov",
  "fatorDez",
] as const;

export function fatoresRowToArray(row: ProdutoSazonalidadeFatores): number[] {
  return FATOR_COLS.map(col => Number(row[col] ?? 0));
}

export function fatoresArrayToRow(
  produtoId: number,
  fatores: readonly number[]
): InsertProdutoSazonalidadeFatores {
  const validation = validateFatoresPercentuais(fatores);
  if (!validation.ok) {
    throw new Error(validation.message ?? "Fatores inválidos.");
  }
  const rec: InsertProdutoSazonalidadeFatores = { produtoId } as InsertProdutoSazonalidadeFatores;
  FATOR_COLS.forEach((col, i) => {
    (rec as Record<string, unknown>)[col] = String(Math.round(fatores[i] * 10000) / 10000);
  });
  return rec;
}

export async function getSazonalidadeFatoresByProdutoId(produtoId: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(produtoSazonalidadeFatores)
    .where(eq(produtoSazonalidadeFatores.produtoId, produtoId))
    .limit(1);
  if (!row) return null;
  return {
    produtoId,
    fatores: fatoresRowToArray(row),
    labels: [...FATOR_MESES_LABEL],
    soma: fatoresRowToArray(row).reduce((a, b) => a + b, 0),
  };
}

export async function setSazonalidadeFatores(produtoId: number, fatores: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const payload = fatoresArrayToRow(produtoId, fatores);
  const [existing] = await db
    .select({ produtoId: produtoSazonalidadeFatores.produtoId })
    .from(produtoSazonalidadeFatores)
    .where(eq(produtoSazonalidadeFatores.produtoId, produtoId))
    .limit(1);
  if (existing) {
    await db
      .update(produtoSazonalidadeFatores)
      .set(payload)
      .where(eq(produtoSazonalidadeFatores.produtoId, produtoId));
  } else {
    await db.insert(produtoSazonalidadeFatores).values(payload);
  }
  return getSazonalidadeFatoresByProdutoId(produtoId);
}

export async function clearSazonalidadeFatores(produtoId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .delete(produtoSazonalidadeFatores)
    .where(eq(produtoSazonalidadeFatores.produtoId, produtoId));
  return { ok: true };
}

/** SKU upper-case → 12 fatores % (jan-dez). */
export async function loadSkuFatorPercentMap(): Promise<Map<string, number[]>> {
  const db = await getDb();
  const map = new Map<string, number[]>();
  if (!db) return map;
  const rows = await db
    .select({
      codItem: produtos.codItem,
      codigo: produtos.codigo,
      fatores: produtoSazonalidadeFatores,
    })
    .from(produtoSazonalidadeFatores)
    .innerJoin(produtos, eq(produtos.id, produtoSazonalidadeFatores.produtoId));
  for (const row of rows) {
    const arr = fatoresRowToArray(row.fatores);
    const validation = validateFatoresPercentuais(arr);
    if (!validation.ok) continue;
    const sku = (row.codItem || row.codigo || "").trim().toUpperCase();
    if (sku) map.set(sku, arr);
  }
  return map;
}

export async function listProdutoIdsComFatorValido(): Promise<Set<number>> {
  const db = await getDb();
  if (!db) return new Set();
  const rows = await db.select().from(produtoSazonalidadeFatores);
  const ids = new Set<number>();
  for (const row of rows) {
    if (validateFatoresPercentuais(fatoresRowToArray(row)).ok) {
      ids.add(row.produtoId);
    }
  }
  return ids;
}

export type ImportFatorRow = { sku: string; fatores: number[] };

export type ImportFatorResult = {
  atualizados: number;
  erros: Array<{ sku: string; message: string }>;
};

export async function importSazonalidadeFatoresBatch(rows: ImportFatorRow[]): Promise<ImportFatorResult> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const all = await db
    .select({ id: produtos.id, codItem: produtos.codItem, codigo: produtos.codigo })
    .from(produtos);
  const bySku = new Map<string, number>();
  for (const p of all) {
    if (p.codItem) bySku.set(p.codItem.trim().toUpperCase(), p.id);
    if (p.codigo) bySku.set(p.codigo.trim().toUpperCase(), p.id);
  }

  let atualizados = 0;
  const erros: ImportFatorResult["erros"] = [];
  for (const row of rows) {
    const sku = row.sku.trim();
    if (!sku) {
      erros.push({ sku: "", message: "SKU vazio" });
      continue;
    }
    const id = bySku.get(sku.toUpperCase());
    if (id == null) {
      erros.push({ sku, message: "SKU não encontrado no cadastro" });
      continue;
    }
    const validation = validateFatoresPercentuais(row.fatores);
    if (!validation.ok) {
      erros.push({ sku, message: validation.message ?? "Fatores inválidos" });
      continue;
    }
    try {
      await setSazonalidadeFatores(id, [...row.fatores]);
      atualizados += 1;
    } catch (err) {
      erros.push({ sku, message: err instanceof Error ? err.message : String(err) });
    }
  }
  return { atualizados, erros };
}

export async function parseImportFatorSpreadsheetRows(
  sheetRows: Record<string, unknown>[]
): Promise<ImportFatorRow[]> {
  const aliasMes = FATOR_MESES_LABEL.map((label, i) => ({
    i,
    keys: [
      label,
      label.toLowerCase(),
      `m${i + 1}`,
      `M${i + 1}`,
      String(i + 1),
    ],
  }));
  const out: ImportFatorRow[] = [];
  for (const row of sheetRows) {
    const skuKey = Object.keys(row).find(k => /^(sku|cod|coditem|código)/i.test(k)) ?? "sku";
    const sku = String(row[skuKey] ?? row["Cod Item"] ?? row["CodItem"] ?? Object.values(row)[0] ?? "").trim();
    if (!sku) continue;
    const fatores: number[] = [];
    for (const { i, keys } of aliasMes) {
      const col = keys.find(k => row[k] !== undefined && String(row[k]).trim() !== "");
      const raw = col ? row[col] : undefined;
      const n = Number(String(raw ?? "0").replace(",", "."));
      fatores[i] = Number.isFinite(n) ? n : 0;
    }
    out.push({ sku, fatores });
  }
  return out;
}

export type { MesesCicloDistribuidos };
