import { inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";
import * as db from "../db";
import { getDb } from "../db";
import { produtos } from "../../drizzle/schema";

export type DeParaComDescricao = {
  id: number;
  skuAntigo: string;
  skuNovo: string;
  descricaoAntigo: string | null;
  descricaoNovo: string | null;
};

const CACHE_TTL_MS = 120_000;
let enrichedCache: { at: number; data: DeParaComDescricao[]; buildMs: number } | null = null;

export function invalidateDeParaEnrichedCache() {
  enrichedCache = null;
}

/** Última medição de rebuild (ms) — útil para logs/diagnóstico. */
export function lastDeParaEnrichedBuildMs(): number | null {
  return enrichedCache?.buildMs ?? null;
}

function normCode(value: string): string {
  return value.trim().toUpperCase();
}

async function loadDescricoesProdutosPorCodigos(codes: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!codes.length) return out;
  const conn = await getDb();
  if (!conn) return out;

  const uniq = [...new Set(codes.map(c => c.trim()).filter(Boolean))];
  const pending = new Set(uniq.map(normCode));

  for (let i = 0; i < uniq.length; i += 400) {
    const chunk = uniq.slice(i, i + 400);
    const byItem = await conn
      .select({
        codItem: produtos.codItem,
        codigo: produtos.codigo,
        descricao: produtos.descricao,
        nome: produtos.nome,
      })
      .from(produtos)
      .where(inArray(produtos.codItem, chunk));
    for (const p of byItem) {
      const keys = [p.codItem, p.codigo].filter(Boolean).map(c => normCode(String(c)));
      const desc = (p.descricao || p.nome || "").trim();
      if (!desc) continue;
      for (const k of keys) {
        if (pending.has(k)) {
          out.set(k, desc);
          pending.delete(k);
        }
      }
    }
  }

  const still = uniq.filter(c => pending.has(normCode(c)));
  for (let i = 0; i < still.length; i += 400) {
    const chunk = still.slice(i, i + 400);
    const byCodigo = await conn
      .select({
        codItem: produtos.codItem,
        codigo: produtos.codigo,
        descricao: produtos.descricao,
        nome: produtos.nome,
      })
      .from(produtos)
      .where(inArray(produtos.codigo, chunk));
    for (const p of byCodigo) {
      const keys = [p.codItem, p.codigo].filter(Boolean).map(c => normCode(String(c)));
      const desc = (p.descricao || p.nome || "").trim();
      if (!desc) continue;
      for (const k of keys) {
        if (pending.has(k)) {
          out.set(k, desc);
          pending.delete(k);
        }
      }
    }
  }

  return out;
}

async function loadDescricoesFaturamentoPorCodigos(codes: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!codes.length) return out;
  const conn = await getDb();
  if (!conn) return out;

  const uniq = [...new Set(codes.map(c => c.trim()).filter(Boolean))];
  for (let i = 0; i < uniq.length; i += 400) {
    const chunk = uniq.slice(i, i + 400);
    const result = await conn.execute(sql`
      SELECT codMaterial, MAX(descricaoItem) AS descricaoItem
      FROM faturamento
      WHERE codMaterial IN (${sql.join(chunk.map(c => sql`${c}`), sql`, `)})
      GROUP BY codMaterial
    `);
    const rows = (result[0] as unknown as Array<{ codMaterial: string; descricaoItem: string }>) ?? [];
    for (const row of rows) {
      const k = normCode(String(row.codMaterial || ""));
      const d = String(row.descricaoItem || "").trim();
      if (k && d) out.set(k, d);
    }
  }
  return out;
}

export async function listDeParaCodigosComDescricoes(): Promise<DeParaComDescricao[]> {
  const now = Date.now();
  if (enrichedCache && now - enrichedCache.at < CACHE_TTL_MS) {
    return enrichedCache.data;
  }

  const t0 = performance.now();
  const base = await db.listDeParaCodigos();
  if (!base.length) {
    enrichedCache = { at: now, data: [], buildMs: 0 };
    return [];
  }

  const codeSet = new Set<string>();
  for (const row of base) {
    if (row.skuAntigo) codeSet.add(normCode(row.skuAntigo));
    if (row.skuNovo) codeSet.add(normCode(row.skuNovo));
  }
  const allCodes = [...codeSet];

  const prodDesc = await loadDescricoesProdutosPorCodigos(allCodes);
  const missing = allCodes.filter(c => !prodDesc.has(c));
  const fatDesc = await loadDescricoesFaturamentoPorCodigos(missing);

  const resolve = (code: string): string | null => {
    const k = normCode(code);
    return prodDesc.get(k) ?? fatDesc.get(k) ?? null;
  };

  const data = base.map(row => ({
    id: row.id,
    skuAntigo: row.skuAntigo,
    skuNovo: row.skuNovo,
    descricaoAntigo: resolve(row.skuAntigo),
    descricaoNovo: resolve(row.skuNovo),
  }));

  const buildMs = Math.round(performance.now() - t0);
  enrichedCache = { at: now, data, buildMs };
  if (buildMs > 3000) {
    console.warn(`[de-para] listEnriched rebuild ${buildMs}ms para ${base.length} linhas`);
  } else {
    console.info(`[de-para] listEnriched rebuild ${buildMs}ms (${base.length} linhas)`);
  }
  return data;
}