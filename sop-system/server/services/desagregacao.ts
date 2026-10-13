/**
 * Passo 3 — desagrega Previsão Final Sugerida (Tipo-Marca-Linha / total 12M)
 * em grade SKU × mês usando sazonalidade da marca e rateio (6M preferencial, senão 12M).
 */
import { and, desc, eq } from "drizzle-orm";
import XLSX from "xlsx";
import { getDb } from "../db";
import {
  cicloComercialItens,
  ciclosComerciais,
  familias,
  faturamento,
  gestorMarca,
  gestores,
  marcas,
  produtos,
  sazonalidadeMarca,
  type InsertCicloComercialItem,
} from "../../drizzle/schema";
import * as previsaoPython from "../previsaoPython";
import { loadDeParaMap, resolveCodigoAtual } from "./de-para-map";

const MES_KEYS = ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9", "m10", "m11", "m12"] as const;
type PlanoColab = "MTS" | "JITO" | "PV_MTO" | "CRM";
type MesesCiclo = Record<(typeof MES_KEYS)[number], string>;

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const n = Number(String(value ?? "0").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function normalizeHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function pickColumn(columns: string[], aliases: string[]) {
  const normalized = columns.map((c) => ({ raw: c, n: normalizeHeader(c) }));
  for (const alias of aliases) {
    const target = normalizeHeader(alias);
    const hit = normalized.find((c) => c.n === target || c.n.includes(target));
    if (hit) return hit.raw;
  }
  return null;
}

function buildCodificacao(tipo: string | null | undefined, marca: string | null | undefined, linha: string | null | undefined) {
  return `${(tipo || "MTS").toUpperCase()}-${(marca || "SEM-MARCA").trim()}-${(linha || "SEM-LINHA").trim()}`;
}

function isSkuLevelCodigo(codigo: string) {
  const c = codigo.trim();
  return /^\d/.test(c) || /^\d{2}\.\d{2}\.\d+/.test(c);
}

function extractSkuFromCodigo(codigo: string) {
  const m = codigo.trim().match(/^([\d.]+[A-Za-z0-9]*)/);
  if (m) return m[1];
  const dash = codigo.indexOf("-");
  return dash > 0 ? codigo.slice(0, dash).trim() : codigo.trim();
}

async function loadSazonalidadeMap() {
  const db = await getDb();
  if (!db) return new Map<string, number[]>();

  const rows = await db.select().from(sazonalidadeMarca);
  const map = new Map<string, number[]>();

  for (const row of rows) {
    const key = row.marcaNome.trim().toLowerCase();
    if (!map.has(key)) map.set(key, Array(12).fill(0));
    const arr = map.get(key)!;
    const mes = row.mes;
    if (mes >= 1 && mes <= 12) {
      arr[mes - 1] = toNumber(row.percentual);
    }
  }

  // Normaliza para somar 1 (ou uniforme se vazio/zerado)
  Array.from(map.entries()).forEach(([key, arr]) => {
    const sum = arr.reduce((a: number, b: number) => a + b, 0);
    if (sum <= 0) {
      map.set(key, Array(12).fill(1 / 12));
    } else if (Math.abs(sum - 1) > 0.01) {
      map.set(
        key,
        arr.map((v: number) => v / sum)
      );
    }
  });

  return map;
}

function defaultSazonalidade() {
  return Array(12).fill(1 / 12) as number[];
}

export function getClosedWindowBounds(now = new Date()) {
  const endExclusive = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    cutoff6: new Date(endExclusive.getFullYear(), endExclusive.getMonth() - 6, 1),
    cutoff12: new Date(endExclusive.getFullYear(), endExclusive.getMonth() - 12, 1),
    endExclusive,
  };
}

export function getSeasonalityIndex(mesInicio: number, offset: number) {
  return ((mesInicio - 1 + offset) % 12 + 12) % 12;
}

export function netSalesQuantity(
  tipoFaturamento: string | null | undefined,
  quantidade: number
) {
  return (tipoFaturamento || "").trim().toUpperCase() === "DEVOLUCAO"
    ? -Math.abs(quantidade)
    : quantidade;
}

export function calculateRateio(
  quantidadeSku: number,
  quantidadeGrupo: number,
  fallback = 0
) {
  return quantidadeGrupo > 0 ? quantidadeSku / quantidadeGrupo : fallback;
}

function cycleMonthAbsolute(ano: number, mes: number) {
  return ano * 12 + (mes - 1);
}

export function alignCycleMonths(
  previousYear: number,
  previousMonth: number,
  targetYear: number,
  targetMonth: number,
  previousValues: MesesCiclo
): MesesCiclo {
  const aligned = {
    m1: "0", m2: "0", m3: "0", m4: "0", m5: "0", m6: "0",
    m7: "0", m8: "0", m9: "0", m10: "0", m11: "0", m12: "0",
  } satisfies MesesCiclo;
  const previousStart = cycleMonthAbsolute(previousYear, previousMonth);
  const targetStart = cycleMonthAbsolute(targetYear, targetMonth);
  for (let previousIndex = 0; previousIndex < 12; previousIndex++) {
    const targetIndex = previousStart + previousIndex - targetStart;
    if (targetIndex < 0 || targetIndex >= 12) continue;
    aligned[MES_KEYS[targetIndex]] = String(
      Math.round(toNumber(previousValues[MES_KEYS[previousIndex]]) * 100) / 100
    );
  }
  return aligned;
}

async function computeRateiosPorSku(now = new Date()) {
  const db = await getDb();
  type RateioInfo = {
    rateio12: number;
    rateio6: number;
    tipoMarcaLinha: string;
    sku: string;
    descricao: string | null;
    marca: string | null;
    linha: string | null;
    tipoEstoque: "MTS" | "MTO";
    tipoNegocio: string | null;
    projetar: boolean;
    valorVenda: string | null;
    familia: string | null;
    gestor: string | null;
  };
  if (!db) return new Map<string, RateioInfo>();

  const fat = await db
    .select({
      codMaterial: faturamento.codMaterial,
      marca: faturamento.marca,
      linha: faturamento.linhaProduto,
      tipoEstoque: faturamento.tipoEstoque,
      tipoNegocio: faturamento.tipoNegocio,
      tipoFaturamento: faturamento.tipoFaturamento,
      qtd: faturamento.qtd,
      dataEmissao: faturamento.dataEmissao,
    })
    .from(faturamento);

  const produtosRows = await db
    .select({
      codItem: produtos.codItem,
      codigo: produtos.codigo,
      descricao: produtos.descricao,
      nome: produtos.nome,
      marca: produtos.marca,
      linha: produtos.linha,
      tipoEstoque: produtos.tipoEstoque,
      tipoNegocio: produtos.tipoNegocio,
      projetarEstatistica: produtos.projetarEstatistica,
      valorVenda: produtos.valorVenda,
      familiaId: produtos.familiaId,
      marcaId: produtos.marcaId,
    })
    .from(produtos);
  const [familiasRows, gestoresRows, gestorMarcaRows] = await Promise.all([
    db.select({ id: familias.id, nome: familias.nome }).from(familias),
    db
      .select({ id: gestores.id, nome: gestores.nome })
      .from(gestores)
      .where(eq(gestores.ativo, true)),
    db
      .select({ marcaId: gestorMarca.marcaId, gestorId: gestorMarca.gestorId })
      .from(gestorMarca)
      .where(eq(gestorMarca.ativo, true)),
  ]);
  const familiaById = new Map(familiasRows.map(row => [row.id, row.nome]));
  const gestorById = new Map(gestoresRows.map(row => [row.id, row.nome]));
  const gestorByMarcaId = new Map<number, string>();
  for (const relation of gestorMarcaRows) {
    const gestor = gestorById.get(relation.gestorId);
    if (gestor) gestorByMarcaId.set(relation.marcaId, gestor);
  }

  const byCode = new Map<string, (typeof produtosRows)[number]>();
  for (const p of produtosRows) {
    if (p.codItem) byCode.set(p.codItem.trim().toUpperCase(), p);
    if (p.codigo) byCode.set(p.codigo.trim().toUpperCase(), p);
  }

  const marcasInativasRows = await db
    .select({ nome: marcas.nome })
    .from(marcas)
    .where(eq(marcas.ativo, false));
  const marcasInativas = new Set(
    marcasInativasRows.map(r => (r.nome || "").trim().toLowerCase()).filter(Boolean)
  );

  const deParaMap = await loadDeParaMap();
  const { cutoff6, cutoff12, endExclusive } = getClosedWindowBounds(now);

  const bySku = new Map<
    string,
    {
      sku: string;
      descricao: string | null;
      marca: string | null;
      linha: string | null;
      tipoEstoque: "MTS" | "MTO";
      tipoNegocio: string | null;
      tipoMarcaLinha: string;
      projetar: boolean;
      valorVenda: string | null;
      familia: string | null;
      gestor: string | null;
      q12: number;
      q6: number;
    }
  >();
  const groupTotals12 = new Map<string, number>();
  const groupTotals6 = new Map<string, number>();

  for (const row of fat) {
    const skuOriginal = (row.codMaterial || "").trim();
    if (!skuOriginal) continue;
    const sku = resolveCodigoAtual(skuOriginal, deParaMap);
    const prod =
      byCode.get(sku.toUpperCase()) || byCode.get(skuOriginal.toUpperCase());
    if (!prod) continue;
    // Inclui SKUs não-projetar no mapa de rateio para fallback de grupos da Visão
    // que não têm nenhum item marcado em Skus Projetar.
    if ((prod.status || "").toUpperCase() === "INATIVO") continue;

    const tipo = (prod.tipoEstoque || row.tipoEstoque || "MTS") as "MTS" | "MTO";
    const marca = prod.marca || row.marca || "SEM-MARCA";
    const linha = prod.linha || row.linha || "SEM-LINHA";
    const tipoNegocio = prod.tipoNegocio || row.tipoNegocio || null;
    if ((tipo || "").toUpperCase() === "OUTROS" || (tipoNegocio || "").toUpperCase() === "OUTROS") {
      continue;
    }
    if (marcasInativas.has((marca || "").trim().toLowerCase())) continue;

    const tml = buildCodificacao(tipo, marca, linha);
    const d = new Date(String(row.dataEmissao));
    if (Number.isNaN(d.getTime()) || d < cutoff12 || d >= endExclusive) continue;
    const q = netSalesQuantity(row.tipoFaturamento, toNumber(row.qtd));

    if (!bySku.has(sku)) {
      bySku.set(sku, {
        sku,
        descricao: prod.descricao || prod.nome || null,
        marca,
        linha,
        tipoEstoque: tipo,
        tipoNegocio,
        tipoMarcaLinha: tml,
        projetar: prod.projetarEstatistica === true,
        valorVenda: prod.valorVenda,
        familia: prod.familiaId ? familiaById.get(prod.familiaId) ?? null : null,
        gestor: prod.marcaId ? gestorByMarcaId.get(prod.marcaId) ?? null : null,
        q12: 0,
        q6: 0,
      });
    }
    const agg = bySku.get(sku)!;
    agg.q12 += q;
    groupTotals12.set(tml, (groupTotals12.get(tml) || 0) + q);
    if (d >= cutoff6) {
      agg.q6 += q;
      groupTotals6.set(tml, (groupTotals6.get(tml) || 0) + q);
    }
  }

  const result = new Map<string, RateioInfo>();

  Array.from(bySku.entries()).forEach(([sku, agg]) => {
    const t12 = groupTotals12.get(agg.tipoMarcaLinha) || 0;
    const t6 = groupTotals6.get(agg.tipoMarcaLinha) || 0;
    const rateio12 = calculateRateio(agg.q12, t12);
    const rateio6 = calculateRateio(agg.q6, t6, rateio12);
    result.set(sku, {
      rateio12,
      rateio6,
      tipoMarcaLinha: agg.tipoMarcaLinha,
      sku,
      descricao: agg.descricao,
      marca: agg.marca,
      linha: agg.linha,
      tipoEstoque: agg.tipoEstoque,
      tipoNegocio: agg.tipoNegocio,
      projetar: agg.projetar,
      valorVenda: agg.valorVenda,
      familia: agg.familia,
      gestor: agg.gestor,
    });
  });

  return result;
}

function resolvePlanoColab(
  tipoEstoque: "MTS" | "MTO",
  _tipoNegocioHint?: string | null
): "MTS" | "PV_MTO" {
  // TI: aba JIT deixa de existir e passa a fazer parte da MTS.
  if (tipoEstoque === "MTO") return "PV_MTO";
  return "MTS";
}

function previousCollaborationKey(plano: PlanoColab, sku: string) {
  return `${plano}||${sku.trim().toUpperCase()}`;
}

/** Colaboração do predecessor cronológico, alinhada às competências do novo ciclo. */
async function loadColabCicloAnterior(
  targetYear: number,
  targetMonth: number
): Promise<Map<string, MesesCiclo & { qtdeColaborada: string }>> {
  const db = await getDb();
  const empty = new Map<string, MesesCiclo & { qtdeColaborada: string }>();
  if (!db) return empty;

  const targetAbsolute = cycleMonthAbsolute(targetYear, targetMonth);
  const candidates = await db
    .select()
    .from(ciclosComerciais)
    .orderBy(desc(ciclosComerciais.id))
    .limit(100);
  const ciclo = candidates
    .filter(item => item.status === "FECHADO" || item.status === "CONSOLIDADO")
    .filter(item => cycleMonthAbsolute(item.anoInicio, item.mesInicio) < targetAbsolute)
    .sort(
      (a, b) =>
        cycleMonthAbsolute(b.anoInicio, b.mesInicio) -
          cycleMonthAbsolute(a.anoInicio, a.mesInicio) ||
        b.id - a.id
    )[0];
  if (!ciclo) return empty;

  const itens = await db
    .select()
    .from(cicloComercialItens)
    .where(eq(cicloComercialItens.cicloId, ciclo.id));

  const map = new Map<string, MesesCiclo & { qtdeColaborada: string }>();
  for (const item of itens) {
    const key = previousCollaborationKey(item.planoColab, item.sku);
    const existing = map.get(key) ?? {
      m1: "0", m2: "0", m3: "0", m4: "0", m5: "0", m6: "0",
      m7: "0", m8: "0", m9: "0", m10: "0", m11: "0", m12: "0",
      qtdeColaborada: "0",
    };
    const previousValues = {} as MesesCiclo;
    for (const monthKey of MES_KEYS) {
      previousValues[monthKey] = String(item[monthKey] ?? "0");
    }
    const aligned = alignCycleMonths(
      ciclo.anoInicio,
      ciclo.mesInicio,
      targetYear,
      targetMonth,
      previousValues
    );
    for (const monthKey of MES_KEYS) {
      const quantity = toNumber(existing[monthKey]) + toNumber(aligned[monthKey]);
      existing[monthKey] = String(Math.round(quantity * 100) / 100);
    }
    existing.qtdeColaborada = String(
      Math.round(MES_KEYS.reduce((sum, keyName) => sum + toNumber(existing[keyName]), 0) * 100) /
        100
    );
    map.set(key, existing);
  }
  return map;
}

export type DesagregarInput = {
  jobId: number;
  nomeCiclo?: string;
  anoInicio?: number;
  mesInicio?: number;
  createdBy?: string | null;
};

export async function desagregarJobParaCicloComercial(input: DesagregarInput) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const analytics = await previsaoPython.getPrevisaoJobExecutiveAnalytics(input.jobId);

  // Pagina a Visao_Executiva (API limita pageSize a 250)
  let page = 1;
  let totalPages = 1;
  let columns: string[] = [];
  const allRows: string[][] = [];
  while (page <= totalPages) {
    const sheet = await previsaoPython.getPrevisaoJobSheetData(input.jobId, "Visao_Executiva", {
      page,
      pageSize: 250,
    });
    columns = sheet.columns;
    totalPages = sheet.totalPages;
    allRows.push(...sheet.rows);
    page += 1;
    if (page > 200) break;
  }

  const codigoColName = pickColumn(columns, ["Codigo", "Codificação", "Codificacao"]);
  if (!codigoColName) {
    throw new Error("Não foi possível localizar a coluna Codigo na aba Visao_Executiva.");
  }

  /**
   * Escolhe a melhor coluna de total 12M.
   * Em jobs recentes "Previsão Final Sugerida" existe mas vem vazia;
   * "Valor Melhor Opção" / "Historico + Ajuste" trazem a quantidade.
   */
  const totalCandidates = [
    "Previsao Final Sugerida",
    "Previsão Final Sugerida",
    "Valor Melhor Opcao",
    "Valor Melhor Opção",
    "Historico + Ajuste",
    "Histórico + Ajuste",
    "Historico 12M",
    "Histórico 12M",
    "Qtde Total",
  ];

  function scoreTotalColumn(colName: string): number {
    const idx = columns.indexOf(colName);
    if (idx < 0) return -1;
    let sum = 0;
    let nonzero = 0;
    for (const row of allRows) {
      const n = toNumber(row[idx]);
      if (n > 0) {
        sum += n;
        nonzero += 1;
      }
    }
    // Prefer columns with values; tiny tie-break by sum
    return nonzero > 0 ? nonzero * 1e12 + sum : 0;
  }

  let totalColName: string | null = null;
  let bestScore = 0;
  const seen = new Set<string>();
  for (const alias of totalCandidates) {
    const resolved = pickColumn(columns, [alias]);
    if (!resolved || seen.has(resolved)) continue;
    seen.add(resolved);
    const score = scoreTotalColumn(resolved);
    if (score > bestScore) {
      bestScore = score;
      totalColName = resolved;
    }
  }

  if (!totalColName || bestScore <= 0) {
    throw new Error(
      "Não foi possível localizar coluna de quantidade com valores na aba Visao_Executiva " +
        "(Previsão Final Sugerida / Valor Melhor Opção)."
    );
  }

  const codigoIdx = columns.indexOf(codigoColName);
  const totalIdx = columns.indexOf(totalColName);

  const totaisPorGrupo = new Map<string, number>();
  for (const row of allRows) {
    const codigo = String(row[codigoIdx] ?? "").trim();
    if (!codigo) continue;
    const total = toNumber(row[totalIdx]);
    if (total <= 0) continue;
    totaisPorGrupo.set(codigo, total);
  }

  if (totaisPorGrupo.size === 0) {
    throw new Error(
      `Visao_Executiva sem linhas utilizáveis para desagregação (coluna usada: ${totalColName}).`
    );
  }

  const sazonalidade = await loadSazonalidadeMap();
  const rateios = await computeRateiosPorSku();

  type SkuRateio = NonNullable<ReturnType<typeof rateios.get>>;
  const skusPorGrupo = new Map<string, SkuRateio[]>();
  const skusPorCodigo = new Map<string, SkuRateio>();
  Array.from(rateios.values()).forEach(info => {
    const list = skusPorGrupo.get(info.tipoMarcaLinha) ?? [];
    list.push(info);
    skusPorGrupo.set(info.tipoMarcaLinha, list);
    skusPorCodigo.set(info.sku.trim().toUpperCase(), info);
    const skuMarca = `${info.sku}-${info.marca || ""}`.trim();
    if (skuMarca) skusPorCodigo.set(skuMarca.toUpperCase(), info);
  });

  function resolveListaParaGrupo(grupo: string): SkuRateio[] {
    const direto = skusPorGrupo.get(grupo);
    if (direto && direto.length > 0) return direto;
    // Previsão já veio por SKU (sku_marca): rateio 1:1, sem redistribuir.
    if (!isSkuLevelCodigo(grupo)) return [];
    const byFull = skusPorCodigo.get(grupo.trim().toUpperCase());
    if (byFull) return [byFull];
    const bySku = skusPorCodigo.get(extractSkuFromCodigo(grupo).toUpperCase());
    return bySku ? [bySku] : [];
  }

  const now = new Date();
  const defaultStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const anoInicio = input.anoInicio ?? defaultStart.getFullYear();
  const mesInicio = input.mesInicio ?? defaultStart.getMonth() + 1;
  const colabAnterior = await loadColabCicloAnterior(anoInicio, mesInicio);
  const gruposSemSkus = Array.from(totaisPorGrupo.keys()).filter(
    grupo => resolveListaParaGrupo(grupo).length === 0
  );
  const gruposFallbackSemProjetar: string[] = [];
  for (const grupo of Array.from(totaisPorGrupo.keys())) {
    const lista = resolveListaParaGrupo(grupo);
    if (lista.length > 0 && !lista.some(s => s.projetar)) {
      gruposFallbackSemProjetar.push(grupo);
    }
  }
  if (gruposSemSkus.length > 0) {
    console.warn(
      `[desagregacao] Grupos Visao_Executiva sem SKUs no cadastro/faturamento (ignorados): ` +
        gruposSemSkus.join(", ")
    );
  }
  if (gruposFallbackSemProjetar.length > 0) {
    console.warn(
      `[desagregacao] Grupos sem Skus Projetar — rateio fallback em SKUs ativos: ` +
        gruposFallbackSemProjetar.join(", ")
    );
  }
  for (const grupo of gruposSemSkus) {
    totaisPorGrupo.delete(grupo);
  }
  if (totaisPorGrupo.size === 0) {
    throw new Error(
      "Nenhum grupo da Visao_Executiva possui SKUs reconciliados no cadastro para desagregar."
    );
  }
  const nome =
    input.nomeCiclo ||
    `Ciclo ${String(mesInicio).padStart(2, "0")}/${String(anoInicio).slice(-2)} (job ${input.jobId})`;

  const insertResult = await db.insert(ciclosComerciais).values({
    nome,
    anoInicio,
    mesInicio,
    horizonteMeses: 12,
    jobId: input.jobId,
    status: "EM_COLABORACAO",
    createdBy: input.createdBy ?? null,
    observacoes:
      `Desagregado de job Python #${input.jobId}. ` +
      `Itens executivos: ${analytics.summary?.skuCount ?? totaisPorGrupo.size}. ` +
      `Coluna quantidade: ${totalColName}.` +
      (gruposSemSkus.length
        ? ` Grupos ignorados sem SKU: ${gruposSemSkus.join(", ")}.`
        : "") +
      (gruposFallbackSemProjetar.length
        ? ` Fallback sem Projetar: ${gruposFallbackSemProjetar.join(", ")}.`
        : ""),
  });
  const cicloId = insertResult[0].insertId;
  const itens: InsertCicloComercialItem[] = [];
  const skusJaIncluidos = new Set<string>();

  for (const [grupo, total12m] of Array.from(totaisPorGrupo.entries())) {
    const lista = resolveListaParaGrupo(grupo);

    // Renormaliza rateio a considerar entre SKUs que projetam
    const projetaveis = lista.filter(s => s.projetar);
    const usingFallback = projetaveis.length === 0;
    const base = usingFallback ? lista : projetaveis;
    const prefer6 = base.some(s => s.rateio6 > 0);
    let pesos = base.map(s => (prefer6 && s.rateio6 > 0 ? s.rateio6 : s.rateio12));
    let somaPesos = pesos.reduce((a, b) => a + b, 0);
    if (somaPesos <= 0) {
      pesos = base.map(() => 1);
      somaPesos = pesos.length;
    }

    base.forEach((skuInfo, idx) => {
      const rateio = pesos[idx] / somaPesos;
      const marcaKey = (skuInfo.marca || "").toLowerCase();
      const saz = sazonalidade.get(marcaKey) || defaultSazonalidade();
      const plano = resolvePlanoColab(
        skuInfo.tipoEstoque,
        "tipoNegocio" in skuInfo ? skuInfo.tipoNegocio : null
      );
      const meses: Record<(typeof MES_KEYS)[number], string> = {
        m1: "0",
        m2: "0",
        m3: "0",
        m4: "0",
        m5: "0",
        m6: "0",
        m7: "0",
        m8: "0",
        m9: "0",
        m10: "0",
        m11: "0",
        m12: "0",
      };

      let totalSku = 0;
      const prev = colabAnterior.get(previousCollaborationKey(plano, skuInfo.sku));

      if (!skuInfo.projetar && !usingFallback && prev) {
        // Excel col P = não projetar → mantém colaboração/cliente do ciclo anterior
        for (const k of MES_KEYS) {
          meses[k] = prev[k] || "0";
          totalSku += toNumber(meses[k]);
        }
      } else {
        for (let i = 0; i < 12; i++) {
          const seasonalityIndex = getSeasonalityIndex(mesInicio, i);
          const allocate = skuInfo.projetar || usingFallback;
          const q = allocate ? total12m * saz[seasonalityIndex] * rateio : 0;
          const rounded = Math.round(q * 100) / 100;
          meses[MES_KEYS[i]] = String(rounded);
          totalSku += rounded;
        }
      }

      skusJaIncluidos.add(skuInfo.sku);
      const keepPrevColab = !skuInfo.projetar && !usingFallback && prev;
      const estatisticaMeses = {
        e1: meses.m1,
        e2: meses.m2,
        e3: meses.m3,
        e4: meses.m4,
        e5: meses.m5,
        e6: meses.m6,
        e7: meses.m7,
        e8: meses.m8,
        e9: meses.m9,
        e10: meses.m10,
        e11: meses.m11,
        e12: meses.m12,
      };
      // TI: previsão em e*; colaboração do vendedor em m* (em branco no ciclo novo).
      const colabMeses = keepPrevColab
        ? meses
        : {
            m1: null,
            m2: null,
            m3: null,
            m4: null,
            m5: null,
            m6: null,
            m7: null,
            m8: null,
            m9: null,
            m10: null,
            m11: null,
            m12: null,
          };
      itens.push({
        cicloId,
        planoColab: plano,
        sku: skuInfo.sku,
        descricao: skuInfo.descricao,
        marca: skuInfo.marca,
        linha: skuInfo.linha,
        tipoEstoque: skuInfo.tipoEstoque,
        tipoMarcaLinha: skuInfo.tipoMarcaLinha,
        projetar: skuInfo.projetar,
        rateio12m: String(Math.round(skuInfo.rateio12 * 1e6) / 1e6),
        rateio6m: String(Math.round(skuInfo.rateio6 * 1e6) / 1e6),
        rateioConsiderar: String(Math.round(rateio * 1e6) / 1e6),
        qtdeTotalEstatistica: String(Math.round(total12m * rateio * 100) / 100),
        valorVendaSnapshot: String(toNumber(skuInfo.valorVenda)),
        familiaSnapshot: skuInfo.familia,
        gestorSnapshot: skuInfo.gestor,
        ...estatisticaMeses,
        ...colabMeses,
        qtdeColaborada: String(Math.round(totalSku * 100) / 100),
        origem: keepPrevColab ? "MANUAL" : "ESTATISTICA",
      });
    });
  }

  // SKUs com projetar=não que estavam no ciclo anterior e não vieram da Visão Executiva
  const produtosNaoProjetar = await db
    .select()
    .from(produtos)
    .where(eq(produtos.projetarEstatistica, false));

  for (const prod of produtosNaoProjetar) {
    const sku = (prod.codItem || prod.codigo || "").trim();
    if (!sku || skusJaIncluidos.has(sku)) continue;
    const plano = resolvePlanoColab(
      (prod.tipoEstoque || "MTS") as "MTS" | "MTO",
      prod.tipoNegocio
    );
    const prev = colabAnterior.get(previousCollaborationKey(plano, sku));
    if (!prev) continue;

    const meses = {} as Record<(typeof MES_KEYS)[number], string>;
    let totalSku = 0;
    for (const k of MES_KEYS) {
      meses[k] = prev[k] || "0";
      totalSku += toNumber(meses[k]);
    }

    skusJaIncluidos.add(sku);
    itens.push({
      cicloId,
      planoColab: plano,
      sku,
      descricao: prod.descricao || prod.nome || null,
      marca: prod.marca,
      linha: prod.linha,
      tipoEstoque: (prod.tipoEstoque || "MTS") as "MTS" | "MTO",
      tipoMarcaLinha: buildCodificacao(prod.tipoEstoque, prod.marca, prod.linha),
      projetar: false,
      e1: meses.m1,
      e2: meses.m2,
      e3: meses.m3,
      e4: meses.m4,
      e5: meses.m5,
      e6: meses.m6,
      e7: meses.m7,
      e8: meses.m8,
      e9: meses.m9,
      e10: meses.m10,
      e11: meses.m11,
      e12: meses.m12,
      rateio12m: "0",
      rateio6m: "0",
      rateioConsiderar: "0",
      qtdeTotalEstatistica: "0",
      valorVendaSnapshot: String(toNumber(prod.valorVenda)),
      ...meses,
      qtdeColaborada: String(Math.round(totalSku * 100) / 100),
      origem: "MANUAL",
    });
  }

  // Insert em lotes
  const chunk = 200;
  for (let i = 0; i < itens.length; i += chunk) {
    await db.insert(cicloComercialItens).values(itens.slice(i, i + chunk));
  }

  return {
    cicloId,
    itensCriados: itens.length,
    grupos: totaisPorGrupo.size,
  };
}

export async function seedSazonalidadeUniformeSeVazia() {
  const db = await getDb();
  if (!db) return { inserted: 0 };

  const existing = await db.select({ id: sazonalidadeMarca.id }).from(sazonalidadeMarca).limit(1);
  if (existing.length > 0) return { inserted: 0 };

  const marcasFat = await db
    .select({ marca: faturamento.marca })
    .from(faturamento)
    .groupBy(faturamento.marca);
  const marcasCad = await db.select({ nome: marcas.nome }).from(marcas);

  const nomes = new Set<string>();
  for (const row of marcasFat) {
    const nome = (row.marca || "").trim();
    if (nome) nomes.add(nome);
  }
  for (const row of marcasCad) {
    const nome = (row.nome || "").trim();
    if (nome) nomes.add(nome);
  }

  const values: Array<{ marcaNome: string; mes: number; percentual: string }> = [];
  for (const nome of nomes) {
    for (let mes = 1; mes <= 12; mes++) {
      values.push({
        marcaNome: nome,
        mes,
        percentual: String(Math.round((1 / 12) * 1e6) / 1e6),
      });
    }
  }

  const chunk = 300;
  for (let i = 0; i < values.length; i += chunk) {
    await db.insert(sazonalidadeMarca).values(values.slice(i, i + chunk));
  }

  return { inserted: values.length };
}

/**
 * Calcula sazonalidade por marca a partir do faturamento (média dos últimos N anos calendário,
 * ou fallback uniforme). Substitui valores existentes da marca.
 */
export async function calcularSazonalidadeDoFaturamento(anosHistorico = 3) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const rows = await db
    .select({
      marca: faturamento.marca,
      dataEmissao: faturamento.dataEmissao,
      qtd: faturamento.qtd,
    })
    .from(faturamento)
    .where(eq(faturamento.tipoFaturamento, "SAIDA"));

  if (rows.length === 0) {
    throw new Error("Sem faturamento SAIDA para calcular sazonalidade.");
  }

  const now = new Date();
  const anoMin = now.getFullYear() - Math.max(1, anosHistorico) + 1;

  type MesAgg = number[];
  const byMarca = new Map<string, MesAgg>();

  for (const row of rows) {
    const marca = (row.marca || "").trim();
    if (!marca) continue;
    const d = new Date(String(row.dataEmissao));
    if (Number.isNaN(d.getTime())) continue;
    if (d.getFullYear() < anoMin) continue;
    if (!byMarca.has(marca)) byMarca.set(marca, Array(12).fill(0));
    const arr = byMarca.get(marca)!;
    arr[d.getMonth()] += toNumber(row.qtd);
  }

  const upsertRows: Array<{ marcaNome: string; mes: number; percentual: string }> = [];

  Array.from(byMarca.entries()).forEach(([marca, arr]) => {
    const total = arr.reduce((a: number, b: number) => a + b, 0);
    const pesos =
      total > 0 ? arr.map((v: number) => v / total) : (Array(12).fill(1 / 12) as number[]);
    for (let mes = 1; mes <= 12; mes++) {
      upsertRows.push({
        marcaNome: marca,
        mes,
        percentual: String(Math.round(pesos[mes - 1] * 1e6) / 1e6),
      });
    }
  });

  // Reutiliza upsert do db via insert+update local
  for (const row of upsertRows) {
    const existing = await db
      .select()
      .from(sazonalidadeMarca)
      .where(
        and(eq(sazonalidadeMarca.marcaNome, row.marcaNome), eq(sazonalidadeMarca.mes, row.mes))
      )
      .limit(1);

    if (existing[0]) {
      await db
        .update(sazonalidadeMarca)
        .set({ percentual: row.percentual, anoReferencia: now.getFullYear() })
        .where(eq(sazonalidadeMarca.id, existing[0].id));
    } else {
      await db.insert(sazonalidadeMarca).values({
        marcaNome: row.marcaNome,
        mes: row.mes,
        percentual: row.percentual,
        anoReferencia: now.getFullYear(),
      });
    }
  }

  return { marcas: byMarca.size, rows: upsertRows.length };
}

const MES_ALIASES: Record<string, number> = {
  jan: 1,
  janeiro: 1,
  fev: 2,
  fevereiro: 2,
  mar: 3,
  marco: 3,
  março: 3,
  abr: 4,
  abril: 4,
  mai: 5,
  maio: 5,
  jun: 6,
  junho: 6,
  jul: 7,
  julho: 7,
  ago: 8,
  agosto: 8,
  set: 9,
  setembro: 9,
  out: 10,
  outubro: 10,
  nov: 11,
  novembro: 11,
  dez: 12,
  dezembro: 12,
  m1: 1,
  m2: 2,
  m3: 3,
  m4: 4,
  m5: 5,
  m6: 6,
  m7: 7,
  m8: 8,
  m9: 9,
  m10: 10,
  m11: 11,
  m12: 12,
};

function parsePercent(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw > 1.5 ? raw / 100 : raw;
  }
  const s = String(raw).trim().replace("%", "").replace(",", ".");
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return n > 1.5 ? n / 100 : n;
}

/**
 * Importa sazonalidade de planilha:
 * - Formato largo: Marca | jan | fev | ... | dez
 * - Formato longo: Marca | mes | percentual (ou % Sazonalidade)
 */
export function parseSazonalidadeWorkbook(buffer: Buffer) {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const preferred =
    wb.SheetNames.find(n => normalizeHeader(n).includes("sazonalidade")) ||
    wb.SheetNames[0];
  const ws = wb.Sheets[preferred];
  if (!ws) throw new Error("Planilha sem abas.");

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
  if (rows.length === 0) throw new Error("Aba vazia.");

  const headers = Object.keys(rows[0] || {});
  const marcaCol =
    headers.find(h => ["marca", "marcanome", "brand"].includes(normalizeHeader(h))) ||
    headers[0];

  const monthCols: Array<{ header: string; mes: number }> = [];
  for (const h of headers) {
    const n = normalizeHeader(h);
    const mesNum = MES_ALIASES[n] || MES_ALIASES[n.slice(0, 3)];
    if (mesNum) monthCols.push({ header: h, mes: mesNum });
  }

  const mesCol = headers.find(h =>
    ["mes", "mês", "month"].includes(normalizeHeader(h))
  );
  const pctCol = headers.find(h => {
    const n = normalizeHeader(h);
    return n.includes("sazonalidade") || n.includes("percentual") || n === "pct" || n === "perc";
  });

  const out: Array<{ marcaNome: string; mes: number; percentual: string }> = [];

  if (monthCols.length >= 6) {
    for (const row of rows) {
      const marca = String(row[marcaCol] ?? "").trim();
      if (!marca || normalizeHeader(marca) === "marca") continue;
      const pesos: number[] = Array(12).fill(0);
      for (const { header, mes } of monthCols) {
        const p = parsePercent(row[header]);
        if (p !== null) pesos[mes - 1] = p;
      }
      const sum = pesos.reduce((a, b) => a + b, 0);
      const norm = sum > 0 ? pesos.map(v => v / sum) : Array(12).fill(1 / 12);
      for (let mes = 1; mes <= 12; mes++) {
        out.push({
          marcaNome: marca,
          mes,
          percentual: String(Math.round(norm[mes - 1] * 1e6) / 1e6),
        });
      }
    }
  } else if (mesCol && pctCol) {
    const agg = new Map<string, number[]>();
    for (const row of rows) {
      const marca = String(row[marcaCol] ?? "").trim();
      if (!marca) continue;
      let mes = Number(row[mesCol]);
      if (!Number.isFinite(mes)) {
        const alias = MES_ALIASES[normalizeHeader(String(row[mesCol] ?? ""))];
        mes = alias || 0;
      }
      const pct = parsePercent(row[pctCol]);
      if (!mes || mes < 1 || mes > 12 || pct === null) continue;
      if (!agg.has(marca)) agg.set(marca, Array(12).fill(0));
      agg.get(marca)![mes - 1] = pct;
    }
    Array.from(agg.entries()).forEach(([marca, pesos]) => {
      const sum = pesos.reduce((a: number, b: number) => a + b, 0);
      const norm = sum > 0 ? pesos.map((v: number) => v / sum) : Array(12).fill(1 / 12);
      for (let mes = 1; mes <= 12; mes++) {
        out.push({
          marcaNome: marca,
          mes,
          percentual: String(Math.round(norm[mes - 1] * 1e6) / 1e6),
        });
      }
    });
  } else {
    throw new Error(
      "Formato não reconhecido. Use Marca+jan..dez ou Marca+mes+percentual/% Sazonalidade."
    );
  }

  return { sheetName: preferred, rows: out, marcas: new Set(out.map(r => r.marcaNome)).size };
}
