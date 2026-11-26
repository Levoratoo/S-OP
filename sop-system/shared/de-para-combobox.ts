export type ProdutoSelecionado = {
  codigo: string;
  descricao: string;
  marca?: string | null;
};

export function alternarSelecaoProduto(
  selecionados: ProdutoSelecionado[],
  produto: ProdutoSelecionado,
  opts?: { unico?: boolean; proibido?: string | null }
): { selecionados: ProdutoSelecionado[]; erro: string | null } {
  const codigo = produto.codigo.trim();
  if (!codigo) return { selecionados, erro: "Escolha um produto cadastrado." };
  const chave = codigo.toUpperCase();
  if (opts?.proibido && chave === opts.proibido.trim().toUpperCase()) {
    return { selecionados, erro: "O SKU novo não pode ser a própria referência." };
  }
  const item = { codigo, descricao: produto.descricao.trim(), marca: produto.marca?.trim() || null };
  if (opts?.unico) return { selecionados: [item], erro: null };
  const existe = selecionados.some(atual => atual.codigo.toUpperCase() === chave);
  if (existe) {
    return { selecionados: selecionados.filter(atual => atual.codigo.toUpperCase() !== chave), erro: null };
  }
  return { selecionados: [...selecionados, item], erro: null };
}

export function validarParesDePara(antigos: string[], novo: string): string | null {
  const destino = novo.trim();
  if (!antigos.length) return "Escolha ao menos um SKU antigo cadastrado.";
  if (!destino) return "Escolha o SKU novo cadastrado.";
  const vistos = new Set<string>();
  for (const antigo of antigos) {
    const chave = antigo.trim().toUpperCase();
    if (!chave) return "Escolha um SKU antigo cadastrado.";
    if (chave === destino.toUpperCase()) return `O SKU antigo ${antigo.trim()} não pode ser igual ao SKU novo.`;
    if (vistos.has(chave)) return `SKU antigo ${antigo.trim()} está repetido.`;
    vistos.add(chave);
  }
  return null;
}

export type LinhaReferenciaSku = {
  codMaterial: string;
  skuAntigo: string | null;
  sugestaoCodigo: string | null;
};

export function escolherReferenciaSku(
  linha: LinhaReferenciaSku,
  escolha: "sem" | "sugestao" | { codigo: string }
): { linha: LinhaReferenciaSku; erro: string | null } {
  if (escolha === "sem") return { linha: { ...linha, skuAntigo: null }, erro: null };
  if (escolha === "sugestao") return { linha: { ...linha, skuAntigo: linha.sugestaoCodigo }, erro: null };
  const codigo = escolha.codigo.trim();
  if (!codigo) return { linha, erro: "Escolha um produto cadastrado." };
  if (codigo.toUpperCase() === linha.codMaterial.trim().toUpperCase()) {
    return { linha, erro: "Não é possível usar o próprio código novo como referência." };
  }
  return { linha: { ...linha, skuAntigo: codigo }, erro: null };
}

export function payloadConfirmarReferencias(linhas: LinhaReferenciaSku[]) {
  return linhas.map(linha => ({
    codMaterial: linha.codMaterial,
    skuAntigo: linha.skuAntigo,
  }));
}

export type CadastroCarteiraInput = {
  codItem: string;
  descricao: string;
  marca: string;
  tipoNegocio: string;
  precoUnitario: number | null;
  skuAntigo: string | null;
};

export function validarCadastroCarteira(input: CadastroCarteiraInput): string | null {
  if (!input.codItem.trim()) return "Informe o código do item.";
  if (!input.descricao.trim()) return "Informe a descrição.";
  if (!input.tipoNegocio.trim()) return "Informe o tipo (PRG, JIT, ATD ou VAR).";
  if (input.precoUnitario == null || !Number.isFinite(input.precoUnitario) || input.precoUnitario < 0) {
    return "Informe o preço unitário com até 4 casas.";
  }
  if (input.skuAntigo && input.skuAntigo.trim().toUpperCase() === input.codItem.trim().toUpperCase()) {
    return "O SKU antigo não pode ser o próprio item.";
  }
  return null;
}

export function itemAceiteCarteira(input: CadastroCarteiraInput) {
  const erro = validarCadastroCarteira(input);
  if (erro) return { erro, item: null };
  return {
    erro: null,
    item: {
      codMaterial: input.codItem.trim(),
      skuAntigo: input.skuAntigo?.trim() || null,
      cadastro: {
        descricao: input.descricao.trim(),
        marca: input.marca.trim() || null,
        tipoNegocio: input.tipoNegocio.trim(),
        precoUnitario: input.precoUnitario,
      },
    },
  };
}

export function linhasAposCadastro<T extends { codItem: string; semCadastro?: boolean }>(
  rows: T[],
  codigo: string
): T[] {
  const chave = codigo.trim().toUpperCase();
  return rows.map(row =>
    row.codItem.trim().toUpperCase() === chave ? { ...row, semCadastro: false } : row
  );
}

export function contarSkusSemCadastro(rows: Array<{ codItem: string; semCadastro?: boolean }>): number {
  return new Set(
    rows.filter(row => row.semCadastro).map(row => row.codItem.trim().toUpperCase())
  ).size;
}
