import { TRPCError } from "@trpc/server";
import { filtrarProdutosBusca, type ProdutoBuscaItem } from "@shared/produto-busca";
import { getDb } from "../db";
import { produtos } from "../../drizzle/schema";

export async function listarProdutosParaBusca(): Promise<ProdutoBuscaItem[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      codItem: produtos.codItem,
      codigo: produtos.codigo,
      descricao: produtos.descricao,
      nome: produtos.nome,
      marca: produtos.marca,
    })
    .from(produtos);
  const itens: ProdutoBuscaItem[] = [];
  for (const row of rows) {
    const codigo = (row.codItem || row.codigo || "").trim();
    if (!codigo) continue;
    itens.push({
      codigo,
      descricao: (row.descricao || row.nome || "").trim(),
      marca: row.marca?.trim() || null,
    });
  }
  itens.sort((a, b) => a.codigo.localeCompare(b.codigo, "pt-BR"));
  return itens;
}

export async function buscarProdutosCadastrados(input: {
  query: string;
  limit: number;
  excluir?: string[];
}): Promise<ProdutoBuscaItem[]> {
  const itens = await listarProdutosParaBusca();
  return filtrarProdutosBusca(itens, input.query, input.limit, input.excluir ?? []);
}

export async function exigirProdutosCadastrados(codigos: string[]) {
  const cadastrados = new Set((await listarProdutosParaBusca()).map(item => item.codigo.toUpperCase()));
  const faltando = [
    ...new Set(codigos.map(codigo => codigo.trim().toUpperCase()).filter(codigo => codigo && !cadastrados.has(codigo))),
  ];
  if (!faltando.length) return;
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: `SKU não cadastrado: ${faltando.join(", ")}. Escolha um produto do cadastro.`,
  });
}
