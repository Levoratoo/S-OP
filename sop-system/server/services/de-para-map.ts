/**
 * Mapa em memória de De-Para (sku antigo → sku novo), com resolução de cadeia.
 * Usado no ETL de previsão e na desagregação — alinhado ao passo a passo oficial.
 */
import { getDb } from "../db";
import { deParaCodigos } from "../../drizzle/schema";

let cachedMap: Map<string, string> | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60_000;

export type DeParaBuildOptions = {
  /** Quando true, remove a aresta que fecha o ciclo em vez de lançar erro. */
  dropCycles?: boolean;
};

export type DeParaBuildResult = {
  map: Map<string, string>;
  droppedCycleEdges: Array<{ from: string; to: string; cycle: string }>;
};

export function buildValidatedDeParaMap(
  rows: Array<{ skuAntigo: string; skuNovo: string }>,
  options: DeParaBuildOptions = {}
): Map<string, string> {
  return buildValidatedDeParaMapDetailed(rows, options).map;
}

export function buildValidatedDeParaMapDetailed(
  rows: Array<{ skuAntigo: string; skuNovo: string }>,
  options: DeParaBuildOptions = {}
): DeParaBuildResult {
  const dropCycles = options.dropCycles === true;
  const map = new Map<string, string>();
  const droppedCycleEdges: DeParaBuildResult["droppedCycleEdges"] = [];

  for (const row of rows) {
    const antigo = (row.skuAntigo || "").trim().toUpperCase();
    const novo = (row.skuNovo || "").trim();
    if (!antigo || !novo) continue;
    if (antigo === novo.toUpperCase()) {
      throw new Error(`De-Para inválido: ${antigo} aponta para ele mesmo.`);
    }
    const existing = map.get(antigo);
    if (existing && existing.toUpperCase() !== novo.toUpperCase()) {
      throw new Error(
        `De-Para conflitante para ${antigo}: ${existing} e ${novo}.`
      );
    }
    map.set(antigo, novo);
  }

  let guard = 0;
  while (guard++ < 10_000) {
    let foundCycle: { from: string; to: string; cycle: string } | null = null;
    for (const start of map.keys()) {
      const path: string[] = [];
      const seen = new Set<string>();
      let current = start;
      while (map.has(current)) {
        if (seen.has(current)) {
          const cycleStart = path.indexOf(current);
          const cyclePath = [...path.slice(cycleStart), current];
          const from = path[path.length - 1]!;
          const to = map.get(from)!;
          foundCycle = {
            from,
            to,
            cycle: cyclePath.join(" -> "),
          };
          break;
        }
        seen.add(current);
        path.push(current);
        current = map.get(current)!.trim().toUpperCase();
      }
      if (foundCycle) break;
    }

    if (!foundCycle) break;

    if (!dropCycles) {
      throw new Error(`Ciclo detectado no De-Para: ${foundCycle.cycle}.`);
    }

    map.delete(foundCycle.from);
    droppedCycleEdges.push(foundCycle);
  }

  return { map, droppedCycleEdges };
}

export async function loadDeParaMap(forceRefresh = false): Promise<Map<string, string>> {
  const now = Date.now();
  if (!forceRefresh && cachedMap && now - cachedAt < CACHE_TTL_MS) {
    return cachedMap;
  }

  const db = await getDb();
  const map = new Map<string, string>();
  if (!db) {
    cachedMap = map;
    cachedAt = now;
    return map;
  }

  const rows = await db.select().from(deParaCodigos);
  // Em runtime, preferir continuar o job quebrando ciclos sujos do cadastro.
  const { map: validatedMap, droppedCycleEdges } = buildValidatedDeParaMapDetailed(rows, {
    dropCycles: true,
  });
  if (droppedCycleEdges.length > 0) {
    console.warn(
      `[de-para] ${droppedCycleEdges.length} aresta(s) removida(s) por ciclo:`,
      droppedCycleEdges.map((e) => `${e.from}→${e.to} (${e.cycle})`).join("; ")
    );
  }

  cachedMap = validatedMap;
  cachedAt = now;
  return validatedMap;
}

/** Resolve o código atual seguindo a cadeia de De-Para (com proteção a ciclo). */
export function resolveCodigoAtual(codigoOriginal: string, map: Map<string, string>): string {
  let atual = (codigoOriginal || "").trim();
  if (!atual) return atual;

  const seen = new Set<string>();
  let lookup = atual.toUpperCase();
  while (map.has(lookup) && !seen.has(lookup)) {
    seen.add(lookup);
    atual = map.get(lookup)!;
    lookup = atual.toUpperCase();
  }
  return atual;
}

export function invalidateDeParaCache() {
  cachedMap = null;
  cachedAt = 0;
}
