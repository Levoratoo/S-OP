/**
 * Passo 1 — gera as 3 bases de entrada do script Python a partir do faturamento/cadastros.
 * Codificação estatística = TipoEstoque-Marca-Linha (ex.: MTS-Adidas-Automática).
 */
import XLSX from "xlsx";
import { and, eq, gte, lte } from "drizzle-orm";
import { getDb } from "../db";
import { faturamento, produtos, previsoes } from "../../drizzle/schema";

/** Erro de pré-condição do ETL (cliente deve corrigir dados — mapear para 4xx no tRPC). */
export class PrevisaoEtlUserError extends Error {
  readonly code = "PRECONDITION_FAILED" as const;
  constructor(message: string) {
    super(message);
    this.name = "PrevisaoEtlUserError";
  }
}

const MES_LABELS = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
] as const;

function mesCol(ano: number, mes: number) {
  return `${MES_LABELS[mes - 1]}-${String(ano).slice(-2)}`;
}

function buildCodificacao(tipoEstoque: string | null | undefined, marca: string | null | undefined, linha: string | null | undefined) {
  const tp = (tipoEstoque || "MTS").trim().toUpperCase() || "MTS";
  const m = (marca || "SEM-MARCA").trim() || "SEM-MARCA";
  const l = (linha || "SEM-LINHA").trim() || "SEM-LINHA";
  return `${tp}-${m}-${l}`;
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const n = Number(String(value ?? "0").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function workbookToBase64(wb: XLSX.WorkBook) {
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return buf.toString("base64");
}

export type PrevisaoEtlResult = {
  vendasBase64: string;
  previstoBase64: string | null;
  clientesBase64: string | null;
  stats: {
    gruposVendas: number;
    mesesHistorico: number;
    gruposPrevisto: number;
    linhasClientes: number;
  };
};

/**
 * Gera bases no layout esperado pelo script:
 * - Vendas: Planilha1 / Codificação + colunas mensais
 * - Previsto: Previsto / Codificação + colunas mensais (se houver dados)
 * - Clientes: Base de Dados / Código + Cod. Cliente + mensais
 */
export async function gerarBasesPrevisaoPython(options?: {
  dataInicio?: string;
  dataFim?: string;
}): Promise<PrevisaoEtlResult> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const conditions = [eq(faturamento.tipoFaturamento, "SAIDA")];
  if (options?.dataInicio) {
    conditions.push(gte(faturamento.dataEmissao, new Date(options.dataInicio)));
  }
  if (options?.dataFim) {
    conditions.push(lte(faturamento.dataEmissao, new Date(options.dataFim)));
  }

  const rows = await db
    .select({
      dataEmissao: faturamento.dataEmissao,
      codMaterial: faturamento.codMaterial,
      codCliente: faturamento.codCliente,
      marca: faturamento.marca,
      linhaProduto: faturamento.linhaProduto,
      tipoEstoque: faturamento.tipoEstoque,
      qtd: faturamento.qtd,
    })
    .from(faturamento)
    .where(and(...conditions));

  if (rows.length === 0) {
    throw new PrevisaoEtlUserError(
      "Nenhum faturamento SAIDA encontrado. Importe faturamento em /vendas/importar antes de gerar as bases."
    );
  }

  const produtosRows = await db
    .select({
      codItem: produtos.codItem,
      codigo: produtos.codigo,
      marca: produtos.marca,
      linha: produtos.linha,
      tipoEstoque: produtos.tipoEstoque,
      projetarEstatistica: produtos.projetarEstatistica,
    })
    .from(produtos);

  const produtoByCodigo = new Map<string, (typeof produtosRows)[number]>();
  for (const p of produtosRows) {
    if (p.codItem) produtoByCodigo.set(p.codItem, p);
    if (p.codigo) produtoByCodigo.set(p.codigo, p);
  }

  type MonthKey = string;
  const monthSet = new Set<MonthKey>();
  const vendasAgg = new Map<string, Map<MonthKey, number>>();
  const clientesAgg = new Map<string, Map<MonthKey, number>>();

  for (const row of rows) {
    const prod = row.codMaterial ? produtoByCodigo.get(row.codMaterial) : undefined;
    if (prod && prod.projetarEstatistica === false) continue;

    const tipo = row.tipoEstoque || prod?.tipoEstoque || "MTS";
    const marca = row.marca || prod?.marca || "SEM-MARCA";
    const linha = row.linhaProduto || prod?.linha || "SEM-LINHA";
    const codificacao = buildCodificacao(tipo, marca, linha);

    const d = new Date(String(row.dataEmissao));
    if (Number.isNaN(d.getTime())) continue;
    const col = mesCol(d.getFullYear(), d.getMonth() + 1);
    monthSet.add(col);

    const qtd = toNumber(row.qtd);
    if (!vendasAgg.has(codificacao)) vendasAgg.set(codificacao, new Map());
    const vMap = vendasAgg.get(codificacao)!;
    vMap.set(col, (vMap.get(col) || 0) + qtd);

    const cliente = (row.codCliente || "SEM-CLIENTE").trim();
    const clienteKey = `${codificacao}||${cliente}`;
    if (!clientesAgg.has(clienteKey)) clientesAgg.set(clienteKey, new Map());
    const cMap = clientesAgg.get(clienteKey)!;
    cMap.set(col, (cMap.get(col) || 0) + qtd);
  }

  const months = Array.from(monthSet).sort((a, b) => {
    const parse = (s: string) => {
      const [m, y] = s.split("-");
      const mi = MES_LABELS.indexOf(m as (typeof MES_LABELS)[number]);
      return (2000 + Number(y)) * 12 + mi;
    };
    return parse(a) - parse(b);
  });

  if (months.length === 0) {
    throw new Error("Não foi possível derivar colunas mensais do faturamento.");
  }

  const vendasRows = Array.from(vendasAgg.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([codificacao, mapa]) => {
      const out: Record<string, string | number> = { Codificação: codificacao };
      for (const m of months) out[m] = Math.round((mapa.get(m) || 0) * 10000) / 10000;
      return out;
    });

  const wbVendas = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wbVendas, XLSX.utils.json_to_sheet(vendasRows), "Planilha1");

  const clientesRows = Array.from(clientesAgg.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, mapa]) => {
      const [codigo, cliente] = key.split("||");
      const out: Record<string, string | number> = {
        Código: codigo,
        "Cod. Cliente": cliente,
      };
      for (const m of months) out[m] = Math.round((mapa.get(m) || 0) * 10000) / 10000;
      return out;
    });

  const wbClientes = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wbClientes, XLSX.utils.json_to_sheet(clientesRows), "Base de Dados");

  // Previsto: agrega tabela previsoes (se preenchida) por produto → Tipo-Marca-Linha
  const prevRowsDb = await db.select().from(previsoes);
  let previstoBase64: string | null = null;
  let gruposPrevisto = 0;

  if (prevRowsDb.length > 0) {
    const prevAgg = new Map<string, Map<MonthKey, number>>();
    const produtosAll = await db.select().from(produtos);
    const byId = new Map(produtosAll.map((p) => [p.id, p]));

    for (const p of prevRowsDb) {
      const prod = p.produtoId ? byId.get(p.produtoId) : undefined;
      if (prod && prod.projetarEstatistica === false) continue;
      const codificacao = buildCodificacao(prod?.tipoEstoque, prod?.marca, prod?.linha);
      const col = mesCol(p.ano, p.mes);
      if (!prevAgg.has(codificacao)) prevAgg.set(codificacao, new Map());
      const map = prevAgg.get(codificacao)!;
      map.set(col, (map.get(col) || 0) + toNumber(p.valorPrevisto));
    }

    const prevMonths = Array.from(
      new Set(Array.from(prevAgg.values()).flatMap(m => Array.from(m.keys())))
    ).sort();
    if (prevMonths.length > 0) {
      const sheetRows = Array.from(prevAgg.entries()).map(([codificacao, mapa]) => {
        const out: Record<string, string | number> = { Codificação: codificacao };
        for (const m of prevMonths) out[m] = Math.round((mapa.get(m) || 0) * 10000) / 10000;
        return out;
      });
      gruposPrevisto = sheetRows.length;
      const wbPrev = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wbPrev, XLSX.utils.json_to_sheet(sheetRows), "Previsto");
      previstoBase64 = workbookToBase64(wbPrev);
    }
  }

  return {
    vendasBase64: workbookToBase64(wbVendas),
    previstoBase64,
    clientesBase64: clientesRows.length > 0 ? workbookToBase64(wbClientes) : null,
    stats: {
      gruposVendas: vendasRows.length,
      mesesHistorico: months.length,
      gruposPrevisto,
      linhasClientes: clientesRows.length,
    },
  };
}
