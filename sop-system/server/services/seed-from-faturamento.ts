/**
 * Popula produtos e clientes a partir do faturamento local (ERP).
 * Idempotente: só cria códigos/CNPJs ainda inexistentes.
 */
import { sql } from "drizzle-orm";
import * as db from "../db";
import { getDb } from "../db";
import { deParaCodigos, produtos } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import type { InsertCliente, InsertProduto } from "../../drizzle/schema";
import { isSkuAcabado } from "@shared/sku-acabado";
import { invalidateDeParaCache } from "./de-para-map";
import { normalizeTipoNegocioComercial } from "@shared/tipo-negocio";

export type SeedFromFaturamentoResult = {
  dryRun: boolean;
  produtos: {
    distinctInFaturamento: number;
    alreadyExist: number;
    created: number;
    skipped: number;
  };
  clientes: {
    distinctInFaturamento: number;
    alreadyExist: number;
    created: number;
    skipped: number;
  };
  coverage: {
    faturamentoSkus: number;
    produtosMatched: number;
    matchPct: number;
  };
};

type FatProdutoRow = {
  codMaterial: string;
  descricaoItem: string | null;
  marca: string | null;
  linhaProduto: string | null;
  tipoNegocio: string | null;
  tipoEstoque: string | null;
  grupoProduto: string | null;
};

type FatClienteRow = {
  chave: string;
  codCliente: string | null;
  cnpj: string | null;
  cidade: string | null;
  uf: string | null;
  unidade: string | null;
};

function clean(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

function normalizeTipoEstoque(value: string | null): "MTS" | "MTO" | null {
  if (!value) return null;
  const u = value.toUpperCase();
  if (u === "MTS" || u === "MTO") return u;
  return null;
}

function batchSlice<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function loadDistinctProdutos(): Promise<FatProdutoRow[]> {
  const conn = await db.getDb();
  if (!conn) return [];
  const result = await conn.execute(sql`
    SELECT
      TRIM(codMaterial) AS codMaterial,
      MAX(descricaoItem) AS descricaoItem,
      MAX(marca) AS marca,
      MAX(linhaProduto) AS linhaProduto,
      MAX(tipoNegocio) AS tipoNegocio,
      MAX(tipoEstoque) AS tipoEstoque,
      MAX(grupoProduto) AS grupoProduto
    FROM faturamento
    WHERE codMaterial IS NOT NULL AND TRIM(codMaterial) <> ''
    GROUP BY TRIM(codMaterial)
    ORDER BY codMaterial
  `);
  return ((result[0] as unknown) as FatProdutoRow[]) ?? [];
}

async function loadDistinctClientes(): Promise<FatClienteRow[]> {
  const conn = await db.getDb();
  if (!conn) return [];
  // Chave preferencial: código; se vazio, CNPJ
  const result = await conn.execute(sql`
    SELECT
      COALESCE(NULLIF(TRIM(codCliente), ''), NULLIF(TRIM(cnpj), '')) AS chave,
      MAX(NULLIF(TRIM(codCliente), '')) AS codCliente,
      MAX(NULLIF(TRIM(cnpj), '')) AS cnpj,
      MAX(NULLIF(TRIM(cidade), '')) AS cidade,
      MAX(NULLIF(TRIM(uf), '')) AS uf,
      MAX(NULLIF(TRIM(unidade), '')) AS unidade
    FROM faturamento
    WHERE
      (codCliente IS NOT NULL AND TRIM(codCliente) <> '')
      OR (cnpj IS NOT NULL AND TRIM(cnpj) <> '')
    GROUP BY COALESCE(NULLIF(TRIM(codCliente), ''), NULLIF(TRIM(cnpj), ''))
    ORDER BY chave
  `);
  return ((result[0] as unknown) as FatClienteRow[]) ?? [];
}

type AntigoProdutoRef = Pick<
  InsertProduto,
  "projetarEstatistica" | "tipoNegocio" | "grupo" | "linha" | "modelo" | "tipoEstoque"
>;

function buildProduto(
  row: FatProdutoRow,
  marcaIdByName: Map<string, number>,
  herdar?: AntigoProdutoRef | null
): InsertProduto {
  const cod = clean(row.codMaterial)!;
  const desc = clean(row.descricaoItem) || cod;
  const marca = clean(row.marca);
  const linha = clean(row.linhaProduto);
  const tipoNegocio = normalizeTipoNegocioComercial(clean(row.tipoNegocio)) ?? undefined;
  const tipoEstoque = normalizeTipoEstoque(clean(row.tipoEstoque));
  const grupo = clean(row.grupoProduto);
  const marcaId = marca ? marcaIdByName.get(marca.toLowerCase()) : undefined;

  return {
    codItem: cod,
    codigo: cod,
    nome: desc.slice(0, 200),
    descricao: desc.slice(0, 300),
    marca: marca ?? undefined,
    marcaId: marcaId ?? undefined,
    linha: herdar?.linha ?? linha ?? undefined,
    grupo: herdar?.grupo ?? grupo ?? undefined,
    modelo: herdar?.modelo ?? undefined,
    tipoNegocio: herdar?.tipoNegocio ?? tipoNegocio,
    tipoEstoque: herdar?.tipoEstoque ?? tipoEstoque ?? "MTS",
    status: "ATIVO",
    projetarEstatistica: herdar?.projetarEstatistica ?? true,
    unidade: "UN",
  };
}

function buildCliente(row: FatClienteRow): InsertCliente | null {
  const codigo = clean(row.codCliente);
  const cnpj = clean(row.cnpj);
  if (!codigo && !cnpj) return null;

  const unidade = clean(row.unidade);
  const razao =
    unidade ||
    (codigo ? `Cliente ${codigo}` : null) ||
    (cnpj ? `Cliente ${cnpj}` : "Cliente");

  return {
    codigo: codigo ?? undefined,
    razaoSocial: razao.slice(0, 200),
    nomeFantasia: unidade?.slice(0, 200) ?? undefined,
    cnpjCpf: cnpj ?? undefined,
    cidade: clean(row.cidade) ?? undefined,
    estado: clean(row.uf)?.slice(0, 2) ?? undefined,
    status: "ATIVO",
  };
}

export async function seedProdutosClientesFromFaturamento(options?: {
  dryRun?: boolean;
  /** Só clientes (sync automático pós-faturamento). */
  clientesOnly?: boolean;
}): Promise<SeedFromFaturamentoResult> {
  const dryRun = Boolean(options?.dryRun);
  const clientesOnly = Boolean(options?.clientesOnly);
  const fatProdutos = clientesOnly ? [] : await loadDistinctProdutos();
  const fatClientes = await loadDistinctClientes();

  const existingProdutos = clientesOnly ? [] : await db.listProdutos();
  const existingCodes = new Set<string>();
  for (const p of existingProdutos) {
    if (p.codItem) existingCodes.add(p.codItem.trim());
    if (p.codigo) existingCodes.add(p.codigo.trim());
  }

  const marcas = await db.listMarcas();
  const marcaIdByName = new Map<string, number>();
  for (const m of marcas) {
    if (m.nome) marcaIdByName.set(m.nome.trim().toLowerCase(), m.id);
  }

  const conn = await getDb();
  const antigoPorNovo = new Map<string, (typeof existingProdutos)[number]>();
  if (conn && !clientesOnly) {
    const deParas = await conn.select().from(deParaCodigos);
    const prodByKey = new Map<string, (typeof existingProdutos)[number]>();
    for (const p of existingProdutos) {
      if (p.codItem) prodByKey.set(p.codItem.trim().toUpperCase(), p);
      if (p.codigo) prodByKey.set(p.codigo.trim().toUpperCase(), p);
    }
    for (const dp of deParas) {
      const novo = dp.skuNovo.trim().toUpperCase();
      const antigo = dp.skuAntigo.trim().toUpperCase();
      const prodAntigo = prodByKey.get(antigo);
      if (prodAntigo && !antigoPorNovo.has(novo)) antigoPorNovo.set(novo, prodAntigo);
    }
  }

  const produtosToCreate: InsertProduto[] = [];
  let produtosSkipped = 0;
  if (!clientesOnly) {
    for (const row of fatProdutos) {
      const cod = clean(row.codMaterial);
      if (!cod) {
        produtosSkipped += 1;
        continue;
      }
      if (existingCodes.has(cod)) continue;
      const antigo = antigoPorNovo.get(cod.toUpperCase());
      const herdar = antigo
        ? ({
            projetarEstatistica: antigo.projetarEstatistica ?? undefined,
            tipoNegocio: antigo.tipoNegocio ?? undefined,
            grupo: antigo.grupo ?? undefined,
            linha: antigo.linha ?? undefined,
            modelo: antigo.modelo ?? undefined,
            tipoEstoque: antigo.tipoEstoque ?? undefined,
          } satisfies AntigoProdutoRef)
        : null;
      produtosToCreate.push(buildProduto(row, marcaIdByName, herdar));
      existingCodes.add(cod);
    }
  }

  const existingClientes = await db.listClientes();
  const existingClienteCodes = new Set(
    existingClientes.map((c) => (c.codigo || "").trim()).filter(Boolean),
  );
  const existingCnpjs = new Set(
    existingClientes.map((c) => (c.cnpjCpf || "").trim()).filter(Boolean),
  );

  const clientesToCreate: InsertCliente[] = [];
  let clientesSkipped = 0;
  for (const row of fatClientes) {
    const built = buildCliente(row);
    if (!built) {
      clientesSkipped += 1;
      continue;
    }
    const code = (built.codigo || "").trim();
    const cnpj = (built.cnpjCpf || "").trim();
    if (code && existingClienteCodes.has(code)) continue;
    if (cnpj && existingCnpjs.has(cnpj)) {
      // Já existe cliente com este CNPJ — evita violação de unique
      if (!code) continue;
      // Código novo mas CNPJ duplicado: grava sem CNPJ
      built.cnpjCpf = undefined;
    }
    clientesToCreate.push(built);
    if (code) existingClienteCodes.add(code);
    if (built.cnpjCpf) existingCnpjs.add(built.cnpjCpf);
  }

  if (!dryRun) {
    if (!clientesOnly) {
      for (const batch of batchSlice(produtosToCreate, 500)) {
        await db.createProdutosBatch(batch);
      }
    }
    for (const batch of batchSlice(clientesToCreate, 500)) {
      await db.createClientesBatch(batch);
    }
  }

  // existingCodes já inclui os que seriam/foram criados neste run
  const matchCount = fatProdutos.filter((r) => {
    const cod = clean(r.codMaterial);
    return Boolean(cod && existingCodes.has(cod));
  }).length;

  return {
    dryRun,
    produtos: {
      distinctInFaturamento: fatProdutos.length,
      alreadyExist: fatProdutos.length - produtosToCreate.length - produtosSkipped,
      created: produtosToCreate.length,
      skipped: produtosSkipped,
    },
    clientes: {
      distinctInFaturamento: fatClientes.length,
      alreadyExist: fatClientes.length - clientesToCreate.length - clientesSkipped,
      created: clientesToCreate.length,
      skipped: clientesSkipped,
    },
    coverage: {
      faturamentoSkus: fatProdutos.length,
      produtosMatched: matchCount,
      matchPct: fatProdutos.length
        ? Math.round((matchCount / fatProdutos.length) * 10000) / 100
        : 0,
    },
  };
}

export type PendingSkuFromFaturamento = FatProdutoRow & { alreadyInDePara: boolean };
export type PendingClienteFromFaturamento = FatClienteRow;

export async function listPendingSkusFromFaturamento(): Promise<PendingSkuFromFaturamento[]> {
  const fatProdutos = await loadDistinctProdutos();
  const existingProdutos = await db.listProdutos();
  const existingCodes = new Set<string>();
  for (const p of existingProdutos) {
    if (p.codItem) existingCodes.add(p.codItem.trim().toUpperCase());
    if (p.codigo) existingCodes.add(p.codigo.trim().toUpperCase());
  }
  const dePara = await db.listDeParaCodigos();
  const deParaCodes = new Set(
    dePara.flatMap(d => [d.skuAntigo, d.skuNovo].map(s => String(s || "").trim().toUpperCase()).filter(Boolean))
  );

  return fatProdutos
    .filter(r => {
      const cod = clean(r.codMaterial);
      return Boolean(cod && isSkuAcabado(cod) && !existingCodes.has(cod.toUpperCase()));
    })
    .map(r => ({
      ...r,
      alreadyInDePara: deParaCodes.has((clean(r.codMaterial) || "").toUpperCase()),
    }));
}

export async function acceptPendingSkuFromFaturamento(codMaterial: string) {
  const result = await acceptPendingSkusFromFaturamentoBatch([codMaterial]);
  if (result.erros.length > 0) {
    throw new Error(result.erros[0]!.message);
  }
  const detail = result.detalhes.find(d => d.codMaterial.toUpperCase() === clean(codMaterial)!.toUpperCase());
  return {
    created: detail?.created ?? false,
    produtoId: detail?.produtoId ?? 0,
    deParaCriado: detail?.deParaCriado ?? false,
  };
}

export type AcceptPendingSkusBatchResult = {
  criados: number;
  jaExistiam: number;
  erros: Array<{ codMaterial: string; message: string }>;
  detalhes: Array<{
    codMaterial: string;
    created: boolean;
    produtoId: number;
    deParaCriado: boolean;
  }>;
};

export async function acceptPendingSkusFromFaturamentoBatch(
  codMaterials: string[]
): Promise<AcceptPendingSkusBatchResult> {
  const codes = Array.from(
    new Set(codMaterials.map(c => clean(c)).filter((c): c is string => Boolean(c)))
  );
  if (codes.length === 0) {
    return { criados: 0, jaExistiam: 0, erros: [], detalhes: [] };
  }

  const database = await getDb();
  if (!database) throw new Error("Database not available");

  const fatProdutos = await loadDistinctProdutos();
  const fatByCode = new Map<string, FatProdutoRow>();
  for (const row of fatProdutos) {
    const c = clean(row.codMaterial);
    if (c) fatByCode.set(c.toUpperCase(), row);
  }

  const marcas = await db.listMarcas();
  const marcaIdByName = new Map<string, number>();
  for (const m of marcas) {
    if (m.nome) marcaIdByName.set(m.nome.trim().toLowerCase(), m.id);
  }

  const erros: AcceptPendingSkusBatchResult["erros"] = [];
  const detalhes: AcceptPendingSkusBatchResult["detalhes"] = [];
  let criados = 0;
  let jaExistiam = 0;

  await database.transaction(async tx => {
    const existingRows = await tx
      .select({ id: produtos.id, codItem: produtos.codItem, codigo: produtos.codigo })
      .from(produtos);
    const existingByCode = new Map<string, number>();
    for (const p of existingRows) {
      if (p.codItem) existingByCode.set(p.codItem.trim().toUpperCase(), p.id);
      if (p.codigo) existingByCode.set(p.codigo.trim().toUpperCase(), p.id);
    }

    const deParaRows = await tx
      .select({ skuAntigo: deParaCodigos.skuAntigo })
      .from(deParaCodigos);
    const deParaCodes = new Set(
      deParaRows.map(d => (d.skuAntigo || "").trim().toUpperCase()).filter(Boolean)
    );

    for (const raw of codes) {
      const cod = raw.toUpperCase();
      const row = fatByCode.get(cod);
      if (!row) {
        erros.push({ codMaterial: raw, message: `SKU ${raw} não encontrado no faturamento` });
        continue;
      }

      const existingId = existingByCode.get(cod);
      if (existingId != null) {
        jaExistiam += 1;
        detalhes.push({
          codMaterial: raw,
          created: false,
          produtoId: existingId,
          deParaCriado: false,
        });
        continue;
      }

      const insertProduto = buildProduto(row, marcaIdByName);
      const insertResult = await tx.insert(produtos).values(insertProduto);
      const produtoId = Number(insertResult[0].insertId ?? 0);
      existingByCode.set(cod, produtoId);

      let deParaCriado = false;
      if (!deParaCodes.has(cod)) {
        await tx.insert(deParaCodigos).values({
          skuAntigo: cod,
          skuNovo: clean(row.codMaterial)!,
        });
        deParaCodes.add(cod);
        deParaCriado = true;
      }

      criados += 1;
      detalhes.push({
        codMaterial: raw,
        created: true,
        produtoId,
        deParaCriado,
      });
    }
  });

  if (criados > 0) {
    invalidateDeParaCache();
  }

  return { criados, jaExistiam, erros, detalhes };
}

export async function listPendingClientesFromFaturamento(): Promise<PendingClienteFromFaturamento[]> {
  const fatClientes = await loadDistinctClientes();
  const existingClientes = await db.listClientes();
  const existingCodes = new Set(
    existingClientes.map(c => (c.codigo || "").trim()).filter(Boolean)
  );
  const existingCnpjs = new Set(
    existingClientes.map(c => (c.cnpjCpf || "").trim()).filter(Boolean)
  );

  return fatClientes.filter(row => {
    const code = clean(row.codCliente);
    const cnpj = clean(row.cnpj);
    if (code && existingCodes.has(code)) return false;
    if (cnpj && existingCnpjs.has(cnpj)) return false;
    return Boolean(code || cnpj);
  });
}

export async function acceptPendingClienteFromFaturamento(chave: string) {
  const key = clean(chave);
  if (!key) throw new Error("Chave do cliente inválida");

  const fatClientes = await loadDistinctClientes();
  const row = fatClientes.find(r => (clean(r.chave) || "") === key);
  if (!row) throw new Error(`Cliente ${key} não encontrado no faturamento`);

  const built = buildCliente(row);
  if (!built) throw new Error("Não foi possível montar o cliente");

  const existing = await db.listClientes();
  const code = (built.codigo || "").trim();
  const cnpj = (built.cnpjCpf || "").trim();
  for (const c of existing) {
    if (code && (c.codigo || "").trim() === code) {
      return { created: false, clienteId: c.id };
    }
    if (cnpj && (c.cnpjCpf || "").trim() === cnpj) {
      return { created: false, clienteId: c.id };
    }
  }

  const created = await db.createCliente(built);
  return { created: true, clienteId: Number(created.id ?? 0) };
}

export type PendingMarcaFromFaturamento = { nome: string; notas: number; gestorSugerido?: string | null };

/** Marcas que aparecem no faturamento e ainda não estão no cadastro de Marcas. */
export async function listPendingMarcasFromFaturamento(): Promise<PendingMarcaFromFaturamento[]> {
  const conn = await db.getDb();
  if (!conn) return [];
  const result = await conn.execute(sql`
    SELECT TRIM(f.marca) AS nome, COUNT(*) AS notas
    FROM faturamento f
    WHERE f.marca IS NOT NULL AND TRIM(f.marca) <> ''
      AND NOT EXISTS (
        SELECT 1 FROM marcas m
        WHERE LOWER(TRIM(m.nome)) = LOWER(TRIM(f.marca))
      )
    GROUP BY TRIM(f.marca)
    ORDER BY notas DESC
  `);
  const rows = (result[0] as unknown as PendingMarcaFromFaturamento[]) ?? [];
  const pending = rows
    .map(row => ({ nome: String(row.nome || "").trim(), notas: Number(row.notas) || 0 }))
    .filter(row => row.nome.length > 0);

  const { getGestorNomeFromImportMap } = await import("./gestor-marca-import-apply");
  const enriched: PendingMarcaFromFaturamento[] = [];
  for (const row of pending) {
    const gestorSugerido = await getGestorNomeFromImportMap(row.nome);
    enriched.push({ ...row, gestorSugerido });
  }
  return enriched;
}

export async function acceptPendingMarcasFromFaturamento(nomes?: string[]) {
  const pending = await listPendingMarcasFromFaturamento();
  const wanted = nomes?.length
    ? new Set(nomes.map(nome => nome.trim().toLowerCase()).filter(Boolean))
    : null;
  const toCreate = pending.filter(row => !wanted || wanted.has(row.nome.toLowerCase()));
  if (toCreate.length === 0) return { created: 0 };
  await db.createMarcasBatch(toCreate.map(row => ({ nome: row.nome, ativo: true })));
  const { applyImportMapLinksForMarcaNomes } = await import("./gestor-marca-import-apply");
  await applyImportMapLinksForMarcaNomes(toCreate.map(row => row.nome));
  return { created: toCreate.length };
}
