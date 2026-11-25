import { eq, or, sql } from "drizzle-orm";
import { getDb } from "../db";
import { deParaCodigos, faturamento, produtos } from "../../drizzle/schema";
import { buildValidatedDeParaMapDetailed } from "./de-para-map";

export class DeParaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeParaValidationError";
  }
}

function salesSinceIso(months: number): string {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

async function sumSaidaQty(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, sku: string, sinceIso: string) {
  const result = await db.execute(sql`
    SELECT COALESCE(SUM(ABS(qtd)), 0) AS total
    FROM faturamento
    WHERE tipoFaturamento = 'SAIDA'
      AND TRIM(codMaterial) = ${sku}
      AND dataEmissao >= ${sinceIso}
  `);
  const row = (result[0] as unknown as Array<{ total: unknown }>)?.[0];
  return Number(row?.total ?? 0);
}

async function loadProdutoByCode(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, code: string) {
  const c = code.trim();
  const [row] = await db
    .select({
      id: produtos.id,
      codItem: produtos.codItem,
      status: produtos.status,
      projetarEstatistica: produtos.projetarEstatistica,
    })
    .from(produtos)
    .where(or(eq(produtos.codItem, c), eq(produtos.codigo, c)))
    .limit(1);
  return row;
}

export function assertDeParaAcyclic(
  rows: Array<{ skuAntigo: string; skuNovo: string }>,
  options?: { extra?: { skuAntigo: string; skuNovo: string } }
): void {
  const all = [...rows];
  if (options?.extra) all.push(options.extra);
  try {
    buildValidatedDeParaMapDetailed(all, { dropCycles: false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new DeParaValidationError(
      msg.includes("Ciclo") ? msg : `Ciclo detectado no De-Para (ex.: A→B→A): ${msg}`
    );
  }
}

/**
 * Regras de negócio para novo par De-Para.
 * @throws DeParaValidationError
 */
export async function validateDeParaEdge(
  skuAntigo: string,
  skuNovo: string,
  existingRows?: Array<{ skuAntigo: string; skuNovo: string }>
): Promise<void> {
  const antigo = skuAntigo.trim().toUpperCase();
  const novo = skuNovo.trim();
  if (!antigo || !novo || antigo === novo.toUpperCase()) {
    throw new DeParaValidationError("Relação De-Para inválida.");
  }

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing =
    existingRows ??
    (await db.select({ skuAntigo: deParaCodigos.skuAntigo, skuNovo: deParaCodigos.skuNovo }).from(deParaCodigos));

  assertDeParaAcyclic(existing, { extra: { skuAntigo: antigo, skuNovo: novo } });

  const prodNovo = await loadProdutoByCode(db, novo);
  if (prodNovo && (prodNovo.status || "").toUpperCase() === "INATIVO") {
    throw new DeParaValidationError(
      `De-Para recusado: o SKU destino ${novo} está INATIVO no cadastro. Ative o produto ou escolha outro destino.`
    );
  }

  const prodAntigo = await loadProdutoByCode(db, antigo);
  if (
    prodAntigo &&
    (prodAntigo.status || "").toUpperCase() === "ATIVO" &&
    prodAntigo.projetarEstatistica === true
  ) {
    const since = salesSinceIso(3);
    const vendasAntigo = await sumSaidaQty(db, antigo, since);
    if (vendasAntigo > 0) {
      const vendasNovo = await sumSaidaQty(db, novo.trim(), since);
      if (vendasNovo <= 0) {
        throw new DeParaValidationError(
          `De-Para recusado: ${antigo} está ATIVO com Projetar e vendeu nos últimos 3 meses, ` +
            `mas ${novo} não tem venda SAÍDA no mesmo período. Corrija o destino ou aguarde faturamento do código novo.`
        );
      }
    }
  }
}

export async function inheritProjetarFromAntigo(skuAntigo: string, skuNovo: string) {
  const db = await getDb();
  if (!db) return;
  const antigo = skuAntigo.trim().toUpperCase();
  const novo = skuNovo.trim();
  const prodAntigo = await loadProdutoByCode(db, antigo);
  if (!prodAntigo?.projetarEstatistica) return;
  const prodNovo = await loadProdutoByCode(db, novo);
  if (!prodNovo) return;
  if (prodNovo.projetarEstatistica === true) return;
  await db
    .update(produtos)
    .set({ projetarEstatistica: true })
    .where(eq(produtos.id, prodNovo.id));
}