import { sql } from "drizzle-orm";
import * as db from "../db";

export type DeParaComDescricao = {
  id: number;
  skuAntigo: string;
  skuNovo: string;
  descricaoAntigo: string | null;
  descricaoNovo: string | null;
};

export async function listDeParaCodigosComDescricoes(): Promise<DeParaComDescricao[]> {
  const conn = await db.getDb();
  if (!conn) return [];

  const result = await conn.execute(sql`
    SELECT
      d.id,
      d.sku_antigo,
      d.sku_novo,
      COALESCE(pa.descricao, pa.nome, fa.descricaoItem) AS descricaoAntigo,
      COALESCE(pn.descricao, pn.nome, fn.descricaoItem) AS descricaoNovo
    FROM de_para_codigos d
    LEFT JOIN produtos pa ON UPPER(TRIM(pa.codItem)) = UPPER(TRIM(d.sku_antigo))
      OR UPPER(TRIM(pa.codigo)) = UPPER(TRIM(d.sku_antigo))
    LEFT JOIN produtos pn ON UPPER(TRIM(pn.codItem)) = UPPER(TRIM(d.sku_novo))
      OR UPPER(TRIM(pn.codigo)) = UPPER(TRIM(d.sku_novo))
    LEFT JOIN (
      SELECT TRIM(codMaterial) AS cod, MAX(descricaoItem) AS descricaoItem
      FROM faturamento
      WHERE codMaterial IS NOT NULL AND TRIM(codMaterial) <> ''
      GROUP BY TRIM(codMaterial)
    ) fa ON fa.cod = TRIM(d.sku_antigo)
    LEFT JOIN (
      SELECT TRIM(codMaterial) AS cod, MAX(descricaoItem) AS descricaoItem
      FROM faturamento
      WHERE codMaterial IS NOT NULL AND TRIM(codMaterial) <> ''
      GROUP BY TRIM(codMaterial)
    ) fn ON fn.cod = TRIM(d.sku_novo)
    ORDER BY d.sku_antigo
  `);

  const rows = (result[0] as unknown as Array<Record<string, unknown>>) ?? [];
  return rows.map(r => ({
    id: Number(r.id),
    skuAntigo: String(r.sku_antigo ?? r.skuAntigo ?? ""),
    skuNovo: String(r.sku_novo ?? r.skuNovo ?? ""),
    descricaoAntigo: r.descricaoAntigo ? String(r.descricaoAntigo) : null,
    descricaoNovo: r.descricaoNovo ? String(r.descricaoNovo) : null,
  }));
}