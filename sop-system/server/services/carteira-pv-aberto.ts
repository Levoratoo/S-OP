import { and, eq, type SQL } from "drizzle-orm";
import { carteiraPedidos } from "../../drizzle/schema";

/** Carteira PV aberto = pedidos não faturados (ERP sincroniza só Liberado+PRG). */
export function carteiraPvAbertoWhere(): SQL {
  return eq(carteiraPedidos.faturado, false);
}

export function isCarteiraPvAbertoRow(row: { faturado: boolean | null | undefined }): boolean {
  return row.faturado !== true;
}

export function carteiraListWhere(apenasPvAberto: boolean | undefined): SQL | undefined {
  return apenasPvAberto ? carteiraPvAbertoWhere() : undefined;
}
