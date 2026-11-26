import { normalizeForSearch } from "@shared/text-search";

export type ProdutoBuscaItem = {
  codigo: string;
  descricao: string;
  marca?: string | null;
};

/** Cada palavra da busca precisa aparecer no código, na descrição ou na marca. */
export function produtoCombinaBusca(item: ProdutoBuscaItem, query: string): boolean {
  const termos = normalizeForSearch(query).split(/\s+/).filter(Boolean);
  if (!termos.length) return true;
  const hay = normalizeForSearch([item.codigo, item.descricao, item.marca ?? ""].join(" "));
  return termos.every(termo => hay.includes(termo));
}

export function filtrarProdutosBusca(
  items: ProdutoBuscaItem[],
  query: string,
  limit: number,
  excluir: string[] = []
): ProdutoBuscaItem[] {
  const ban = new Set(excluir.map(codigo => codigo.trim().toUpperCase()).filter(Boolean));
  const saida: ProdutoBuscaItem[] = [];
  const vistos = new Set<string>();
  for (const item of items) {
    const codigo = item.codigo.trim();
    if (!codigo) continue;
    const chave = codigo.toUpperCase();
    if (ban.has(chave) || vistos.has(chave)) continue;
    if (!produtoCombinaBusca({ ...item, codigo }, query)) continue;
    vistos.add(chave);
    saida.push({ codigo, descricao: item.descricao.trim(), marca: item.marca?.trim() || null });
    if (saida.length >= limit) break;
  }
  return saida;
}

export function rotuloProduto(item: {
  codigo: string;
  descricao?: string | null;
  marca?: string | null;
  score?: number | null;
}): string {
  const descricao = (item.descricao || "").trim();
  const marca = (item.marca || "").trim();
  const base = descricao ? `${item.codigo} — ${descricao}` : item.codigo;
  const comMarca = marca ? `${base} · ${marca}` : base;
  if (item.score != null && Number.isFinite(item.score)) {
    return `${comMarca} (${Math.round(item.score * 100)}%)`;
  }
  return comMarca;
}
