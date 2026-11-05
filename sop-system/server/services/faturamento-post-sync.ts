import { seedProdutosClientesFromFaturamento } from "./seed-from-faturamento";
import {
  autoCreateMarcasWithGestorFromImportMap,
  reconcileGestorMarcaImportMapAfterFaturamento,
} from "./gestor-marca-import-apply";

export type FaturamentoPostSyncResult = {
  clientes?: Awaited<ReturnType<typeof seedProdutosClientesFromFaturamento>>;
  clientesError?: string;
  marcasAuto?: unknown;
  marcasAutoError?: string;
  gestorMarca?: unknown;
  gestorMarcaError?: string;
};

/** Mensagens curtas para toast/UI após sync de faturamento. */
export function formatFaturamentoPostSyncAlerts(post: FaturamentoPostSyncResult | undefined): string[] {
  if (!post) return [];
  const alerts: string[] = [];
  if (post.clientesError) {
    alerts.push(`Clientes (pós-sync): ${post.clientesError}`);
  } else if (post.clientes?.clientes?.created && post.clientes.clientes.created > 0) {
    alerts.push(`+${post.clientes.clientes.created} cliente(s) sincronizados do faturamento`);
  }
  if (post.marcasAutoError) alerts.push(`Marcas×gestor: ${post.marcasAutoError}`);
  if (post.gestorMarcaError) alerts.push(`Mapa gestor×marca: ${post.gestorMarcaError}`);
  return alerts;
}

/** Rotinas após qualquer sync de faturamento (clientes, marcas×gestor). */
export async function runAfterFaturamentoSync(): Promise<FaturamentoPostSyncResult> {
  const results: FaturamentoPostSyncResult = {};
  try {
    results.clientes = await seedProdutosClientesFromFaturamento({ dryRun: false, clientesOnly: true });
  } catch (err) {
    console.warn("[faturamento] seed clientes pós-sync:", err);
    results.clientesError = err instanceof Error ? err.message : String(err);
  }
  try {
    results.marcasAuto = await autoCreateMarcasWithGestorFromImportMap();
  } catch (err) {
    console.warn("[faturamento] marcas import map:", err);
    results.marcasAutoError = err instanceof Error ? err.message : String(err);
  }
  try {
    results.gestorMarca = await reconcileGestorMarcaImportMapAfterFaturamento();
  } catch (err) {
    console.warn("[faturamento] reconcile gestor×marca:", err);
    results.gestorMarcaError = err instanceof Error ? err.message : String(err);
  }
  return results;
}
