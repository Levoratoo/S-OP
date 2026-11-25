/**
 * Sincroniza Carteira / PV Aberto a partir do ERP (MetricsPROD),
 * filtrando Status Liberado + tipo PRG — sem importação manual.
 */
import { eq } from "drizzle-orm";
import { carteiraPedidos, carteiraPvEntregas } from "../../drizzle/schema";
import { getDb } from "../db";
import { queryErpCarteiraPedidosAbertos } from "./erp-mssql";
import { prepareImportCarteiraBySku, syncPvFromCarteiraEmCiclosAbertos } from "./ciclo-colab-extras";
import { buildCarteiraPvEntregasInserts } from "./carteira-pv-entregas";
import { loadDeParaMap } from "./de-para-map";

export type CarteiraSqlSyncResult = {
  fetched: number;
  importados: number;
  removidosAbertos: number;
  source: string;
  erros: string[];
  avisos: string[];
  ciclosPv: number;
  pvItens: number;
};

export async function syncCarteiraFromErp(): Promise<CarteiraSqlSyncResult> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { rows, entregas, source, fetched } = await queryErpCarteiraPedidosAbertos();

  const dePara = await loadDeParaMap(true);
  const entregaInserts = buildCarteiraPvEntregasInserts(entregas, dePara);
  const prepared = rows.length ? await prepareImportCarteiraBySku(
    rows.map(r => ({
      codigo: r.codigo,
      sequencia: r.sequencia,
      competencia: r.competencia,
      sku: r.sku,
      quantidade: r.quantidade,
      receitaBruta: r.receitaBruta,
      faturado: false,
    }))
  ) : { toInsert: [], erros: [], avisos: [] };

  const abertosAntes = await db
    .select({ id: carteiraPedidos.id })
    .from(carteiraPedidos)
    .where(eq(carteiraPedidos.faturado, false));
  const removidosAbertos = abertosAntes.length;

  if (!rows.length) {
    await db.transaction(async tx => {
      if (removidosAbertos > 0) {
        await tx.delete(carteiraPedidos).where(eq(carteiraPedidos.faturado, false));
      }
      await tx.delete(carteiraPvEntregas);
    });
    const pvCiclos = await syncPvFromCarteiraEmCiclosAbertos();
    return {
      fetched: 0,
      importados: 0,
      removidosAbertos,
      source,
      erros: [],
      avisos: ["ERP não retornou pedidos Liberado+PRG em aberto"],
      ciclosPv: pvCiclos.length,
      pvItens: pvCiclos.reduce((sum, item) => sum + item.itensCriados, 0),
    };
  }

  await db.transaction(async tx => {
    await tx.delete(carteiraPedidos).where(eq(carteiraPedidos.faturado, false));
    await tx.delete(carteiraPvEntregas);

    for (let i = 0; i < entregaInserts.length; i += 300) {
      await tx.insert(carteiraPvEntregas).values(entregaInserts.slice(i, i + 300));
    }

    for (const row of prepared.toInsert) {
      await tx
        .insert(carteiraPedidos)
        .values(row)
        .onDuplicateKeyUpdate({
          set: {
            competencia: row.competencia,
            quantidade: row.quantidade,
            receitaBruta: row.receitaBruta,
            produtoId: row.produtoId,
            faturado: row.faturado,
          },
        });
    }
  });

  const pvCiclos = await syncPvFromCarteiraEmCiclosAbertos();

  return {
    fetched,
    importados: prepared.toInsert.length,
    removidosAbertos,
    source,
    erros: prepared.erros,
    avisos: prepared.avisos,
    ciclosPv: pvCiclos.length,
    pvItens: pvCiclos.reduce((sum, item) => sum + item.itensCriados, 0),
  };
}