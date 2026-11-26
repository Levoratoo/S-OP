import { cicloHorizonCalendar } from "@shared/ciclo-horizon";
import { precoUnitario4 } from "@shared/preco-unitario";

export type MesCompra = { ano: number; mes: number };

/** Próximos 3 meses do horizonte do ciclo (o mês seguinte ao processo, e mais dois). */
export function janelaCompraPapel(anoInicio: number, mesInicio: number): MesCompra[] {
  return [0, 1, 2].map(indice => {
    const calendario = cicloHorizonCalendar(anoInicio, mesInicio, indice);
    return { ano: calendario.year, mes: calendario.month };
  });
}

export function mesNaJanela(ano: number, mes: number, janela: MesCompra[]): boolean {
  return janela.some(item => item.ano === ano && item.mes === mes);
}

/** Cliente novo é a Aposta. O restante da carga CRM entra como Recompra. */
export function tipoCompraPapel(tipoCrm: string | null | undefined): "Cliente novo" | "Recompra" {
  const tipo = String(tipoCrm ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase();
  if (tipo === "APOSTA" || tipo.includes("CLIENTE NOVO")) return "Cliente novo";
  return "Recompra";
}

export function linhaIdCompraPapel(dealId: number, sku: string): string {
  return `d${dealId}-${sku.trim().toUpperCase()}`;
}

export type ParcelaNegocioCrm = {
  dealId: number;
  titulo: string;
  proprietario: string;
  proprietarioEmail: string;
  marca: string;
  temperatura: string;
  sku: string;
  descricao: string;
  tipo: string;
  ano: number;
  mes: number;
  quantidade: number;
  preco: number;
};

export type LinhaCompraPapel = {
  linhaId: string;
  dealId: number;
  titulo: string;
  proprietario: string;
  proprietarioEmail: string;
  marca: string;
  temperatura: string;
  sku: string;
  descricao: string;
  tipo: "Cliente novo" | "Recompra";
  meses: string[];
  quantidade: number;
  preco: number;
  valor: number;
};

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function rotuloMesCompra(ano: number, mes: number): string {
  return `${MESES[mes - 1] ?? mes}/${String(ano).slice(-2)}`;
}

export function montarLinhasCompraPapel(parcelas: ParcelaNegocioCrm[], janela: MesCompra[]): LinhaCompraPapel[] {
  const grupos = new Map<string, LinhaCompraPapel>();
  for (const parcela of parcelas) {
    if (!mesNaJanela(parcela.ano, parcela.mes, janela)) continue;
    if (!(parcela.quantidade > 0)) continue;
    const sku = parcela.sku.trim().toUpperCase();
    const id = linhaIdCompraPapel(parcela.dealId, sku);
    const preco = Number(precoUnitario4(parcela.preco));
    const atual = grupos.get(id) ?? {
      linhaId: id,
      dealId: parcela.dealId,
      titulo: parcela.titulo,
      proprietario: parcela.proprietario,
      proprietarioEmail: parcela.proprietarioEmail,
      marca: parcela.marca,
      temperatura: parcela.temperatura,
      sku,
      descricao: parcela.descricao,
      tipo: tipoCompraPapel(parcela.tipo),
      meses: [],
      quantidade: 0,
      preco,
      valor: 0,
    };
    const rotulo = rotuloMesCompra(parcela.ano, parcela.mes);
    if (!atual.meses.includes(rotulo)) atual.meses.push(rotulo);
    atual.quantidade += parcela.quantidade;
    atual.valor += parcela.quantidade * preco;
    if (!atual.temperatura && parcela.temperatura) atual.temperatura = parcela.temperatura;
    grupos.set(id, atual);
  }
  return [...grupos.values()].sort((a, b) => a.marca.localeCompare(b.marca, "pt-BR") || a.sku.localeCompare(b.sku));
}

export const RISCOS_COMPRA = ["BAIXO", "MEDIO", "ALTO"] as const;
export const DECISOES_COMPRA = ["SIM", "NAO", "PENDENTE"] as const;
export type RiscoCompra = (typeof RISCOS_COMPRA)[number];
export type DecisaoCompra = (typeof DECISOES_COMPRA)[number];

export function pendenciasCompraPapel(linhas: Array<{ comprar: string }>): number {
  return linhas.filter(linha => linha.comprar !== "SIM" && linha.comprar !== "NAO").length;
}

export function mensagemPendenciasCompraPapel(pendentes: number): string | null {
  if (pendentes <= 0) return null;
  return `Faltam ${pendentes} decisões de compra de papel. Abra a aba Compra de papel.`;
}

export type LinhaImportadaCompra = {
  linhaId: string;
  papel: string;
  risco: string;
  comprar: string;
  quantidade: string;
  observacao: string;
};

export function validarImportacaoCompraPapel(input: {
  linhas: LinhaImportadaCompra[];
  idsValidos: string[];
  papeis: Array<{ codigo: string; ativo: boolean }>;
}): Array<{ linhaId: string; erros: string[]; papelIdCodigo: string | null; risco: RiscoCompra | null; comprar: DecisaoCompra | null; quantidade: number | null; observacao: string }> {
  const ids = new Set(input.idsValidos);
  const papeis = new Map(input.papeis.map(papel => [papel.codigo.trim().toUpperCase(), papel]));
  return input.linhas.map(linha => {
    const erros: string[] = [];
    const linhaId = linha.linhaId.trim();
    if (!linhaId || !ids.has(linhaId)) erros.push("ID da linha não existe neste ciclo.");
    const papelCodigo = linha.papel.trim().toUpperCase();
    const papel = papelCodigo ? papeis.get(papelCodigo) : undefined;
    if (papelCodigo && !papel) erros.push(`Papel ${linha.papel.trim()} não está cadastrado.`);
    if (papel && !papel.ativo) erros.push(`Papel ${linha.papel.trim()} está inativo.`);
    const risco = linha.risco.trim().toUpperCase().normalize("NFD").replace(/\p{M}/gu, "");
    const riscoOk = (RISCOS_COMPRA as readonly string[]).includes(risco) ? (risco as RiscoCompra) : null;
    if (linha.risco.trim() && !riscoOk) erros.push("Risco deve ser Baixo, Médio ou Alto.");
    const comprarBruto = linha.comprar.trim().toUpperCase().normalize("NFD").replace(/\p{M}/gu, "");
    const comprarMap: Record<string, DecisaoCompra> = { SIM: "SIM", NAO: "NAO", PENDENTE: "PENDENTE" };
    const comprar = comprarMap[comprarBruto] ?? null;
    if (linha.comprar.trim() && !comprar) erros.push("Comprar deve ser Sim, Não ou Pendente.");
    let quantidade: number | null = null;
    if (linha.quantidade.trim()) {
      const texto = linha.quantidade.trim();
      const normalizado = texto.includes(",") ? texto.replace(/\./g, "").replace(",", ".") : texto;
      const n = Number(normalizado);
      if (!Number.isFinite(n) || n < 0) erros.push("Quantidade inválida.");
      else quantidade = n;
    }
    return {
      linhaId,
      erros,
      papelIdCodigo: papel?.ativo ? papel.codigo : null,
      risco: riscoOk,
      comprar,
      quantidade,
      observacao: linha.observacao.trim(),
    };
  });
}
