/**
 * Sincroniza Cadastros + Skus Projetar + Desconsiderar do “1 - Estatística IA”
 * para a base local (produtos / marcas), para o ETL gerar as 3 bases iguais ao Excel.
 */
import fs from "node:fs";
import path from "node:path";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { deParaCodigos, marcas, produtos } from "../../drizzle/schema";
import { invalidateDeParaCache } from "./de-para-map";

function resolveDadosDir(explicit?: string): string {
  if (explicit?.trim()) return path.resolve(explicit.trim());
  const candidates = [
    process.env.SEED_CADASTROS_DIR,
    path.resolve(process.cwd(), "dados-sistema"),
    path.resolve(process.cwd(), "..", "dados sistema"),
  ].filter(Boolean) as string[];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return candidates[0] ?? path.resolve(process.cwd(), "dados-sistema");
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (cols[idx] ?? "").trim();
    });
    rows.push(row);
  }
  return rows;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function normalizeTipoEstoque(value: string): "MTS" | "MTO" | null {
  const u = value.trim().toUpperCase();
  if (u === "MTS" || u === "MTO") return u;
  return null;
}

function normalizeStatus(value: string): "ATIVO" | "INATIVO" {
  const u = value.trim().toLowerCase();
  if (u.startsWith("inat") || u === "inativo") return "INATIVO";
  return "ATIVO";
}

function normalizeTipoNegocio(value: string): string | null {
  const u = value.trim().toUpperCase();
  if (u === "JIT" || u === "PRG" || u === "VAR") return u;
  return value.trim() || null;
}

function pickSkuCode(row: Record<string, string>): string {
  const novo = (row["SKU NOVO"] || row.sku_novo || "").trim();
  const cod = (row["Cod Item"] || row.cod_item || "").trim();
  const ajustado = (row.sku_ajustado || "").trim();
  if (novo && /^[\d.]/.test(novo)) return novo;
  if (ajustado && /^[\d.]/.test(ajustado)) return ajustado;
  return cod || novo || ajustado;
}

export type SyncEstatisticaIaResult = {
  dir: string;
  marcasUpserted: number;
  produtosAtualizados: number;
  produtosCriados: number;
  projetarTrue: number;
  desconsiderar: number;
  deParaUpserted: number;
  avisos: string[];
  fontes: Array<{
    arquivo: string;
    atualizadoEm: string;
    tamanhoBytes: number;
  }>;
};

export async function syncEstatisticaIaCadastros(options?: {
  dir?: string;
}): Promise<SyncEstatisticaIaResult> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const dir = resolveDadosDir(options?.dir);
  const avisos: string[] = [];
  const cadPath = path.join(dir, "estatistica_cadastros.csv");
  const projPath = path.join(dir, "estatistica_skus_projetar.csv");
  const descPath = path.join(dir, "estatistica_desconsiderar.csv");

  const requiredPaths = [cadPath, projPath, descPath];
  const missingPaths = requiredPaths.filter(filePath => !fs.existsSync(filePath));
  if (missingPaths.length > 0) {
    throw new Error(`Fontes obrigatórias ausentes: ${missingPaths.join(", ")}`);
  }
  const maxAgeDays = Math.max(
    1,
    Number(process.env.ESTATISTICA_SOURCE_MAX_AGE_DAYS || "31")
  );
  const now = Date.now();
  const fontes = requiredPaths.map(filePath => {
    const stat = fs.statSync(filePath);
    return {
      arquivo: path.basename(filePath),
      atualizadoEm: stat.mtime.toISOString(),
      tamanhoBytes: stat.size,
      ageDays: (now - stat.mtime.getTime()) / 86_400_000,
    };
  });
  const staleSources = fontes.filter(source => source.ageDays > maxAgeDays);
  if (staleSources.length > 0) {
    throw new Error(
      `Fontes vencidas (limite ${maxAgeDays} dias): ` +
        staleSources
          .map(source => `${source.arquivo} (${Math.floor(source.ageDays)} dias)`)
          .join(", ")
    );
  }

  const cadRows = parseCsv(fs.readFileSync(cadPath, "utf8"));
  const projRows = parseCsv(fs.readFileSync(projPath, "utf8"));
  const descRows = parseCsv(fs.readFileSync(descPath, "utf8"));

  if (cadRows.length === 0) throw new Error("estatistica_cadastros.csv vazio");
  if (projRows.length === 0) throw new Error("estatistica_skus_projetar.csv vazio");

  // Marcas
  const marcaNomes = new Set<string>();
  for (const row of cadRows) {
    const m = (row.Marca || "").trim();
    if (m) marcaNomes.add(m);
  }
  const existingMarcas = await db.select().from(marcas);
  const marcaByName = new Map(existingMarcas.map(m => [m.nome.trim().toLowerCase(), m]));
  let marcasUpserted = 0;
  for (const nome of marcaNomes) {
    const key = nome.toLowerCase();
    if (!marcaByName.has(key)) {
      await db.insert(marcas).values({ nome, ativo: true });
      marcasUpserted += 1;
    }
  }
  const marcasFresh = await db.select().from(marcas);
  const marcaIdByName = new Map(marcasFresh.map(m => [m.nome.trim().toLowerCase(), m.id]));

  const existingProdutos = await db.select().from(produtos);
  const byCode = new Map<string, (typeof existingProdutos)[number]>();
  for (const p of existingProdutos) {
    if (p.codItem) byCode.set(p.codItem.trim().toUpperCase(), p);
    if (p.codigo) byCode.set(p.codigo.trim().toUpperCase(), p);
  }

  let produtosAtualizados = 0;
  let produtosCriados = 0;

  type CadPayload = {
    codItem: string;
    codigo: string;
    nome: string;
    descricao: string | null;
    marca: string | null;
    marcaId: number | null;
    linha: string | null;
    modelo: string | null;
    tipoEstoque: "MTS" | "MTO";
    tipoNegocio: string | null;
    status: "ATIVO" | "INATIVO";
  };

  const payloads: CadPayload[] = [];
  for (const row of cadRows) {
    // Sempre a chave do cadastro é Cod Item — SKU NOVO só alimenta De-Para.
    // Se usarmos pickSkuCode (preferindo SKU NOVO), linhas antigas sobrescrevem
    // o produto atual com Linha/Status errados (ex.: Capodarte Classic → Evolution).
    const sku = (row["Cod Item"] || row.cod_item || "").trim();
    if (!sku) continue;
    const tipoEstoque = normalizeTipoEstoque(row["Tipo Item"] || "");
    if (!tipoEstoque) continue;
    const marca = (row.Marca || "").trim() || null;
    const linha = (row.Linha || "").trim() || null;
    const tipoNegocio = normalizeTipoNegocio(row.Tipo || "");
    const status = normalizeStatus(row.Status || "Ativa");
    const descricao = (row["Descrição"] || row.Descrição || "").trim() || null;
    const modelo = (row.Modelo || "").trim() || null;
    const marcaId = marca ? marcaIdByName.get(marca.toLowerCase()) ?? null : null;
    payloads.push({
      codItem: sku,
      codigo: sku,
      nome: descricao || sku,
      descricao,
      marca,
      marcaId,
      linha,
      modelo,
      tipoEstoque,
      tipoNegocio,
      status,
    });
  }

  // Dedup by codItem (último ganha)
  const bySku = new Map<string, CadPayload>();
  for (const p of payloads) bySku.set(p.codItem.toUpperCase(), p);
  const uniquePayloads = Array.from(bySku.values());

  for (let i = 0; i < uniquePayloads.length; i += 100) {
    const chunk = uniquePayloads.slice(i, i + 100);
    for (const payload of chunk) {
      const key = payload.codItem.toUpperCase();
      const existing = byCode.get(key);
      if (existing) {
        await db.update(produtos).set(payload).where(eq(produtos.id, existing.id));
        byCode.set(key, { ...existing, ...payload } as (typeof existingProdutos)[number]);
        produtosAtualizados += 1;
      } else {
        const result = await db.insert(produtos).values({
          ...payload,
          projetarEstatistica: false,
        });
        const id = Number(result[0].insertId);
        byCode.set(key, { id, ...payload, projetarEstatistica: false } as (typeof existingProdutos)[number]);
        produtosCriados += 1;
      }
    }
  }

  // Reset projetar: só quem está em Skus Projetar (e não em Desconsiderar)
  await db.update(produtos).set({ projetarEstatistica: false });

  const allProdutos = await db
    .select({ id: produtos.id, codItem: produtos.codItem, codigo: produtos.codigo })
    .from(produtos);
  const idByCode = new Map<string, number>();
  for (const p of allProdutos) {
    if (p.codItem) idByCode.set(p.codItem.trim().toUpperCase(), p.id);
    if (p.codigo) idByCode.set(p.codigo.trim().toUpperCase(), p.id);
  }

  const projetarCodes = new Set<string>();
  for (const row of projRows) {
    // Power Query junta em sku_ajustado (+ marca). Não marcar cod_item antigo como projetar.
    const codes = [row.sku_ajustado, row.sku_novo]
      .map(v => (v || "").trim().toUpperCase())
      .filter(Boolean);
    for (const code of codes) projetarCodes.add(code);
  }

  const codigosCadastroOficial = new Set<string>();
  for (const row of cadRows) {
    for (const value of [row["Cod Item"], row.cod_item, row["SKU NOVO"], row.sku_novo]) {
      const code = (value || "").trim().toUpperCase();
      if (code) codigosCadastroOficial.add(code);
    }
  }
  const projetarSemCadastro = Array.from(projetarCodes).filter(
    code => !codigosCadastroOficial.has(code)
  );
  if (projetarSemCadastro.length > 0) {
    throw new Error(
      "SKUs marcados para projetar não constam no cadastro oficial: " +
        projetarSemCadastro.slice(0, 30).join(", ") +
        (projetarSemCadastro.length > 30
          ? ` (+${projetarSemCadastro.length - 30})`
          : "")
    );
  }

  const desconsiderarCodes = new Set<string>();
  for (const row of descRows) {
    const code = (row.sku_ajustado || "").trim().toUpperCase();
    if (code) desconsiderarCodes.add(code);
  }

  // Cria/atualiza SKUs do projetar ausentes (ou incompletos) no Cadastros,
  // copiando Linha/Tipo do cod_item relacionado (Relatório_Sku_Consolidado).
  const cadastroKeys = new Set(uniquePayloads.map(p => p.codItem.toUpperCase()));
  for (const row of projRows) {
    const sku = (row.sku_ajustado || pickSkuCode(row) || "").trim();
    if (!sku) continue;
    const key = sku.toUpperCase();
    const related =
      byCode.get((row.cod_item || "").trim().toUpperCase()) ||
      byCode.get((row.sku_novo || "").trim().toUpperCase());
    const marca = (row.marca || related?.marca || "").trim() || null;
    const tipoEstoque =
      normalizeTipoEstoque(row.tipo || "") ||
      (related?.tipoEstoque as "MTS" | "MTO" | null) ||
      "MTS";
    const marcaId = marca ? marcaIdByName.get(marca.toLowerCase()) ?? null : null;
    const linha = related?.linha ?? null;
    const tipoNegocio = related?.tipoNegocio ?? null;

    if (!cadastroKeys.has(key)) {
      const existing = byCode.get(key);
      if (existing) {
        await db
          .update(produtos)
          .set({
            marca,
            marcaId,
            linha,
            tipoEstoque,
            tipoNegocio,
          })
          .where(eq(produtos.id, existing.id));
        byCode.set(key, {
          ...existing,
          marca,
          marcaId,
          linha,
          tipoEstoque,
          tipoNegocio,
        } as (typeof existingProdutos)[number]);
        produtosAtualizados += 1;
      } else {
        const result = await db.insert(produtos).values({
          codItem: sku,
          codigo: sku,
          nome: sku,
          marca,
          marcaId,
          linha,
          tipoEstoque,
          tipoNegocio,
          status: "ATIVO",
          projetarEstatistica: false,
        });
        const id = Number(result[0].insertId);
        byCode.set(key, {
          id,
          codItem: sku,
          codigo: sku,
          marca,
          marcaId,
          linha,
          tipoEstoque,
          tipoNegocio,
          projetarEstatistica: false,
        } as (typeof existingProdutos)[number]);
        idByCode.set(key, id);
        produtosCriados += 1;
      }
    }
  }

  // Refresh id map after stub upserts
  for (const [code, prod] of byCode) {
    if (prod.id != null) idByCode.set(code, prod.id);
  }

  const projetarIds = new Set<number>();
  for (const code of projetarCodes) {
    const id = idByCode.get(code);
    if (id == null) {
      avisos.push(`SKU projetar sem cadastro: ${code}`);
      continue;
    }
    projetarIds.add(id);
  }

  const projetarIdList = Array.from(projetarIds);
  for (let i = 0; i < projetarIdList.length; i += 200) {
    const chunk = projetarIdList.slice(i, i + 200);
    if (chunk.length) {
      await db
        .update(produtos)
        .set({ projetarEstatistica: true })
        .where(inArray(produtos.id, chunk));
    }
  }

  // Desconsiderar NÃO derruba Skus Projetar (Vendas/Clientes = inner join projetar).
  const descIdList = Array.from(desconsiderarCodes)
    .map(code => idByCode.get(code))
    .filter((id): id is number => id != null);

  let deParaUpserted = 0;
  const existingDePara = await db.select().from(deParaCodigos);
  const deParaByOld = new Map(
    existingDePara.map(r => [r.skuAntigo.trim().toUpperCase(), r])
  );

  // CSV primeiro; Cadastros/Projetar por cima (SKU Ativo vence sobre De-Para desatualizado).
  const deParaPairs = new Map<string, string>();
  const deParaCsvPath = path.join(dir, "de-para-codigos.csv");
  if (fs.existsSync(deParaCsvPath)) {
    const dpRows = parseCsv(fs.readFileSync(deParaCsvPath, "utf8").replace(/;/g, ","));
    for (const row of dpRows) {
      const antigo = (row["SKU Antigo"] || row.sku_antigo || row.skuAntigo || "").trim();
      const novo = (row["SKU Novo"] || row.sku_novo || row.skuNovo || "").trim();
      if (antigo && novo && antigo.toUpperCase() !== novo.toUpperCase()) {
        deParaPairs.set(antigo.toUpperCase(), novo);
      }
    }
  }
  for (const row of cadRows) {
    const antigo = (row["Cod Item"] || "").trim();
    const novo = (row["SKU NOVO"] || "").trim();
    if (antigo && novo && antigo.toUpperCase() !== novo.toUpperCase()) {
      deParaPairs.set(antigo.toUpperCase(), novo);
    }
  }
  // Skus Projetar: cod_item antigo → sku_ajustado atual
  for (const row of projRows) {
    const antigo = (row.cod_item || "").trim();
    const novo = (row.sku_ajustado || row.sku_novo || "").trim();
    if (antigo && novo && antigo.toUpperCase() !== novo.toUpperCase()) {
      deParaPairs.set(antigo.toUpperCase(), novo);
    }
  }

  const deParaToInsert: { skuAntigo: string; skuNovo: string }[] = [];
  for (const [antigoKey, novo] of deParaPairs) {
    const existing = deParaByOld.get(antigoKey);
    if (!existing) {
      deParaToInsert.push({ skuAntigo: antigoKey, skuNovo: novo });
    } else if (existing.skuNovo.trim().toUpperCase() !== novo.toUpperCase()) {
      await db
        .update(deParaCodigos)
        .set({ skuNovo: novo })
        .where(eq(deParaCodigos.id, existing.id));
      deParaUpserted += 1;
    }
  }
  for (let i = 0; i < deParaToInsert.length; i += 100) {
    const chunk = deParaToInsert.slice(i, i + 100);
    await db.insert(deParaCodigos).values(chunk);
    deParaUpserted += chunk.length;
  }
  invalidateDeParaCache();

  return {
    dir,
    marcasUpserted,
    produtosAtualizados,
    produtosCriados,
    projetarTrue: projetarIdList.length,
    desconsiderar: descIdList.length,
    deParaUpserted,
    avisos: avisos.slice(0, 50),
    fontes,
  };
}
