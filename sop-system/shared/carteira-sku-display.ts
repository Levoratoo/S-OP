export type SkuDisplayMetaSource = {
  descricao?: string | null;
  marca?: string | null;
  tipo?: string | null;
};

export type SkuCadastroMeta = {
  descricao?: string | null;
  nome?: string | null;
  marca?: string | null;
  tipoNegocio?: string | null;
};

/** Cadastro → ERP (carteira) → faturamento. */
export function resolveSkuDisplayMeta(
  prod: SkuCadastroMeta | null | undefined,
  erp: SkuDisplayMetaSource | null | undefined,
  fat: SkuDisplayMetaSource | null | undefined
): { descricao: string | null; marca: string | null; tipo: string | null } {
  const descricao =
    (prod?.descricao || prod?.nome || "").trim() ||
    (erp?.descricao || "").trim() ||
    (fat?.descricao || "").trim() ||
    null;
  const marca = (prod?.marca || "").trim() || (erp?.marca || "").trim() || (fat?.marca || "").trim() || null;
  const tipo =
    (prod?.tipoNegocio || "").trim() || (erp?.tipo || "").trim() || (fat?.tipo || "").trim() || null;
  return { descricao, marca, tipo };
}

export function receitaPivotComPrecoResolvido(
  quantidadeTotal: number,
  receitaErpSomada: number,
  precoResolvido: number,
  usouFallbackPreco: boolean
): { receitaTotal: number; receitaErp: number; receitaEstimada: number } {
  const qtd = Number(quantidadeTotal) || 0;
  const receitaErp = Number(receitaErpSomada) || 0;
  if (usouFallbackPreco && precoResolvido > 0 && qtd > 0) {
    const estimada = Math.round(qtd * precoResolvido * 100) / 100;
    return { receitaTotal: estimada, receitaErp: 0, receitaEstimada: estimada };
  }
  if (receitaErp > 0) {
    return { receitaTotal: Math.round(receitaErp * 100) / 100, receitaErp, receitaEstimada: 0 };
  }
  if (precoResolvido > 0 && qtd > 0) {
    const est = Math.round(qtd * precoResolvido * 100) / 100;
    return { receitaTotal: est, receitaErp: 0, receitaEstimada: est };
  }
  return { receitaTotal: 0, receitaErp: 0, receitaEstimada: 0 };
}