import { seedProdutosClientesFromFaturamento } from "./seed-from-faturamento";
import {
  autoCreateMarcasWithGestorFromImportMap,
  reconcileGestorMarcaImportMapAfterFaturamento,
} from "./gestor-marca-import-apply";

/** Rotinas após qualquer sync de faturamento (clientes, marcas×gestor). */
export async function runAfterFaturamentoSync() {
  const results: Record<string, unknown> = {};
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
