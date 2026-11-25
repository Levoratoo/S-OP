import {
  buildPvPivotLinesFromEntregas,
  computeEntregaMonthColumns,
  type PvMtoEntregaInput,
} from "@shared/pv-mto-pivot";
import { loadProdutoMaps } from "./ciclo-colab-extras";
import { listCarteiraPvEntregas } from "./carteira-pv-entregas";
import { carteiraPedidos } from "../../drizzle/schema";
import { getDb } from "../db";
import { carteiraPvAbertoWhere } from "./carteira-pv-aberto";
import { sql } from "drizzle-orm";

function toNum(v: unknown) {
  const n = Number(String(v ?? "0").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export type CarteiraPivotRow = {
  marca: string | null;
  codItem: string;
  descricao: string | null;
  tipo: string | null;
  precoUnitario: number;
  numPedido: string;
  meses: number[];
  quantidadeTotal: number;
  receitaTotal: number;
  cliente: string | null;
  faturado: boolean;
};

export async function getCarteiraPvPivotGrade() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  let entregasRaw = await listCarteiraPvEntregas();
  const entregas: PvMtoEntregaInput[] = entregasRaw.map(e => ({
    codigo: e.codigo,
    sku: e.sku,
    precoUnitario: toNum(e.precoUnitario),
    anoEnt: e.anoEnt,
    mesEnt: e.mesEnt,
    quantidade: toNum(e.quantidade),
    receitaBruta: toNum(e.receitaBruta),
  }));

  if (!entregas.length) {
    const { byId } = await loadProdutoMaps();
    const pedidos = await db.select().from(carteiraPedidos).where(carteiraPvAbertoWhere());
    for (const p of pedidos) {
      const d = p.competencia instanceof Date ? p.competencia : new Date(String(p.competencia));
      if (Number.isNaN(d.getTime())) continue;
      const prod = byId.get(p.produtoId);
      const sku = (prod?.codItem || prod?.codigo || "").trim();
      if (!sku) continue;
      const qtd = toNum(p.quantidade);
      const rec = toNum(p.receitaBruta);
      entregas.push({
        codigo: String(p.codigo || "").trim(),
        sku,
        precoUnitario: qtd > 0 ? rec / qtd : 0,
        anoEnt: d.getUTCFullYear(),
        mesEnt: d.getUTCMonth() + 1,
        quantidade: qtd,
        receitaBruta: rec,
      });
    }
  }

  const columns = computeEntregaMonthColumns(entregas);
  const pivotLines = buildPvPivotLinesFromEntregas(entregas, columns);
  const { byCode } = await loadProdutoMaps();

  const rows: CarteiraPivotRow[] = pivotLines
    .map(line => {
      const prod = byCode.get(line.sku.toUpperCase());
      return {
        marca: prod?.marca ?? null,
        codItem: line.sku,
        descricao: prod?.descricao ?? prod?.nome ?? null,
        tipo: prod?.tipoNegocio ?? null,
        precoUnitario: line.precoUnitario,
        numPedido: line.numPedido,
        meses: line.meses,
        quantidadeTotal: line.quantidadeTotal,
        receitaTotal: line.receitaTotal,
        cliente: null,
        faturado: false,
      };
    })
    .sort((a, b) => {
      const ma = (a.marca || "").localeCompare(b.marca || "", "pt-BR");
      if (ma) return ma;
      const sk = a.codItem.localeCompare(b.codItem, "pt-BR");
      if (sk) return sk;
      return a.numPedido.localeCompare(b.numPedido, "pt-BR");
    });

  const monthTotals = Array(columns.length).fill(0);
  let grandQty = 0;
  let grandRs = 0;
  for (const row of rows) {
    grandQty += row.quantidadeTotal;
    grandRs += row.receitaTotal;
    row.meses.forEach((v, i) => {
      monthTotals[i] += v;
    });
  }

  const [totaisCarteira] = (await db.execute(sql`
    SELECT
      SUM(COALESCE(quantidade, 0)) AS qtd,
      SUM(COALESCE(receitaBruta, 0)) AS receita
    FROM carteira_pedidos
    WHERE faturado = 0
  `)) as unknown as [Array<{ qtd: string; receita: string }>];

  return {
    horizonLabels: columns.map(c => c.label),
    rows,
    monthTotals: monthTotals.map(v => Math.round(v * 100) / 100),
    grandQuantidade: Math.round(grandQty * 100) / 100,
    grandReceita: Math.round(grandRs * 100) / 100,
    conferencia: {
      carteiraQuantidade: toNum(totaisCarteira?.[0]?.qtd),
      carteiraReceita: toNum(totaisCarteira?.[0]?.receita),
    },
    /** sequencia em carteira_pedidos = ordem do SKU dentro do pedido (1º, 2º item), não entrega. */
    numPedidoNota:
      "Nº Pedido exibe só o código ERP (NumPedido); o sufixo /sequencia na lista antiga era a linha do item no pedido.",
  };
}