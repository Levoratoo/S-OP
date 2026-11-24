import { eq, or, sql } from "drizzle-orm";
import { getDb } from "../db";
import { faturamento, marcas, produtos, type InsertProduto } from "../../drizzle/schema";
import { normalizeTipoNegocioComercial } from "@shared/tipo-negocio";
import {
  CADASTRO_ORIGEM_CRM_AUTO,
  crmTipoExcelParaEstoque,
  crmTipoExcelParaNegocio,
  isCrmSkuCodigoValido,
} from "@shared/crm-import-helpers";

export type CrmAutoProdutoInput = {
  sku: string;
  descricao?: string | null;
  marca?: string | null;
  gestor?: string | null;
  valorVenda?: number;
  tipoNegocioExcel?: string | null;
};

async function ensureMarcaId(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, nome: string | null | undefined) {
  const marca = (nome || "").trim();
  if (!marca) return undefined;
  const existing = await db
    .select({ id: marcas.id, nome: marcas.nome })
    .from(marcas)
    .where(sql`LOWER(TRIM(${marcas.nome})) = ${marca.toLowerCase()}`)
    .limit(1);
  if (existing[0]) return existing[0].id;
  const inserted = await db.insert(marcas).values({ nome: marca, ativo: true });
  return Number(inserted[0].insertId);
}

async function loadFatHints(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  sku: string
): Promise<Partial<InsertProduto>> {
  const result = await db.execute(sql`
    SELECT
      MAX(descricaoItem) AS descricaoItem,
      MAX(marca) AS marca,
      MAX(linhaProduto) AS linhaProduto,
      MAX(grupoProduto) AS grupoProduto,
      MAX(tipoNegocio) AS tipoNegocio,
      MAX(tipoEstoque) AS tipoEstoque,
      AVG(CASE WHEN qtd > 0 AND valorTotal > 0 THEN valorTotal / qtd END) AS precoMedio
    FROM faturamento
    WHERE TRIM(codMaterial) = ${sku}
    GROUP BY TRIM(codMaterial)
    LIMIT 1
  `);
  const rows = (result[0] as unknown) as Array<Record<string, unknown>>;
  const row = rows?.[0];
  if (!row) return {};
  const tipoNeg = normalizeTipoNegocioComercial(String(row.tipoNegocio ?? ""));
  return {
    descricao: row.descricaoItem ? String(row.descricaoItem).slice(0, 300) : undefined,
    marca: row.marca ? String(row.marca).slice(0, 100) : undefined,
    linha: row.linhaProduto ? String(row.linhaProduto).slice(0, 100) : undefined,
    grupo: row.grupoProduto ? String(row.grupoProduto).slice(0, 100) : undefined,
    tipoNegocio: tipoNeg ?? undefined,
    tipoEstoque: row.tipoEstoque === "MTO" ? "MTO" : row.tipoEstoque === "MTS" ? "MTS" : undefined,
    valorVenda:
      row.precoMedio != null && Number(row.precoMedio) > 0
        ? String(Math.round(Number(row.precoMedio) * 100) / 100)
        : undefined,
  };
}

/**
 * Cria produto mínimo para linha CRM quando o SKU é válido e não existe no cadastro.
 * Enriquece com faturamento ERP antes de cair no fallback do Excel.
 */
export async function ensureProdutoFromCrmImport(input: CrmAutoProdutoInput) {
  const sku = input.sku.trim();
  if (!isCrmSkuCodigoValido(sku)) {
    return { created: false as const, reason: "invalid_sku_format" as const };
  }

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [existing] = await db
    .select()
    .from(produtos)
    .where(or(eq(produtos.codItem, sku), eq(produtos.codigo, sku)))
    .limit(1);
  if (existing) return { created: false as const, produto: existing, reason: "exists" as const };

  const fat = await loadFatHints(db, sku);
  const marcaNome = (input.marca || fat.marca || "").trim() || null;
  const marcaId = await ensureMarcaId(db, marcaNome);
  const descricao =
    (input.descricao || fat.descricao || sku).trim().slice(0, 300) || sku;
  const tipoEstoque =
    fat.tipoEstoque ?? crmTipoExcelParaEstoque(input.tipoNegocioExcel);
  const tipoNegocio =
    fat.tipoNegocio ?? crmTipoExcelParaNegocio(input.tipoNegocioExcel) ?? undefined;
  const valorVenda =
    input.valorVenda != null && input.valorVenda > 0
      ? String(input.valorVenda)
      : fat.valorVenda;

  const payload: InsertProduto = {
    codItem: sku,
    codigo: sku,
    nome: descricao.slice(0, 200),
    descricao,
    marca: marcaNome ?? undefined,
    marcaId,
    linha: fat.linha,
    grupo: fat.grupo,
    tipoEstoque,
    tipoNegocio,
    valorVenda,
    status: "ATIVO",
    projetarEstatistica: false,
    cadastroOrigem: CADASTRO_ORIGEM_CRM_AUTO,
    unidade: "UN",
  };

  const result = await db.insert(produtos).values(payload);
  const id = Number(result[0].insertId);
  const [produto] = await db.select().from(produtos).where(eq(produtos.id, id)).limit(1);
  return { created: true as const, produto: produto!, reason: "created" as const };
}