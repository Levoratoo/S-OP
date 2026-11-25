export type SkuSimilarityCandidate = {
  codigo: string;
  descricao: string;
  marca?: string | null;
};

export type SkuSimilarityTarget = {
  codigo: string;
  descricao: string;
  marca?: string | null;
};

const MESES_CURTO = new Set([
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
]);

const BAIXO_PESO = new Set([
  "sacola",
  "envelope",
  "sac",
  "fsc",
  "misto",
  "papel",
  "seda",
  "embalagens",
  "de",
  "da",
  "do",
  "e",
  "o",
  "a",
  "em",
  "para",
  "com",
  "no",
  "na",
  "made",
  "in",
  "brazil",
  "misto",
  "genérico",
  "generico",
  "sku",
]);

const TAMANHOS = new Set(["pp", "p", "m", "g", "gg", "xg"]);

export function normalizeDescricaoTexto(raw: string): string {
  return String(raw ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenPeso(token: string): number {
  if (/^\d{4}$/.test(token)) return 0;
  if (TAMANHOS.has(token)) return 0.15;
  if (BAIXO_PESO.has(token)) return 0.25;
  return 1;
}

export function tokenizeDescricaoParaSimilaridade(descricao: string): Map<string, number> {
  const norm = normalizeDescricaoTexto(descricao);
  const out = new Map<string, number>();
  for (const t of norm.split(/\s+/).filter(Boolean)) {
    const peso = tokenPeso(t);
    if (peso <= 0) continue;
    out.set(t, Math.max(out.get(t) ?? 0, peso));
  }
  return out;
}

function weightedJaccard(a: Map<string, number>, b: Map<string, number>): number {
  let inter = 0;
  let union = 0;
  const keys = new Set([...a.keys(), ...b.keys()]);
  for (const k of keys) {
    const va = a.get(k) ?? 0;
    const vb = b.get(k) ?? 0;
    inter += Math.min(va, vb);
    union += Math.max(va, vb);
  }
  if (union <= 0) return 0;
  return inter / union;
}

function trigramSet(s: string): Set<string> {
  const pad = `  ${s} `;
  const set = new Set<string>();
  for (let i = 0; i < pad.length - 2; i++) set.add(pad.slice(i, i + 3));
  return set;
}

function trigramSimilarity(a: string, b: string): number {
  const sa = trigramSet(a);
  const sb = trigramSet(b);
  if (!sa.size || !sb.size) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter += 1;
  return (2 * inter) / (sa.size + sb.size);
}

export function scoreSkuDescricaoSimilarity(
  target: SkuSimilarityTarget,
  candidate: SkuSimilarityCandidate
): number {
  if (candidate.codigo.trim().toUpperCase() === target.codigo.trim().toUpperCase()) return 0;

  const ta = tokenizeDescricaoParaSimilaridade(target.descricao);
  const tb = tokenizeDescricaoParaSimilaridade(candidate.descricao);
  const jac = weightedJaccard(ta, tb);

  const na = normalizeDescricaoTexto(target.descricao);
  const nb = normalizeDescricaoTexto(candidate.descricao);
  const tri = trigramSimilarity(na, nb);

  let score = jac * 0.55 + tri * 0.45;

  const marcaT = normalizeDescricaoTexto(target.marca || "");
  const marcaC = normalizeDescricaoTexto(candidate.marca || "");
  if (marcaT && marcaC) {
    if (marcaT === marcaC) score = Math.min(1, score + 0.12);
    else if (marcaT.includes(marcaC) || marcaC.includes(marcaT)) score = Math.min(1, score + 0.06);
    else score *= 0.82;
  }

  return Math.round(score * 1000) / 1000;
}

export function rankSkuSimilarityCandidates(
  target: SkuSimilarityTarget,
  candidates: SkuSimilarityCandidate[],
  limit = 10
): Array<SkuSimilarityCandidate & { score: number }> {
  return candidates
    .map(c => ({ ...c, score: scoreSkuDescricaoSimilarity(target, c) }))
    .filter(c => c.score > 0.05)
    .sort((a, b) => b.score - a.score || a.codigo.localeCompare(b.codigo, "pt-BR"))
    .slice(0, limit);
}

/** Limiar para pré-seleção em lote (Produtos). */
export const SKU_SIMILARITY_AUTO_PICK = 0.85;
/** Abaixo disso destaca em amarelo (De-Para). */
export const SKU_SIMILARITY_REVIEW_WARN = 0.6;