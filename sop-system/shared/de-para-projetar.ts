/** Projetar efetivo: canônico ou qualquer antigo no De-Para apontando para ele. */
export function buildAntigosPorNovo(deParaMap: Map<string, string>): Map<string, string[]> {
  const rev = new Map<string, string[]>();
  for (const [antigo, novo] of deParaMap) {
    const key = novo.trim().toUpperCase();
    const list = rev.get(key) ?? [];
    list.push(antigo.trim().toUpperCase());
    rev.set(key, list);
  }
  return rev;
}

export type ProdutoProjetarRef = {
  projetarEstatistica?: boolean | null;
};

export function skuProjetarEfetivo(
  skuCanonical: string,
  produtoByCodigo: Map<string, ProdutoProjetarRef>,
  deParaMap: Map<string, string>
): boolean {
  const key = skuCanonical.trim().toUpperCase();
  const prod = produtoByCodigo.get(key);
  if (prod?.projetarEstatistica === true) return true;
  for (const [antigo, novo] of deParaMap) {
    if (novo.trim().toUpperCase() !== key) continue;
    const old = produtoByCodigo.get(antigo.trim().toUpperCase());
    if (old?.projetarEstatistica === true) return true;
  }
  return false;
}

export function isDeParaCanonicalTarget(sku: string, deParaMap: Map<string, string>): boolean {
  const u = sku.trim().toUpperCase();
  for (const novo of deParaMap.values()) {
    if (novo.trim().toUpperCase() === u) return true;
  }
  return false;
}