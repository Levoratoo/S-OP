import {
  buildPvPivotLinesFromEntregas,
  computeEntregaMonthColumns,
  type PvMtoEntregaInput,
} from "@shared/pv-mto-pivot";
import { loadProdutoMaps } from "./ciclo-colab-extras";
import { buildCarteiraErpSkuMetaMap, listCarteiraPvEntregas } from "./carteira-pv-entregas";
import { carteiraPedidos } from "../../drizzle/schema";
import { getDb } from "../db";
import { carteiraPvAbertoWhere } from "./carteira-pv-aberto";
import { sql } from "drizzle-orm";
import { loadFaturamentoSkuMeta } from "./seed-from-faturamento";
import {
  buildCarteiraPrecoPorSkuFromEntregas,
  resolvePvPrecoUnitarioComOrigem,
  type PrecoOrigemPv,
} from "@shared/pv-preco-fallback";
import { loadPrecoEGestorFaturamento } from "./ciclo-colab-extras";
import { receitaPivotComPrecoResolvido, resolveSkuDisplayMeta } from "@shared/carteira-sku-display";

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
  precoOrigem?: PrecoOrigemPv | null;
  numPedido: string;
  meses: number[];
  quantidadeTotal: number;
  receitaTotal: number;
  receitaErp?: number;
  receitaEstimada?: number;
  cliente: string | null;
  faturado: boolean;
  semCadastro?: boolean;
};

export async function getCarteiraPvPivotGrade() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const entregasRaw = await listCarteiraPvEntregas();
  const erpSkuMeta = buildCarteiraErpSkuMetaMap(entregasRaw);

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

  const fatLookup = await loadPrecoEGestorFaturamento();
  const carteiraPrecoPorSku = buildCarteiraPrecoPorSkuFromEntregas(
    entregas.map(e => ({
      sku: e.sku,
      precoUnitario: e.precoUnitario,
      quantidade: e.quantidade,
      receitaBruta: e.receitaBruta,
    }))
  );

  const columns = computeEntregaMonthColumns(entregas);
  const pivotLines = buildPvPivotLinesFromEntregas(entregas, columns);
  const { byCode } = await loadProdutoMaps();

  const missingSkus = [
    ...new Set(
      pivotLines.map(l => l.sku.trim().toUpperCase()).filter(sku => sku && !byCode.has(sku))
    ),
  ];
  const faturamentoMeta = await loadFaturamentoSkuMeta(missingSkus);

  const rows: CarteiraPivotRow[] = pivotLines
    .map(line => {
      const skuKey = line.sku.trim().toUpperCase();
      const prod = byCode.get(skuKey);
      const erp = erpSkuMeta.get(skuKey);
      const fat = faturamentoMeta.get(skuKey);
      const display = resolveSkuDisplayMeta(prod, erp, fat);
      const semCadastro = !prod;
      const precoRes = resolvePvPrecoUnitarioComOrigem({
        erpPreco: line.precoUnitario,
        receitaBruta: line.receitaTotal,
        quantidade: line.quantidadeTotal,
        sku: line.sku,
        cadastroPreco: prod ? toNum(prod.valorVenda) : undefined,
        carteiraPrecoPorSku,
        faturamento12mPorSku: fatLookup.precoBySku,
      });
      const usouFallback = precoRes.origem !== "erp" && precoRes.origem !== "receita_linha";
      const receita = receitaPivotComPrecoResolvido(
        line.quantidadeTotal,
        line.receitaTotal,
        precoRes.preco,
        usouFallback
      );
      return {
        marca: display.marca,
        codItem: line.sku,
        descricao: display.descricao,
        tipo: display.tipo,
        precoUnitario: precoRes.preco,
        precoOrigem: precoRes.origem,
        numPedido: line.numPedido,
        meses: line.meses,
        quantidadeTotal: line.quantidadeTotal,
        receitaTotal: receita.receitaTotal,
        receitaErp: receita.receitaErp,
        receitaEstimada: receita.receitaEstimada,
        cliente: null,
        faturado: false,
        semCadastro,
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
  let grandRsErp = 0;
  let grandRsEstimada = 0;
  let semCadastroQty = 0;
  let semCadastroRs = 0;
  const semCadastroSkus = new Set<string>();
  for (const row of rows) {
    grandQty += row.quantidadeTotal;
    grandRs += row.receitaTotal;
    grandRsErp += row.receitaErp ?? 0;
    grandRsEstimada += row.receitaEstimada ?? 0;
    if (row.semCadastro) {
      semCadastroSkus.add(row.codItem.toUpperCase());
      semCadastroQty += row.quantidadeTotal;
      semCadastroRs += row.receitaTotal;
    }
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

  const carteiraQuantidade = toNum(totaisCarteira?.[0]?.qtd);
  const carteiraReceita = toNum(totaisCarteira?.[0]?.receita);

  return {
    horizonLabels: columns.map(c => c.label),
    rows,
    monthTotals: monthTotals.map(v => Math.round(v * 100) / 100),
    grandQuantidade: Math.round(grandQty * 100) / 100,
    grandReceita: Math.round(grandRs * 100) / 100,
    conferencia: {
      carteiraQuantidade,
      carteiraReceita,
      receitaErpPivot: Math.round(grandRsErp * 100) / 100,
      receitaEstimadaPivot: Math.round(grandRsEstimada * 100) / 100,
      semCadastroSkuCount: semCadastroSkus.size,
      semCadastroQuantidade: Math.round(semCadastroQty * 100) / 100,
      semCadastroReceita: Math.round(semCadastroRs * 100) / 100,
      explicacaoDiferencaLista:
        "A pivot soma entregas por mês (carteira_pv_entregas) e inclui SKUs sem cadastro. " +
        "Receita «ERP» vem do ERP; «estimada» usa quantidade × preço resolvido (fallback). " +
        "A lista carteira_pedidos só traz linhas com produto cadastrado.",
    },
    numPedidoNota:
      "Nº Pedido exibe só o código ERP (NumPedido); o sufixo /sequencia na lista antiga era a linha do item no pedido.",
  };
}