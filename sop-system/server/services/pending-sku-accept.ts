import * as db from "../db";
import { getDb } from "../db";
import { deParaCodigos } from "../../drizzle/schema";
import {
  rankSkuSimilarityCandidates,
  SKU_SIMILARITY_DEPARA_AUTO_PICK,
  type SkuSimilarityCandidate,
} from "@shared/sku-descricao-similarity";
import { invalidateDeParaCache } from "./de-para-map";
import { invalidateDeParaEnrichedCache } from "./de-para-enriched";
import { invalidatePendingSkusCache } from "./seed-from-faturamento";
import { assertDeParaAcyclic, validateDeParaEdge, inheritProjetarFromAntigo } from "./de-para-validate";
import {
  acceptPendingSkusFromFaturamentoBatch,
  listPendingSkusFromFaturamento,
  type AcceptPendingSkusBatchResult,
} from "./seed-from-faturamento";

export type SkuReferenciaSugestao = SkuSimilarityCandidate & { score: number };

function clean(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

type ProdutoCandidateCache = {
  at: number;
  candidates: SkuSimilarityCandidate[];
};

let produtoCandidateCache: ProdutoCandidateCache | null = null;
const CANDIDATES_TTL_MS = 120_000;

async function loadRegisteredSimilarityCandidates(): Promise<SkuSimilarityCandidate[]> {
  const now = Date.now();
  if (produtoCandidateCache && now - produtoCandidateCache.at < CANDIDATES_TTL_MS) {
    return produtoCandidateCache.candidates;
  }
  const produtosList = await db.listProdutos();
  const out: SkuSimilarityCandidate[] = [];
  const seen = new Set<string>();
  for (const p of produtosList) {
    const codigo = clean(p.codItem) || clean(p.codigo);
    if (!codigo) continue;
    const key = codigo.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      codigo,
      descricao: clean(p.descricao) || clean(p.nome) || codigo,
      marca: p.marca,
    });
  }
  produtoCandidateCache = { at: now, candidates: out };
  return out;
}

export function invalidateSkuSimilarityCandidateCache() {
  produtoCandidateCache = null;
}

export async function suggestSkuReferencias(
  codMaterial: string,
  limit = 10,
  opts?: { candidates?: SkuSimilarityCandidate[]; pendingCodes?: Set<string> }
): Promise<{ target: { codigo: string; descricao: string; marca: string | null }; sugestoes: SkuReferenciaSugestao[] }> {
  const cod = clean(codMaterial);
  if (!cod) throw new Error("Código inválido");

  const [pending, candidatesAll] = await Promise.all([
    listPendingSkusFromFaturamento(),
    opts?.candidates ? Promise.resolve(opts.candidates) : loadRegisteredSimilarityCandidates(),
  ]);
  const pendingCodes =
    opts?.pendingCodes ??
    new Set(pending.map(p => clean(p.codMaterial)?.toUpperCase()).filter(Boolean) as string[]);

  const row =
    pending.find(p => clean(p.codMaterial)?.toUpperCase() === cod.toUpperCase()) ??
    candidatesAll.find(c => c.codigo.toUpperCase() === cod.toUpperCase());

  const descricao =
    row && "descricaoItem" in row
      ? clean(row.descricaoItem)
      : (row as SkuSimilarityCandidate)?.descricao;
  const marca = row && "marca" in row ? clean(row.marca) : (row as SkuSimilarityCandidate)?.marca ?? null;

  const target = {
    codigo: cod,
    descricao: descricao || cod,
    marca,
  };

  const candidates = candidatesAll.filter(
    c =>
      c.codigo.toUpperCase() !== cod.toUpperCase() && !pendingCodes.has(c.codigo.toUpperCase())
  );

  return {
    target,
    sugestoes: rankSkuSimilarityCandidates(target, candidates, limit),
  };
}

export async function suggestSkuReferenciasBatch(codMaterials: string[]) {
  const codes = [...new Set(codMaterials.map(c => clean(c)).filter(Boolean) as string[])];
  const [candidates, pending] = await Promise.all([
    loadRegisteredSimilarityCandidates(),
    listPendingSkusFromFaturamento(),
  ]);
  const pendingCodes = new Set(
    pending.map(p => clean(p.codMaterial)?.toUpperCase()).filter(Boolean) as string[]
  );

  const results: Record<string, SkuReferenciaSugestao[]> = {};
  for (const cod of codes) {
  const pendingRow = pending.find(p => clean(p.codMaterial)?.toUpperCase() === cod.toUpperCase());
    const target = {
      codigo: cod,
      descricao: clean(pendingRow?.descricaoItem) || cod,
      marca: clean(pendingRow?.marca),
    };
    const pool = candidates.filter(
      c => c.codigo.toUpperCase() !== cod.toUpperCase() && !pendingCodes.has(c.codigo.toUpperCase())
    );
    results[cod] = rankSkuSimilarityCandidates(target, pool, 10);
  }
  return results;
}

export type AcceptPendingSkuWithDeParaInput = {
  codMaterial: string;
  skuAntigo?: string | null;
};

export type AcceptPendingSkusWithDeParaResult = AcceptPendingSkusBatchResult & {
  deParaCriados: number;
};

export async function acceptPendingSkusWithDePara(
  items: AcceptPendingSkuWithDeParaInput[]
): Promise<AcceptPendingSkusWithDeParaResult> {
  if (!items.length) {
    return { criados: 0, jaExistiam: 0, erros: [], detalhes: [], deParaCriados: 0 };
  }

  const batchCodes = new Set(
    items.map(i => clean(i.codMaterial)?.toUpperCase()).filter(Boolean) as string[]
  );

  const codes = items.map(i => i.codMaterial);
  const batch = await acceptPendingSkusFromFaturamentoBatch(codes, { skipIdentityDePara: true });

  let deParaCriados = 0;
  const byCod = new Map(
    items.map(i => [clean(i.codMaterial)?.toUpperCase() ?? "", i.skuAntigo?.trim() || null])
  );

  const database = await getDb();
  if (!database) throw new Error("Database not available");

  const antigos = new Set<string>();
  const registeredCodes = new Set<string>();
  for (const p of await db.listProdutos()) {
    if (p.codItem) registeredCodes.add(p.codItem.trim().toUpperCase());
    if (p.codigo) registeredCodes.add(p.codigo.trim().toUpperCase());
  }

  for (const [cod, skuAntigo] of byCod) {
    if (!cod || !skuAntigo) continue;
    const ant = skuAntigo.toUpperCase();
    if (ant === cod) continue;
    if (batchCodes.has(ant)) {
      batch.erros.push({
        codMaterial: cod,
        message: `Referência ${skuAntigo} está no mesmo lote de aceite — escolha um SKU já cadastrado.`,
      });
      continue;
    }
    if (!registeredCodes.has(ant)) {
      batch.erros.push({
        codMaterial: cod,
        message: `Referência ${skuAntigo} não está cadastrada como produto.`,
      });
      continue;
    }
    antigos.add(`${ant}||${cod}`);
  }

  if (antigos.size > 0) {
    await database.transaction(async tx => {
      const existing = await tx.select().from(deParaCodigos);
      const accPairs = existing.map(r => ({ skuAntigo: r.skuAntigo, skuNovo: r.skuNovo }));

      for (const pairKey of antigos) {
        const [skuAntigo, skuNovo] = pairKey.split("||");
        try {
          assertDeParaAcyclic(accPairs, { extra: { skuAntigo, skuNovo } });
        } catch (err) {
          batch.erros.push({
            codMaterial: skuNovo,
            message: err instanceof Error ? err.message : String(err),
          });
          continue;
        }
        await validateDeParaEdge(skuAntigo, skuNovo, accPairs);
        await tx
          .insert(deParaCodigos)
          .values({ skuAntigo, skuNovo })
          .onDuplicateKeyUpdate({ set: { skuNovo } });
        await inheritProjetarFromAntigo(skuAntigo, skuNovo);
        accPairs.push({ skuAntigo, skuNovo });
        deParaCriados += 1;
      }
    });
    invalidateDeParaCache();
    invalidateDeParaEnrichedCache();
    invalidatePendingSkusCache();
    invalidateSkuSimilarityCandidateCache();
  }

  for (const d of batch.detalhes) {
    const ref = byCod.get(clean(d.codMaterial)?.toUpperCase() ?? "");
    if (ref && ref.toUpperCase() !== clean(d.codMaterial)?.toUpperCase()) {
      d.deParaCriado = antigos.has(`${ref.toUpperCase()}||${clean(d.codMaterial)?.toUpperCase()}`);
    } else {
      d.deParaCriado = false;
    }
  }

  return { ...batch, deParaCriados };
}

export { SKU_SIMILARITY_DEPARA_AUTO_PICK };