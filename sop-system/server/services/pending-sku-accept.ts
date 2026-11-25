import * as db from "../db";
import { getDb } from "../db";
import { deParaCodigos } from "../../drizzle/schema";
import {
  rankSkuSimilarityCandidates,
  type SkuSimilarityCandidate,
} from "@shared/sku-descricao-similarity";
import { invalidateDeParaCache } from "./de-para-map";
import { validateDeParaEdge, inheritProjetarFromAntigo } from "./de-para-validate";
import {
  acceptPendingSkusFromFaturamentoBatch,
  listPendingSkusFromFaturamento,
  type AcceptPendingSkusBatchResult,
} from "./seed-from-faturamento";

export type SkuReferenciaSugestao = SkuSimilarityCandidate & { score: number };

function clean(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

async function loadSimilarityCandidates(): Promise<SkuSimilarityCandidate[]> {
  const [produtosList, pending] = await Promise.all([
    db.listProdutos(),
    listPendingSkusFromFaturamento(),
  ]);
  const out: SkuSimilarityCandidate[] = [];
  const seen = new Set<string>();
  for (const p of produtosList) {
    const codigo = clean(p.codItem) || clean(p.codigo);
    if (!codigo) continue;
    const key = codigo.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      codigo,
      descricao: clean(p.descricao) || clean(p.nome) || codigo,
      marca: p.marca,
    });
  }
  for (const p of pending) {
    const codigo = clean(p.codMaterial);
    if (!codigo) continue;
    const key = codigo.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      codigo,
      descricao: clean(p.descricaoItem) || codigo,
      marca: p.marca,
    });
  }
  return out;
}

export async function suggestSkuReferencias(
  codMaterial: string,
  limit = 10
): Promise<{ target: { codigo: string; descricao: string; marca: string | null }; sugestoes: SkuReferenciaSugestao[] }> {
  const cod = clean(codMaterial);
  if (!cod) throw new Error("Código inválido");

  const pending = await listPendingSkusFromFaturamento();
  const row =
    pending.find(p => clean(p.codMaterial)?.toUpperCase() === cod.toUpperCase()) ??
    (await loadSimilarityCandidates()).find(c => c.codigo.toUpperCase() === cod.toUpperCase());

  const descricao = row && "descricaoItem" in row ? clean(row.descricaoItem) : (row as SkuSimilarityCandidate)?.descricao;
  const marca = row && "marca" in row ? clean(row.marca) : (row as SkuSimilarityCandidate)?.marca ?? null;

  const target = {
    codigo: cod,
    descricao: descricao || cod,
    marca,
  };

  const candidates = (await loadSimilarityCandidates()).filter(
    c => c.codigo.toUpperCase() !== cod.toUpperCase()
  );

  return {
    target,
    sugestoes: rankSkuSimilarityCandidates(target, candidates, limit),
  };
}

export async function suggestSkuReferenciasBatch(codMaterials: string[]) {
  const codes = [...new Set(codMaterials.map(c => clean(c)).filter(Boolean) as string[])];
  const results: Record<string, SkuReferenciaSugestao[]> = {};
  for (const cod of codes) {
    const { sugestoes } = await suggestSkuReferencias(cod, 10);
    results[cod] = sugestoes;
  }
  return results;
}

export type AcceptPendingSkuWithDeParaInput = {
  codMaterial: string;
  skuAntigo?: string | null;
};

export type AcceptPendingSkusWithDeParaResult = AcceptPendingSkusBatchResult & {
  deParaCriados: number;
};

export async function acceptPendingSkusWithDePara(
  items: AcceptPendingSkuWithDeParaInput[]
): Promise<AcceptPendingSkusWithDeParaResult> {
  if (!items.length) {
    return { criados: 0, jaExistiam: 0, erros: [], detalhes: [], deParaCriados: 0 };
  }

  const codes = items.map(i => i.codMaterial);
  const batch = await acceptPendingSkusFromFaturamentoBatch(codes, { skipIdentityDePara: true });

  let deParaCriados = 0;
  const byCod = new Map(
    items.map(i => [clean(i.codMaterial)?.toUpperCase() ?? "", i.skuAntigo?.trim() || null])
  );

  const database = await getDb();
  if (!database) throw new Error("Database not available");

  const antigos = new Set<string>();
  for (const [cod, skuAntigo] of byCod) {
    if (!cod || !skuAntigo) continue;
    if (skuAntigo.toUpperCase() === cod) continue;
    antigos.add(`${skuAntigo.toUpperCase()}||${cod}`);
  }

  if (antigos.size > 0) {
    await database.transaction(async tx => {
      const existing = await tx.select().from(deParaCodigos);
      const accPairs = existing.map(r => ({ skuAntigo: r.skuAntigo, skuNovo: r.skuNovo }));

      for (const pairKey of antigos) {
        const [skuAntigo, skuNovo] = pairKey.split("||");
        await validateDeParaEdge(skuAntigo, skuNovo, accPairs);
        await tx
          .insert(deParaCodigos)
          .values({ skuAntigo, skuNovo })
          .onDuplicateKeyUpdate({ set: { skuNovo } });
        await inheritProjetarFromAntigo(skuAntigo, skuNovo);
        accPairs.push({ skuAntigo, skuNovo });
        deParaCriados += 1;
      }
    });
    invalidateDeParaCache();
  }

  for (const d of batch.detalhes) {
    const ref = byCod.get(clean(d.codMaterial)?.toUpperCase() ?? "");
    if (ref && ref.toUpperCase() !== clean(d.codMaterial)?.toUpperCase()) {
      d.deParaCriado = antigos.has(`${ref.toUpperCase()}||${clean(d.codMaterial)?.toUpperCase()}`);
    } else {
      d.deParaCriado = false;
    }
  }

  return { ...batch, deParaCriados };
}