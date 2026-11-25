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
      d.skuAntigo,
      d.skuNovo,
      COALESCE(pa.descricao, pa.nome, fa.descricaoItem) AS descricaoAntigo,
      COALESCE(pn.descricao, pn.nome, fn.descricaoItem) AS descricaoNovo
    FROM de_para_codigos d
    LEFT JOIN produtos pa ON UPPER(TRIM(pa.codItem)) = UPPER(TRIM(d.skuAntigo))
      OR UPPER(TRIM(pa.codigo)) = UPPER(TRIM(d.skuAntigo))
    LEFT JOIN produtos pn ON UPPER(TRIM(pn.codItem)) = UPPER(TRIM(d.skuNovo))
      OR UPPER(TRIM(pn.codigo)) = UPPER(TRIM(d.skuNovo))
  LEFT JOIN (
      SELECT TRIM(codMaterial) AS cod, MAX(descricaoItem) AS descricaoItem
      FROM faturamento
      WHERE codMaterial IS NOT NULL AND TRIM(codMaterial) <> ''
      GROUP BY TRIM(codMaterial)
    ) fa ON fa.cod = TRIM(d.skuAntigo)
    LEFT JOIN (
      SELECT TRIM(codMaterial) AS cod, MAX(descricaoItem) AS descricaoItem
      FROM faturamento
      WHERE codMaterial IS NOT NULL AND TRIM(codMaterial) <> ''
      GROUP BY TRIM(codMaterial)
    ) fn ON fn.cod = TRIM(d.skuNovo)
    ORDER BY d.skuAntigo
  `);

  const rows = (result[0] as unknown as Array<Record<string, unknown>>) ?? [];
  return rows.map(r => ({
    id: Number(r.id),
    skuAntigo: String(r.skuAntigo ?? ""),
    skuNovo: String(r.skuNovo ?? ""),
    descricaoAntigo: r.descricaoAntigo ? String(r.descricaoAntigo) : null,
    descricaoNovo: r.descricaoNovo ? String(r.descricaoNovo) : null,
  }));
}