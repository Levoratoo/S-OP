import { sql } from "drizzle-orm";
import { getDb } from "../db";

/** Após sync do ERP: preenche `grupo` (usr_grupo) e corrige `tipoNegocio` inválido no cadastro. */
export async function enrichProdutoMetadataFromFaturamento() {
  const db = await getDb();
  if (!db) return { grupoAtualizados: 0, tipoNegocioAtualizados: 0 };

  const grupo = await db.execute(sql`
    UPDATE produtos p
    INNER JOIN (
      SELECT TRIM(codMaterial) AS cod, MAX(grupoProduto) AS gp
      FROM faturamento
      WHERE grupoProduto IS NOT NULL AND TRIM(grupoProduto) <> ''
      GROUP BY TRIM(codMaterial)
    ) f ON TRIM(p.codItem) = f.cod OR TRIM(p.codigo) = f.cod
    SET p.grupo = f.gp
    WHERE p.grupo IS NULL OR TRIM(p.grupo) = ''
  `);

  const tipo = await db.execute(sql`
    UPDATE produtos p
    INNER JOIN (
      SELECT TRIM(codMaterial) AS cod, MAX(tipoNegocio) AS tn
      FROM faturamento
      WHERE tipoNegocio IN ('JIT', 'ATD', 'PRG', 'VAR')
      GROUP BY TRIM(codMaterial)
    ) f ON TRIM(p.codItem) = f.cod OR TRIM(p.codigo) = f.cod
    SET p.tipoNegocio = f.tn
    WHERE p.tipoNegocio IS NULL
       OR TRIM(p.tipoNegocio) NOT IN ('JIT', 'ATD', 'PRG', 'VAR')
  `);

  return {
    grupoAtualizados: Number((grupo as { affectedRows?: number }).affectedRows ?? 0),
    tipoNegocioAtualizados: Number((tipo as { affectedRows?: number }).affectedRows ?? 0),
  };
}
