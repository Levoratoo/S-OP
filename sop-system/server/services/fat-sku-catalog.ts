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
export async function refreshFatSkuCatalog(): Promise<{ linhas: number; ms: number }> {
  const conn = await getDb();
  if (!conn) return { linhas: 0, ms: 0 };
  const t0 = performance.now();

  await conn.execute(sql`
    INSERT INTO fat_sku_catalog (
      codMaterial, descricaoItem, marca, linhaProduto, tipoNegocio, tipoEstoque, grupoProduto, notas
    )
    SELECT
      codMaterial,
      MAX(descricaoItem) AS descricaoItem,
      MAX(marca) AS marca,
      MAX(linhaProduto) AS linhaProduto,
      MAX(tipoNegocio) AS tipoNegocio,
      MAX(tipoEstoque) AS tipoEstoque,
      MAX(grupoProduto) AS grupoProduto,
      COUNT(*) AS notas
    FROM faturamento
    WHERE codMaterial IS NOT NULL AND codMaterial <> ''
    GROUP BY codMaterial
    ON DUPLICATE KEY UPDATE
      descricaoItem = VALUES(descricaoItem),
      marca = VALUES(marca),
      linhaProduto = VALUES(linhaProduto),
      tipoNegocio = VALUES(tipoNegocio),
      tipoEstoque = VALUES(tipoEstoque),
      grupoProduto = VALUES(grupoProduto),
      notas = VALUES(notas)
  `);

  const countRows = await conn.select({ codMaterial: fatSkuCatalog.codMaterial }).from(fatSkuCatalog);
  const ms = Math.round(performance.now() - t0);
  console.info(`[fat_sku_catalog] refresh ${countRows.length} SKUs em ${ms}ms`);
  catalogReady = true;
  return { linhas: countRows.length, ms };
}

let catalogReady = false;

export async function ensureFatSkuCatalog(): Promise<void> {
  if (catalogReady) return;
  const rows = await listFatSkuCatalog();
  if (rows.length > 0) {
    catalogReady = true;
    return;
  }
  await refreshFatSkuCatalog();
  catalogReady = true;
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