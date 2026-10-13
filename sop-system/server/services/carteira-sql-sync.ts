/**
 * Sincroniza Carteira / PV Aberto a partir do ERP (MetricsPROD),
 * filtrando Status Liberado + tipo PRG — sem importação manual.
 */
import { eq } from "drizzle-orm";
import { carteiraPedidos } from "../../drizzle/schema";
import { getDb } from "../db";
import { queryErpCarteiraPedidosAbertos } from "./erp-mssql";
import { importCarteiraBySku } from "./ciclo-colab-extras";

export type CarteiraSqlSyncResult = {
  fetched: number;
  importados: number;
  removidosAbertos: number;
  source: string;
  erros: string[];
  avisos: string[];
};

export async function syncCarteiraFromErp(): Promise<CarteiraSqlSyncResult> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { rows, source, fetched } = await queryErpCarteiraPedidosAbertos();

  // Substitui apenas pedidos em aberto (não faturados) — fonte da verdade = ERP.
  const abertosAntes = await db
    .select({ id: carteiraPedidos.id })
    .from(carteiraPedidos)
    .where(eq(carteiraPedidos.faturado, false));
  const removidosAbertos = abertosAntes.length;
  if (removidosAbertos > 0) {
    await db.delete(carteiraPedidos).where(eq(carteiraPedidos.faturado, false));
  }

  if (!rows.length) {
    return {
      fetched: 0,
      importados: 0,
      removidosAbertos,
      source,
      erros: [],
      avisos: ["ERP não retornou pedidos Liberado+PRG em aberto"],
    };
  }

  const importResult = await importCarteiraBySku(
    rows.map(r => ({
      codigo: r.codigo,
      sequencia: r.sequencia,
      competencia: r.competencia,
      sku: r.sku,
      quantidade: r.quantidade,
      receitaBruta: r.receitaBruta,
      faturado: false,
    }))
  );

  return {
    fetched,
    importados: importResult.importados,
    removidosAbertos,
    source,
    erros: importResult.erros,
    avisos: importResult.avisos,
  };
}
