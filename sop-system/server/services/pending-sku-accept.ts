import * as db from "../db";
import {
  rankSkuSimilarityCandidates,
  SKU_SIMILARITY_DEPARA_AUTO_PICK,
  type SkuSimilarityCandidate,
} from "@shared/sku-descricao-similarity";
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
  opts?: {
    candidates?: SkuSimilarityCandidate[];
    pendingCodes?: Set<string>;
    descricao?: string | null;
    marca?: string | null;
  }
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
    clean(opts?.descricao) ||
    (row && "descricaoItem" in row
      ? clean(row.descricaoItem)
      : (row as SkuSimilarityCandidate)?.descricao);
  const marca =
    clean(opts?.marca) ||
    (row && "marca" in row ? clean(row.marca) : (row as SkuSimilarityCandidate)?.marca ?? null);

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
  cadastro?: {
    descricao: string;
    marca?: string | null;
    tipoNegocio?: string | null;
    precoUnitario?: number | null;
  } | null;
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

  const batch = await acceptPendingSkusFromFaturamentoBatch(items, {
    skipIdentityDePara: false,
    atomico: true,
  });
  return {
    ...batch,
    deParaCriados: batch.detalhes.filter(item => item.deParaCriado).length,
  };
}

export { SKU_SIMILARITY_DEPARA_AUTO_PICK };