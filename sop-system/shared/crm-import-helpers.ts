import { precoUnitario4 } from "@shared/preco-unitario";

/** Código acabado no layout SNOP (80.xx.xxxxxx). */
export const CRM_SKU_PATTERN = /^\d{2}\.\d{2}\.\d{6}$/;

/** Preço de 4 casas usado para não misturar deals do mesmo SKU. */
export function precoChaveCrm(valorVenda: number): string {
  const n = Number(valorVenda);
  return precoUnitario4(Number.isFinite(n) && n > 0 ? n : 0);
}

/** Agrupa a carga por SKU + tipo + preço. Preços diferentes não compartilham valorVendaSnapshot. */
export function chaveAgregacaoCrm(sku: string, crmTipo: string, valorVenda: number): string {
  return `${sku.trim().toUpperCase()}||${crmTipo}||${precoChaveCrm(valorVenda)}`;
}

export type ParcelaValorCrm = {
  sku: string;
  tipo: string;
  preco: number;
  mes: number;
  qtd: number;
};

/**
 * Valor que o resumo do ciclo grava: cada grupo (SKU + tipo + preço) contribui
 * quantidade do mês × preço. É o mesmo número da prévia do Pipedrive.
 */
export function valorGravadoCrm(parcelas: ParcelaValorCrm[]): {
  total: number;
  porMes: number[];
  grupos: number;
} {
  const grupos = new Map<string, { preco: number; meses: number[] }>();
  for (const parcela of parcelas) {
    const preco = Number(precoChaveCrm(parcela.preco));
    const key = chaveAgregacaoCrm(parcela.sku, parcela.tipo, preco);
    const grupo = grupos.get(key) ?? { preco, meses: Array(12).fill(0) };
    if (parcela.mes >= 0 && parcela.mes < 12) grupo.meses[parcela.mes] += parcela.qtd;
    grupos.set(key, grupo);
  }
  const porMes = Array(12).fill(0);
  let total = 0;
  for (const grupo of grupos.values()) {
    for (let i = 0; i < 12; i++) {
      const valor = grupo.meses[i] * grupo.preco;
      porMes[i] += valor;
      total += valor;
    }
  }
  return { total, porMes, grupos: grupos.size };
}

export function isCrmSkuCodigoValido(sku: string | null | undefined): boolean {
  return CRM_SKU_PATTERN.test(String(sku ?? "").trim());
}

/** Coluna Tipo do Excel CRM → tipoEstoque. PRG → MTS; JIT (MTO) → MTO. */
export function crmTipoExcelParaEstoque(tipoExcel: string | null | undefined): "MTS" | "MTO" {
  const u = String(tipoExcel ?? "")
    .trim()
    .toUpperCase();
  if (u.includes("MTO") || (u.includes("JIT") && !u.includes("MTS"))) return "MTO";
  return "MTS";
}

/** Extrai JIT / PRG / VAR / ATD quando legível. */
export function crmTipoExcelParaNegocio(tipoExcel: string | null | undefined): string | null {
  const u = String(tipoExcel ?? "")
    .trim()
    .toUpperCase();
  if (u.includes("PRG")) return "PRG";
  if (u.includes("ATD")) return "ATD";
  if (u.includes("VAR")) return "VAR";
  if (u.includes("JIT")) return "JIT";
  return null;
}

export const CADASTRO_ORIGEM_CRM_AUTO = "CRM_AUTO";

const GENERICO_RE = /generico|genérico/i;

/** Mesma regex usada na carga CRM: código ou descrição com “genérico”. */
export function textoPareceSkuGenerico(
  sku: string | null | undefined,
  ...textos: Array<string | null | undefined>
): boolean {
  if (GENERICO_RE.test(String(sku ?? ""))) return true;
  return textos.some(texto => GENERICO_RE.test(String(texto ?? "")));
}

/**
 * A importação Excel bloqueia Aposta genérica sem orçamento.
 * A sincronização do Pipedrive passa `permitirSemOrcamento` e só alerta.
 */
export function apostaGenericaSemOrcamentoDeveBloquear(
  generico: boolean,
  crmTipo: string,
  orcamento: number,
  permitirSemOrcamento = false
): boolean {
  return generico && crmTipo === "APOSTA" && orcamento <= 0 && !permitirSemOrcamento;
}