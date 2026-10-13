/**
 * Popula produtos e clientes a partir do faturamento local (ERP).
 * Idempotente: só cria códigos/CNPJs ainda inexistentes.
 */
import { sql } from "drizzle-orm";
import * as db from "../db";
import type { InsertCliente, InsertProduto } from "../../drizzle/schema";
import { invalidateDeParaCache } from "./de-para-map";

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
      MAX(tipoEstoque) AS tipoEstoque
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

function buildProduto(
  row: FatProdutoRow,
  marcaIdByName: Map<string, number>,
): InsertProduto {
  const cod = clean(row.codMaterial)!;
  const desc = clean(row.descricaoItem) || cod;
  const marca = clean(row.marca);
  const linha = clean(row.linhaProduto);
  const tipoNegocio = clean(row.tipoNegocio);
  const tipoEstoque = normalizeTipoEstoque(clean(row.tipoEstoque));
  const marcaId = marca ? marcaIdByName.get(marca.toLowerCase()) : undefined;

  return {
    codItem: cod,
    codigo: cod,
    nome: desc.slice(0, 200),
    descricao: desc.slice(0, 300),
    marca: marca ?? undefined,
    marcaId: marcaId ?? undefined,
    linha: linha ?? undefined,
    tipoNegocio: tipoNegocio ?? undefined,
    tipoEstoque: tipoEstoque ?? "MTS",
    status: "ATIVO",
    projetarEstatistica: true,
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
}): Promise<SeedFromFaturamentoResult> {
  const dryRun = Boolean(options?.dryRun);
  const fatProdutos = await loadDistinctProdutos();
  const fatClientes = await loadDistinctClientes();

  const existingProdutos = await db.listProdutos();
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

  const produtosToCreate: InsertProduto[] = [];
  let produtosSkipped = 0;
  for (const row of fatProdutos) {
    const cod = clean(row.codMaterial);
    if (!cod) {
      produtosSkipped += 1;
      continue;
    }
    if (existingCodes.has(cod)) continue;
    produtosToCreate.push(buildProduto(row, marcaIdByName));
    existingCodes.add(cod);
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
    for (const batch of batchSlice(produtosToCreate, 500)) {
      await db.createProdutosBatch(batch);
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
      return Boolean(cod && !existingCodes.has(cod.toUpperCase()));
    })
    .map(r => ({
      ...r,
      alreadyInDePara: deParaCodes.has((clean(r.codMaterial) || "").toUpperCase()),
    }));
}

export async function acceptPendingSkuFromFaturamento(codMaterial: string) {
  const cod = clean(codMaterial);
  if (!cod) throw new Error("Código do SKU inválido");

  const fatProdutos = await loadDistinctProdutos();
  const row = fatProdutos.find(r => (clean(r.codMaterial) || "").toUpperCase() === cod.toUpperCase());
  if (!row) throw new Error(`SKU ${cod} não encontrado no faturamento`);

  const existing = await db.listProdutos();
  for (const p of existing) {
    if (
      (p.codItem || "").trim().toUpperCase() === cod.toUpperCase() ||
      (p.codigo || "").trim().toUpperCase() === cod.toUpperCase()
    ) {
      return { created: false, produtoId: p.id, deParaCriado: false };
    }
  }

  const marcas = await db.listMarcas();
  const marcaIdByName = new Map<string, number>();
  for (const m of marcas) {
    if (m.nome) marcaIdByName.set(m.nome.trim().toLowerCase(), m.id);
  }

  const created = await db.createProduto(buildProduto(row, marcaIdByName));
  const produtoId = Number(created.id ?? 0);

  let deParaCriado = false;
  const dePara = await db.listDeParaCodigos();
  const hasDePara = dePara.some(
    d => (d.skuAntigo || "").trim().toUpperCase() === cod.toUpperCase()
  );
  if (!hasDePara) {
    await db.createDeParaCodigo({
      skuAntigo: cod.toUpperCase(),
      skuNovo: cod,
    });
    invalidateDeParaCache();
    deParaCriado = true;
  }

  return { created: true, produtoId, deParaCriado };
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
