import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { produtos } from "../../drizzle/schema";
import { loadPrecoEGestorFaturamento } from "./ciclo-colab-extras";

export type PrecoBackfillResumo = {
  manual: number;
  faturamento_12m: number;
  cadastro: number;
  semPreco: number;
};

/** Recalcula preço automático. Origem manual não é sobrescrita. */
export async function refreshPrecosProdutosAutomatico(): Promise<PrecoBackfillResumo> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const fat = await loadPrecoEGestorFaturamento();
  const rows = await db.select().from(produtos);
  const resumo: PrecoBackfillResumo = { manual: 0, faturamento_12m: 0, cadastro: 0, semPreco: 0 };
  const now = new Date();

  for (const p of rows) {
    if ((p.precoOrigem || "") === "manual" && Number(p.precoUnitario) > 0) {
      resumo.manual += 1;
      continue;
    }
    const sku = (p.codItem || p.codigo || "").trim().toUpperCase();
    const fatPreco = sku ? fat.precoBySku.get(sku) : undefined;
    if (fatPreco && fatPreco > 0) {
      await db
        .update(produtos)
        .set({
          precoUnitario: String(fatPreco),
          precoOrigem: "faturamento_12m",
          precoAtualizadoEm: now,
          valorVenda: String(Math.round(fatPreco * 100) / 100),
        })
        .where(eq(produtos.id, p.id));
      resumo.faturamento_12m += 1;
      continue;
    }
    const cad = Number(p.valorVenda || p.precoUnitario || 0);
    if (cad > 0) {
      await db
        .update(produtos)
        .set({
          precoUnitario: String(cad),
          precoOrigem: p.precoOrigem || "cadastro",
          precoAtualizadoEm: now,
        })
        .where(eq(produtos.id, p.id));
      resumo.cadastro += 1;
      continue;
    }
    if ((p.status || "").toUpperCase() === "ATIVO") resumo.semPreco += 1;
  }
  return resumo;
}
