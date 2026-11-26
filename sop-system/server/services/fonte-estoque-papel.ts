import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { papeis, papelEstoque } from "../../drizzle/schema";

/**
 * Estoque de papel.
 * Hoje a fonte é o cadastro manual (`papel_estoque`).
 * TODO: quando o Pedro indicar a view do ERP Metrics, implementar outra FonteEstoquePapel
 * e devolvê-la em `fonteEstoquePapel`. Não consultar o Metrics antes disso.
 */
export type EstoquePapelFonte = {
  papelId: number;
  codigo: string;
  quantidade: number;
  unidade: string;
  dataBase: string;
  origem: "MANUAL" | "ERP";
};

export interface FonteEstoquePapel {
  listar(): Promise<EstoquePapelFonte[]>;
}

function dataIso(valor: Date | string): string {
  if (valor instanceof Date) {
    const ano = valor.getUTCFullYear();
    const mes = String(valor.getUTCMonth() + 1).padStart(2, "0");
    const dia = String(valor.getUTCDate()).padStart(2, "0");
    return `${ano}-${mes}-${dia}`;
  }
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(String(valor));
  return iso?.[1] ?? String(valor).slice(0, 10);
}

export async function listarEstoqueManual(): Promise<EstoquePapelFonte[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      papelId: papelEstoque.papelId,
      codigo: papeis.codigo,
      quantidade: papelEstoque.quantidade,
      unidade: papelEstoque.unidade,
      dataBase: papelEstoque.dataBase,
      origem: papelEstoque.origem,
    })
    .from(papelEstoque)
    .innerJoin(papeis, eq(papeis.id, papelEstoque.papelId));
  return rows.map(row => ({
    papelId: row.papelId,
    codigo: row.codigo,
    quantidade: Number(row.quantidade || 0),
    unidade: row.unidade,
    dataBase: dataIso(row.dataBase),
    origem: row.origem === "ERP" ? "ERP" : "MANUAL",
  }));
}

export function fonteEstoquePapel(): FonteEstoquePapel {
  return { listar: listarEstoqueManual };
}
