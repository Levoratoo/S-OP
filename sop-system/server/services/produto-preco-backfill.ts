import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { carteiraPvEntregas, produtos } from "../../drizzle/schema";
import { loadPrecoEGestorFaturamento } from "./ciclo-colab-extras";
import { precoUnitario4 } from "@shared/preco-unitario";

/**
 * Origem do preço de cadastro:
 * - manual: só setPrecoManual (ou o formulário de produto). Nunca sobrescrito.
 * - legado_cadastro: valor que já estava em valorVenda na migração 0018. O automático pode substituir.
 * - erp_pedido / carteira: último preço > 0 em carteira_pv_entregas.
 * - faturamento_12m: média ponderada SAÍDA 12 meses (De-Para já aplicado em loadPrecoEGestorFaturamento).
 *
 * Ordem automática (igual ao fallback do PV, sem o preço já gravado):
 * carteira/ERP → faturamento 12m → mantém legado se não houver fonte.
 */
export type PrecoBackfillResumo = {
  manual: number;
  erp_pedido: number;
  faturamento_12m: number;
  legado_cadastro: number;
  semPreco: number;
};

async function precoCarteiraPorSku(): Promise<Map<string, number>> {
  const db = await getDb();
  const out = new Map<string, number>();
  if (!db) return out;
  const rows = await db
    .select({
      sku: carteiraPvEntregas.sku,
      preco: carteiraPvEntregas.precoUnitario,
      ano: carteiraPvEntregas.anoEnt,
      mes: carteiraPvEntregas.mesEnt,
    })
    .from(carteiraPvEntregas);
  const best = new Map<string, { preco: number; ord: number }>();
  for (const row of rows) {
    const sku = String(row.sku || "").trim().toUpperCase();
    const preco = Number(row.preco || 0);
    if (!sku || preco <= 0) continue;
    const ord = Number(row.ano) * 12 + Number(row.mes);
    const prev = best.get(sku);
    if (!prev || ord >= prev.ord) best.set(sku, { preco, ord });
  }
  for (const [sku, v] of best) out.set(sku, v.preco);
  return out;
}

export async function refreshPrecosProdutosAutomatico(): Promise<PrecoBackfillResumo> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [fat, carteira] = await Promise.all([loadPrecoEGestorFaturamento(), precoCarteiraPorSku()]);
  const rows = await db.select().from(produtos);
  const resumo: PrecoBackfillResumo = {
    manual: 0,
    erp_pedido: 0,
    faturamento_12m: 0,
    legado_cadastro: 0,
    semPreco: 0,
  };
  const now = new Date();

  for (const p of rows) {
    if ((p.precoOrigem || "") === "manual" && Number(p.precoUnitario) > 0) {
      resumo.manual += 1;
      continue;
    }
    const sku = (p.codItem || p.codigo || "").trim().toUpperCase();
    const daCarteira = sku ? carteira.get(sku) : undefined;
    const doFat = sku ? fat.precoBySku.get(sku) : undefined;
    let preco = 0;
    let origem: string | null = null;
    if (daCarteira && daCarteira > 0) {
      preco = daCarteira;
      origem = "erp_pedido";
    } else if (doFat && doFat > 0) {
      preco = doFat;
      origem = "faturamento_12m";
    }
    if (preco > 0 && origem) {
      const s = precoUnitario4(preco);
      await db
        .update(produtos)
        .set({
          precoUnitario: s,
          valorVenda: s,
          precoOrigem: origem,
          precoAtualizadoEm: now,
        })
        .where(eq(produtos.id, p.id));
      if (origem === "erp_pedido") resumo.erp_pedido += 1;
      else resumo.faturamento_12m += 1;
      continue;
    }
    const legado = Number(p.precoUnitario || p.valorVenda || 0);
    if (legado > 0) {
      if (!p.precoUnitario) {
        const s = precoUnitario4(legado);
        await db
          .update(produtos)
          .set({
            precoUnitario: s,
            valorVenda: s,
            precoOrigem: "legado_cadastro",
            precoAtualizadoEm: now,
          })
          .where(eq(produtos.id, p.id));
      }
      resumo.legado_cadastro += 1;
      continue;
    }
    if ((p.status || "").toUpperCase() === "ATIVO") resumo.semPreco += 1;
  }
  return resumo;
}

export function precoManualSincronizado(preco: number) {
  const s = precoUnitario4(preco);
  return {
    precoUnitario: s,
    valorVenda: s,
    precoOrigem: "manual" as const,
    precoAtualizadoEm: new Date(),
  };
}

/** Formulário/import: grava as duas colunas iguais. Origem manual só no formulário. */
export function sincronizarPrecoInput<T extends { valorVenda?: string | null; precoUnitario?: string | null }>(
  input: T,
  origem: "manual" | "legado_cadastro"
): T & { precoOrigem?: string; precoAtualizadoEm?: Date } {
  const raw = input.precoUnitario || input.valorVenda;
  if (raw == null || String(raw).trim() === "") return input;
  const n = Number(String(raw).replace(",", "."));
  if (!(n > 0)) return input;
  const s = precoUnitario4(n);
  return { ...input, precoUnitario: s, valorVenda: s, precoOrigem: origem, precoAtualizadoEm: new Date() };
}
