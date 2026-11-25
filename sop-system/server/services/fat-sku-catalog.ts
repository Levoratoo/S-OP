import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { fatSkuCatalog } from "../../drizzle/schema";

export type FatSkuCatalogRow = {
  codMaterial: string;
  descricaoItem: string | null;
  marca: string | null;
  linhaProduto: string | null;
  tipoNegocio: string | null;
  tipoEstoque: "MTS" | "MTO" | null;
  grupoProduto: string | null;
  notas: number;
};

/** Rebuild completo a partir de faturamento (uma varredura agregada). */
export async function refreshFatSkuCatalog(range?: {
  desde?: string;
  ate?: string;
}): Promise<{ linhas: number; ms: number }> {
  const conn = await getDb();
  if (!conn) return { linhas: 0, ms: 0 };
  const t0 = performance.now();
  const filtro =
    range?.desde && range?.ate
      ? sql`AND dataEmissao >= ${range.desde} AND dataEmissao < ${range.ate}`
      : sql``;

  await conn.execute(sql`
    INSERT INTO fat_sku_catalog (
      codMaterial, descricaoItem, marca, linhaProduto, tipoNegocio, tipoEstoque, grupoProduto, notas
    )
    SELECT
      codMaterial,
      MAX(descricaoItem),
      MAX(marca),
      MAX(linhaProduto),
      MAX(tipoNegocio),
      MAX(tipoEstoque),
      MAX(grupoProduto),
      COUNT(*)
    FROM faturamento
    WHERE codMaterial IS NOT NULL AND codMaterial <> ''
      ${filtro}
    GROUP BY codMaterial
    ON DUPLICATE KEY UPDATE
      descricaoItem = IF(VALUES(descricaoItem) IS NULL OR VALUES(descricaoItem) = '', descricaoItem, VALUES(descricaoItem)),
      marca = IF(VALUES(marca) IS NULL OR VALUES(marca) = '', marca, VALUES(marca)),
      linhaProduto = IF(VALUES(linhaProduto) IS NULL OR VALUES(linhaProduto) = '', linhaProduto, VALUES(linhaProduto)),
      tipoNegocio = IF(VALUES(tipoNegocio) IS NULL OR VALUES(tipoNegocio) = '', tipoNegocio, VALUES(tipoNegocio)),
      tipoEstoque = IF(VALUES(tipoEstoque) IS NULL, tipoEstoque, VALUES(tipoEstoque)),
      grupoProduto = IF(VALUES(grupoProduto) IS NULL OR VALUES(grupoProduto) = '', grupoProduto, VALUES(grupoProduto)),
      notas = ${range?.desde ? sql`GREATEST(notas, VALUES(notas))` : sql`VALUES(notas)`}
  `);

  const [countRow] = await conn.execute(sql`SELECT COUNT(*) AS n FROM fat_sku_catalog`);
  const n = Number((countRow as unknown as Array<{ n: number }>)[0]?.n ?? 0);
  const ms = Math.round(performance.now() - t0);
  console.info(`[fat_sku_catalog] refresh ${n} SKUs em ${ms}ms`);
  catalogReady = true;
  return { linhas: n, ms };
}

let catalogReady = false;
let catalogRefreshInflight: Promise<unknown> | null = null;

export async function ensureFatSkuCatalog(): Promise<void> {
  if (catalogReady) return;
  const conn = await getDb();
  if (!conn) return;
  const [countRow] = await conn.execute(sql`SELECT COUNT(*) AS n FROM fat_sku_catalog`);
  const n = Number((countRow as unknown as Array<{ n: number }>)[0]?.n ?? 0);
  if (n > 0) {
    catalogReady = true;
    return;
  }
  if (!catalogRefreshInflight) {
    catalogRefreshInflight = refreshFatSkuCatalog().finally(() => {
      catalogRefreshInflight = null;
    });
  }
}

export function invalidateFatSkuCatalogReady() {
  catalogReady = false;
}

export async function listFatSkuCatalog(): Promise<FatSkuCatalogRow[]> {
  const conn = await getDb();
  if (!conn) return [];
  const rows = await conn.select().from(fatSkuCatalog);
  return rows.map(r => ({
    codMaterial: r.codMaterial,
    descricaoItem: r.descricaoItem,
    marca: r.marca,
    linhaProduto: r.linhaProduto,
    tipoNegocio: r.tipoNegocio,
    tipoEstoque: r.tipoEstoque,
    grupoProduto: r.grupoProduto,
    notas: Number(r.notas) || 0,
  }));
}