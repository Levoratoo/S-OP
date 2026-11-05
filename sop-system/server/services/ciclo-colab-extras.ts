/**
 * Completa o arquivo de Colaboração Comercial (Passo a Passo):
 * PV-MTO, CRM, PVxCRM, Resumo R$, Base Ciclo, MTO Variação, RFS, AA/Prev/Real.
 */
import { and, eq, gte, lte, sql } from "drizzle-orm";
import {
  getCicloComercial,
  getDb,
  listCicloComercialItens,
  monthEffectiveQty,
  sumItemMonths,
} from "../db";
import {
  carteiraPedidos,
  cicloComercialItens,
  ciclosComerciais,
  familias,
  faturamento,
  gestorMarca,
  gestores,
  marcas,
  produtos,
  type InsertCicloComercialItem,
} from "../../drizzle/schema";
import { loadDeParaMap, resolveCodigoAtual } from "./de-para-map";

const MES_KEYS = ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9", "m10", "m11", "m12"] as const;

function toNum(v: unknown) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(String(v ?? "0").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function emptyMeses(): Record<(typeof MES_KEYS)[number], string> {
  return {
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
}

function mesIndexNoCiclo(anoInicio: number, mesInicio: number, ano: number, mes: number): number | null {
  const absInicio = anoInicio * 12 + (mesInicio - 1);
  const abs = ano * 12 + (mes - 1);
  const idx = abs - absInicio;
  if (idx < 0 || idx > 11) return null;
  return idx;
}

/** Competência da carteira é data de calendário (mysql DATE em meia-noite UTC). */
export function competenciaYearMonth(value: unknown): { year: number; month: number } | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1 };
  }
  const s = String(value ?? "").trim();
  const iso = s.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?/);
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]) };
  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return null;
  return { year: parsed.getUTCFullYear(), month: parsed.getUTCMonth() + 1 };
}

async function loadProdutoMaps() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [rows, familyRows, managerRows, managerBrandRows] = await Promise.all([
    db.select().from(produtos),
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
  const byId = new Map(rows.map(p => [p.id, p]));
  const byCode = new Map<string, (typeof rows)[number]>();
  for (const p of rows) {
    if (p.codItem) byCode.set(p.codItem.trim().toUpperCase(), p);
    if (p.codigo) byCode.set(p.codigo.trim().toUpperCase(), p);
  }
  const familyById = new Map(familyRows.map(row => [row.id, row.nome]));
  const managerById = new Map(managerRows.map(row => [row.id, row.nome]));
  const managerByBrandId = new Map<number, string>();
  for (const relation of managerBrandRows) {
    const manager = managerById.get(relation.gestorId);
    if (manager) managerByBrandId.set(relation.marcaId, manager);
  }
  const dimensionsByProductId = new Map(
    rows.map(product => [
      product.id,
      {
        familia: product.familiaId
          ? familyById.get(product.familiaId) ?? null
          : null,
        gestor: product.marcaId
          ? managerByBrandId.get(product.marcaId) ?? null
          : null,
      },
    ])
  );
  return { byId, byCode, dimensionsByProductId };
}

export async function syncPvFromCarteira(cicloId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const ciclo = await getCicloComercial(cicloId);
  if (!ciclo) throw new Error("Ciclo não encontrado");

  if (ciclo.status === "FECHADO") {
    throw new Error("Ciclo fechado não recebe atualização da carteira.");
  }

  const { byId, dimensionsByProductId } = await loadProdutoMaps();
  const pedidos = await db.select().from(carteiraPedidos).where(eq(carteiraPedidos.faturado, false));

  // A aba PV MTO é a carteira de PV em aberto (pedidos Liberado + PRG), não a previsão estatística.
  await db
    .delete(cicloComercialItens)
    .where(
      and(eq(cicloComercialItens.cicloId, cicloId), eq(cicloComercialItens.planoColab, "PV_MTO"))
    );

  type PvLine = {
    pedidoCodigo: string;
    sequencia: number;
    sku: string;
    descricao: string | null;
    marca: string | null;
    linha: string | null;
    tipoEstoque: "MTS" | "MTO";
    valorVenda: string | null;
    familia: string | null;
    gestor: string | null;
    meses: number[];
  };
  const lines: PvLine[] = [];

  let pedidosForaDoCiclo = 0;
  let pedidosNoCiclo = 0;
  for (const ped of pedidos) {
    const prod = byId.get(ped.produtoId);
    if (!prod) continue;
    const sku = (prod.codItem || prod.codigo || "").trim();
    if (!sku) continue;
    const ym = competenciaYearMonth(ped.competencia);
    if (!ym) continue;
    const idx = mesIndexNoCiclo(ciclo.anoInicio, ciclo.mesInicio, ym.year, ym.month);
    if (idx == null) {
      pedidosForaDoCiclo += 1;
      continue;
    }
    pedidosNoCiclo += 1;

    const meses = Array(12).fill(0);
    meses[idx] = toNum(ped.quantidade);
    lines.push({
      pedidoCodigo: String(ped.codigo || "").trim() || sku,
      sequencia: Number(ped.sequencia) > 0 ? Number(ped.sequencia) : 1,
      sku,
      descricao: prod.descricao || prod.nome || null,
      marca: prod.marca,
      linha: prod.linha,
      tipoEstoque: prod.tipoEstoque === "MTO" ? "MTO" : "MTS",
      valorVenda: prod.valorVenda,
      familia: dimensionsByProductId.get(prod.id)?.familia ?? null,
      gestor: dimensionsByProductId.get(prod.id)?.gestor ?? null,
      meses,
    });
  }

  const itens: InsertCicloComercialItem[] = [];
  for (const line of lines) {
    const meses = emptyMeses();
    let total = 0;
    for (let i = 0; i < 12; i++) {
      const q = Math.round(line.meses[i] * 100) / 100;
      meses[MES_KEYS[i]] = String(q);
      total += q;
    }
    if (total <= 0) continue;
    itens.push({
      cicloId,
      planoColab: "PV_MTO",
      sku: line.sku,
      descricao: line.descricao,
      marca: line.marca,
      linha: line.linha,
      tipoEstoque: line.tipoEstoque,
      tipoMarcaLinha: `${line.tipoEstoque}-${line.marca || "SEM-MARCA"}-${line.linha || "SEM-LINHA"}`,
      projetar: false,
      qtdeTotalEstatistica: "0",
      valorVendaSnapshot: String(toNum(line.valorVenda)),
      familiaSnapshot: line.familia,
      gestorSnapshot: line.gestor,
      crmCard: line.pedidoCodigo,
      ...meses,
      qtdeColaborada: String(Math.round(total * 100) / 100),
      origem: "PV",
    });
  }

  for (let i = 0; i < itens.length; i += 200) {
    await db.insert(cicloComercialItens).values(itens.slice(i, i + 200));
  }

  return {
    itensCriados: itens.length,
    pedidosLidos: pedidos.length,
    pedidosNoCiclo,
    pedidosForaDoCiclo,
  };
}

/** Recarrega PV MTO em todo ciclo que ainda aceita edição. */
export async function syncPvFromCarteiraEmCiclosAbertos() {
  const db = await getDb();
  if (!db) return [];
  const ciclos = await db
    .select({ id: ciclosComerciais.id, status: ciclosComerciais.status })
    .from(ciclosComerciais);
  const resultados: Array<{ cicloId: number; itensCriados: number; pedidosLidos: number }> = [];
  for (const ciclo of ciclos) {
    if (ciclo.status === "FECHADO") continue;
    const synced = await syncPvFromCarteira(ciclo.id);
    resultados.push({
      cicloId: ciclo.id,
      itensCriados: synced.itensCriados,
      pedidosLidos: synced.pedidosLidos,
    });
  }
  return resultados;
}

export type CrmImportRow = {
  sku: string;
  descricao?: string;
  marca?: string;
  card?: string;
  cliente?: string;
  gestor?: string;
  temperatura?: string;
  tipo?: string;
  orcamento?: number;
  /** Layout TI: data de faturamento / competência da linha. */
  dataFaturamento?: string;
  /** Layout TI: quantidade do mês da linha. */
  qtdMes?: number;
  valorVenda?: number;
  modalidade?: string;
  m1?: number;
  m2?: number;
  m3?: number;
  m4?: number;
  m5?: number;
  m6?: number;
  m7?: number;
  m8?: number;
  m9?: number;
  m10?: number;
  m11?: number;
  m12?: number;
};

function normalizeCrmTipo(raw: string): string {
  const t = raw
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  if (t.includes("APOSTA")) return "APOSTA";
  if (t.includes("OPORTUNIDADE")) return "OPORTUNIDADE";
  if (t.includes("COLABORACAO") || t.includes("COLABORA")) return "COLABORACAO";
  return t;
}

function parseCrmCompetencia(raw: string | undefined): Date | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const asNum = Number(s);
  if (Number.isFinite(asNum) && asNum > 20000 && asNum < 80000) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    epoch.setUTCDate(epoch.getUTCDate() + Math.floor(asNum));
    return epoch;
  }
  const iso = s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3] ?? 1));
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function importCrmParaCiclo(cicloId: number, rows: CrmImportRow[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const ciclo = await getCicloComercial(cicloId);
  if (!ciclo) throw new Error("Ciclo não encontrado");

  const { byCode, dimensionsByProductId } = await loadProdutoMaps();
  const dePara = await loadDeParaMap();
  const existentes = await listCicloComercialItens(cicloId, "PV_MTO");
  const pvSkus = new Set(existentes.map(i => i.sku.toUpperCase()));

  const erros: string[] = [];
  const avisos: string[] = [];

  type Agg = {
    sku: string;
    skuRaw: string;
    descricao?: string;
    marca?: string;
    card?: string;
    cliente?: string;
    gestor?: string;
    crmTipo: string;
    crmTemperatura: string;
    orcamento: number;
    valorVenda: number;
    meses: number[];
  };
  const byKey = new Map<string, Agg>();

  for (const row of rows) {
    const skuRaw = (row.sku || "").trim();
    if (!skuRaw) {
      erros.push("Linha sem Produto/SKU");
      continue;
    }
    const sku = resolveCodigoAtual(skuRaw, dePara);
    const crmTipo = normalizeCrmTipo(row.tipo || "");
    const crmTemperatura = (row.temperatura || "")
      .trim()
      .toUpperCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "");
    if (!["COLABORACAO", "APOSTA", "OPORTUNIDADE"].includes(crmTipo)) {
      erros.push(`${skuRaw}: tipo deve ser Colaboração, Aposta ou Oportunidade`);
      continue;
    }
    if (crmTemperatura && !["QUENTE", "MORNO", "FRIO"].includes(crmTemperatura)) {
      erros.push(`${skuRaw}: temperatura deve ser Quente, Morno ou Frio`);
      continue;
    }

    const key = `${sku.toUpperCase()}||${crmTipo}||${crmTemperatura}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        sku,
        skuRaw,
        descricao: row.descricao,
        marca: row.marca,
        card: row.card,
        cliente: row.cliente,
        gestor: row.gestor,
        crmTipo,
        crmTemperatura,
        orcamento: 0,
        valorVenda: 0,
        meses: Array(12).fill(0),
      });
    }
    const agg = byKey.get(key)!;
    agg.orcamento += toNum(row.orcamento);
    if (toNum(row.valorVenda) > 0) agg.valorVenda = toNum(row.valorVenda);
    if (row.marca) agg.marca = row.marca;
    if (row.gestor) agg.gestor = row.gestor;
    if (row.descricao) agg.descricao = row.descricao;
    if (row.card) agg.card = row.card;
    if (row.cliente) agg.cliente = row.cliente;

    let hasMonthCols = false;
    for (let i = 0; i < 12; i++) {
      const q = toNum(row[MES_KEYS[i]]);
      if (q > 0) {
        hasMonthCols = true;
        agg.meses[i] += q;
      }
    }
    if (!hasMonthCols) {
      const qMes = toNum(row.qtdMes);
      const d = parseCrmCompetencia(row.dataFaturamento);
      if (qMes > 0 && d) {
        const idx = mesIndexNoCiclo(
          ciclo.anoInicio,
          ciclo.mesInicio,
          d.getFullYear(),
          d.getMonth() + 1
        );
        if (idx == null) {
          avisos.push(`${skuRaw}: data ${row.dataFaturamento} fora do horizonte do ciclo`);
        } else {
          agg.meses[idx] += qMes;
        }
      } else if (qMes > 0) {
        avisos.push(`${skuRaw}: Qtd Mês sem Data de Faturamento válida`);
      }
    }
  }

  const itens: InsertCicloComercialItem[] = [];
  for (const agg of Array.from(byKey.values())) {
    const prod = byCode.get(agg.sku.toUpperCase()) || byCode.get(agg.skuRaw.toUpperCase());
    if (!prod) {
      erros.push(`SKU não cadastrado: ${agg.skuRaw}`);
      continue;
    }
    const generic =
      /generico|genérico/i.test(agg.sku) ||
      /generico|genérico/i.test(prod.descricao || "");
    if (generic && agg.crmTipo === "COLABORACAO") {
      erros.push(`${agg.sku}: colaboração não pode usar SKU genérico; classifique como Aposta`);
      continue;
    }
    if (generic && agg.crmTipo === "APOSTA" && agg.orcamento <= 0) {
      erros.push(`${agg.sku}: aposta com SKU genérico exige orçamento`);
      continue;
    }
    if (pvSkus.has(agg.sku.toUpperCase())) {
      erros.push(`${agg.sku}: sobreposição com PV_MTO`);
      continue;
    }

    const meses = emptyMeses();
    let total = 0;
    for (let i = 0; i < 12; i++) {
      const q = Math.round(agg.meses[i] * 100) / 100;
      meses[MES_KEYS[i]] = String(q);
      total += q;
    }
    if (total <= 0) {
      erros.push(`${agg.sku}: informe volume (Qtd Mês + Data ou m1–m12)`);
      continue;
    }

    itens.push({
      cicloId,
      planoColab: "CRM",
      sku: agg.sku,
      descricao: agg.descricao || prod.descricao || prod.nome || null,
      marca: agg.marca || prod.marca,
      linha: prod.linha,
      tipoEstoque: (prod.tipoEstoque || "MTS") as "MTS" | "MTO",
      tipoMarcaLinha: `${prod.tipoEstoque || "MTS"}-${prod.marca || "SEM-MARCA"}-${prod.linha || "SEM-LINHA"}`,
      projetar: false,
      qtdeTotalEstatistica: "0",
      ...meses,
      qtdeColaborada: String(Math.round(total * 100) / 100),
      valorVendaSnapshot: String(agg.valorVenda || toNum(prod.valorVenda)),
      familiaSnapshot: dimensionsByProductId.get(prod.id)?.familia ?? null,
      gestorSnapshot:
        agg.gestor?.trim() ||
        dimensionsByProductId.get(prod.id)?.gestor ||
        null,
      crmCard: agg.card?.trim() || null,
      crmTipo: agg.crmTipo,
      crmTemperatura: agg.crmTemperatura,
      crmCliente: agg.cliente?.trim() || null,
      crmOrcamento: String(agg.orcamento),
      origem: "CRM",
    });
  }

  if (!itens.length) {
    return { itensCriados: 0, erros: erros.slice(0, 100), avisos: avisos.slice(0, 50) };
  }

  await db.transaction(async tx => {
    await tx
      .delete(cicloComercialItens)
      .where(
        and(
          eq(cicloComercialItens.cicloId, cicloId),
          eq(cicloComercialItens.planoColab, "CRM"),
          eq(cicloComercialItens.origem, "CRM")
        )
      );
    for (let i = 0; i < itens.length; i += 200) {
      await tx.insert(cicloComercialItens).values(itens.slice(i, i + 200));
    }
  });

  return { itensCriados: itens.length, erros: erros.slice(0, 100), avisos: avisos.slice(0, 50) };
}

export async function getPvVsCrmDetalhado(cicloId: number) {
  const itens = await listCicloComercialItens(cicloId);
  const map = new Map<
    string,
    { sku: string; marca: string | null; mes: number; pv: number; crm: number; delta: number }
  >();

  const bump = (sku: string, marca: string | null, mesIdx: number, side: "pv" | "crm", q: number) => {
    const key = `${sku}||${mesIdx}`;
    if (!map.has(key)) map.set(key, { sku, marca, mes: mesIdx + 1, pv: 0, crm: 0, delta: 0 });
    const row = map.get(key)!;
    row[side] += q;
    row.delta = row.pv - row.crm;
  };

  for (const item of itens.filter(i => i.planoColab === "PV_MTO")) {
    for (let i = 0; i < 12; i++) bump(item.sku, item.marca, i, "pv", toNum(item[MES_KEYS[i]]));
  }
  for (const item of itens.filter(i => i.planoColab === "CRM")) {
    for (let i = 0; i < 12; i++) bump(item.sku, item.marca, i, "crm", toNum(item[MES_KEYS[i]]));
  }

  const rows = Array.from(map.values())
    .filter(r => r.pv > 0 || r.crm > 0)
    .sort((a, b) => a.sku.localeCompare(b.sku) || a.mes - b.mes);

  return {
    rows,
    sobrepostos: rows.filter(r => r.pv > 0 && r.crm > 0).length,
    totalPv: rows.reduce((a, r) => a + r.pv, 0),
    totalCrm: rows.reduce((a, r) => a + r.crm, 0),
  };
}

export async function getResumoRs(cicloId: number) {
  const { byCode, dimensionsByProductId } = await loadProdutoMaps();
  const itens = await listCicloComercialItens(cicloId);
  const byPlano: Record<string, number> = {};
  const byMarca: Record<string, number> = {};
  const linhas: Array<{
    sku: string;
    marca: string | null;
    familia: string | null;
    gestor: string | null;
    planoColab: string;
    qtde: number;
    valorUnit: number;
    valorTotal: number;
  }> = [];
  const skusSemPreco = new Set<string>();

  for (const item of itens) {
    const prod = byCode.get(item.sku.toUpperCase());
    const valorUnit = toNum(item.valorVendaSnapshot ?? prod?.valorVenda);
    if (valorUnit <= 0) skusSemPreco.add(item.sku);
    const qtde = sumItemMonths(item as Record<string, unknown>);
    const valorTotal = qtde * valorUnit;
    byPlano[item.planoColab] = (byPlano[item.planoColab] || 0) + valorTotal;
    const mk = item.marca || "SEM-MARCA";
    byMarca[mk] = (byMarca[mk] || 0) + valorTotal;
    linhas.push({
      sku: item.sku,
      marca: item.marca,
      familia:
        item.familiaSnapshot ??
        (prod ? dimensionsByProductId.get(prod.id)?.familia ?? null : null),
      gestor:
        item.gestorSnapshot ??
        (prod ? dimensionsByProductId.get(prod.id)?.gestor ?? null : null),
      planoColab: item.planoColab,
      qtde,
      valorUnit,
      valorTotal,
    });
  }

  return {
    totalRs: Object.values(byPlano).reduce((a, b) => a + b, 0),
    byPlano,
    byMarca,
    skusSemPreco: Array.from(skusSemPreco).sort(),
    linhas: linhas.sort((a, b) => b.valorTotal - a.valorTotal),
  };
}

export async function getBaseCicloFull(cicloId: number) {
  const ciclo = await getCicloComercial(cicloId);
  const itens = await listCicloComercialItens(cicloId);
  const anoBase = ciclo?.anoInicio ?? new Date().getFullYear();
  const mesBase = ciclo?.mesInicio ?? 1;
  const rows: Array<{
    ano: number;
    mes: number;
    sku: string;
    marca: string | null;
    linha: string | null;
    planoColab: string;
    tipoEstoque: string | null;
    qtd: number;
  }> = [];

  for (const item of itens) {
    for (let i = 0; i < 12; i++) {
      const qMes = toNum(item[MES_KEYS[i]]);
      if (qMes === 0) continue;
      const mesAbs = mesBase + i;
      rows.push({
        ano: anoBase + Math.floor((mesAbs - 1) / 12),
        mes: ((mesAbs - 1) % 12) + 1,
        sku: item.sku,
        marca: item.marca,
        linha: item.linha,
        planoColab: item.planoColab,
        tipoEstoque: item.tipoEstoque,
        qtd: qMes,
      });
    }
  }
  return { ciclo, rows };
}

function normKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

type PrecoGestorCache = {
  at: number;
  precoBySku: Map<string, number>;
  gestorByMarca: Map<string, string>;
};

let precoGestorCache: PrecoGestorCache | null = null;
const PRECO_GESTOR_TTL_MS = 5 * 60 * 1000;

/** Preço unitário (faturamento recente) e gestor mais frequente por marca, quando o cadastro não tem. */
async function loadPrecoEGestorFaturamento(): Promise<PrecoGestorCache> {
  if (precoGestorCache && Date.now() - precoGestorCache.at < PRECO_GESTOR_TTL_MS) {
    return precoGestorCache;
  }
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const dePara = await loadDeParaMap();
  const since = new Date();
  since.setUTCFullYear(since.getUTCFullYear() - 2);
  const sinceIso = since.toISOString().slice(0, 10);

  const [precoResult, gestorResult] = await Promise.all([
    db.execute(sql`
      SELECT TRIM(codMaterial) AS sku, SUM(valorTotal) AS valor, SUM(qtd) AS qtd
      FROM faturamento
      WHERE tipoFaturamento = 'SAIDA'
        AND qtd > 0
        AND valorTotal <> 0
        AND dataEmissao >= ${sinceIso}
        AND codMaterial IS NOT NULL AND TRIM(codMaterial) <> ''
      GROUP BY TRIM(codMaterial)
    `),
    db.execute(sql`
      SELECT TRIM(marca) AS marca, TRIM(gestor) AS gestor, COUNT(*) AS n
      FROM faturamento
      WHERE tipoFaturamento = 'SAIDA'
        AND dataEmissao >= ${sinceIso}
        AND marca IS NOT NULL AND TRIM(marca) <> ''
        AND gestor IS NOT NULL AND TRIM(gestor) <> ''
      GROUP BY TRIM(marca), TRIM(gestor)
    `),
  ]);

  const priceAcc = new Map<string, { valor: number; qtd: number }>();
  for (const row of (precoResult[0] as unknown as Array<{ sku: string; valor: unknown; qtd: unknown }>) ?? []) {
    const sku = resolveCodigoAtual(String(row.sku || ""), dePara).trim().toUpperCase();
    if (!sku) continue;
    const acc = priceAcc.get(sku) ?? { valor: 0, qtd: 0 };
    acc.valor += toNum(row.valor);
    acc.qtd += toNum(row.qtd);
    priceAcc.set(sku, acc);
  }
  const precoBySku = new Map<string, number>();
  for (const [sku, acc] of priceAcc) {
    if (acc.qtd > 0) precoBySku.set(sku, Math.round((acc.valor / acc.qtd) * 10000) / 10000);
  }

  const gestorByMarca = new Map<string, string>();
  const gestorCount = new Map<string, number>();
  for (const row of (gestorResult[0] as unknown as Array<{ marca: string; gestor: string; n: unknown }>) ?? []) {
    const key = normKey(String(row.marca || ""));
    const nome = String(row.gestor || "").trim();
    const n = toNum(row.n);
    if (!key || !nome) continue;
    if (n > (gestorCount.get(key) ?? -1)) {
      gestorCount.set(key, n);
      gestorByMarca.set(key, nome);
    }
  }

  precoGestorCache = { at: Date.now(), precoBySku, gestorByMarca };
  return precoGestorCache;
}

function properName(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("pt-BR")
    .split(/(\s+|-)/)
    .map(part =>
      /^\s+$|^-$/.test(part) ? part : part.charAt(0).toLocaleUpperCase("pt-BR") + part.slice(1)
    )
    .join("");
}

function crmTipoLabel(value: string | null | undefined): string {
  const tipo = String(value || "").trim().toUpperCase();
  if (tipo === "APOSTA") return "Aposta";
  if (tipo === "OPORTUNIDADE") return "Oportunidade";
  return "Colaboração";
}

function tipoComercialDe(tipoNegocio: string | null | undefined): "JIT" | "PRG" | "VAR" | null {
  const tipo = String(tipoNegocio || "").trim().toUpperCase();
  if (tipo === "JIT" || tipo === "PRG" || tipo === "VAR") return tipo;
  return null;
}

export type ConsolidadoArquivoRow = {
  skuMarca: string;
  sku: string;
  descricao: string;
  linha: string;
  marca: string;
  venda: number;
  mes: string;
  qtd: number;
  valorTotal: number;
  relatorio: "MTS" | "MTO PV" | "CRM";
  tipoComercial: string;
  tipo: string;
  tp: string;
  gestor: string;
};

/** Uma linha por SKU × mês, no layout do arquivo Consolidado (modelo padrão). */
export async function getConsolidadoArquivo(cicloId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const ciclo = await getCicloComercial(cicloId);
  if (!ciclo) throw new Error("Ciclo não encontrado");

  const [itens, produtoMaps, marcaRows, relRows, gestorRows, fatLookup] = await Promise.all([
    listCicloComercialItens(cicloId),
    loadProdutoMaps(),
    db.select({ id: marcas.id, nome: marcas.nome }).from(marcas),
    db
      .select({ marcaId: gestorMarca.marcaId, gestorId: gestorMarca.gestorId })
      .from(gestorMarca)
      .where(eq(gestorMarca.ativo, true)),
    db
      .select({ id: gestores.id, nome: gestores.nome })
      .from(gestores)
      .where(eq(gestores.ativo, true)),
    loadPrecoEGestorFaturamento(),
  ]);

  const gestorNome = new Map(gestorRows.map(row => [row.id, row.nome]));
  const gestorByMarcaId = new Map<number, string>();
  for (const rel of relRows) {
    const nome = gestorNome.get(rel.gestorId);
    if (nome) gestorByMarcaId.set(rel.marcaId, nome);
  }
  const gestorByMarcaNome = new Map<string, string>();
  for (const marca of marcaRows) {
    const gestor = gestorByMarcaId.get(marca.id);
    if (gestor && marca.nome) gestorByMarcaNome.set(normKey(marca.nome), gestor);
  }

  const rows: ConsolidadoArquivoRow[] = [];
  for (const item of itens) {
    const sku = (item.sku || "").trim();
    const prod = sku ? produtoMaps.byCode.get(sku.toUpperCase()) : undefined;
    const marca = (item.marca || prod?.marca || "").trim();
    const descricao = (item.descricao || prod?.descricao || prod?.nome || "").trim();
    const linha = (item.linha || prod?.linha || "").trim();
    const relatorio =
      item.planoColab === "PV_MTO" ? "MTO PV" : item.planoColab === "CRM" ? "CRM" : "MTS";
    const tipoCadastro = tipoComercialDe(prod?.tipoNegocio);
    const tp =
      relatorio === "MTS" ? "JIT" : relatorio === "MTO PV" ? "PRG" : tipoCadastro ?? "PRG";
    const tipoComercial = tipoCadastro ?? tp;
    const tipo = relatorio === "CRM" ? crmTipoLabel(item.crmTipo) : "Colaboração";
    const gestorFonte =
      gestorByMarcaNome.get(normKey(marca)) ||
      item.gestorSnapshot ||
      fatLookup.gestorByMarca.get(normKey(marca)) ||
      "";
    const gestor = gestorFonte ? properName(gestorFonte) : "";
    const vendaCadastro = toNum(prod?.valorVenda);
    const vendaInformada = toNum(item.valorVendaSnapshot);
    const venda =
      vendaCadastro > 0
        ? vendaCadastro
        : vendaInformada > 0
          ? vendaInformada
          : fatLookup.precoBySku.get(sku.toUpperCase()) ?? 0;

    for (let i = 0; i < 12; i++) {
      const qtd = monthEffectiveQty(item as Record<string, unknown>, i);
      if (!qtd) continue;
      const mesAbs = ciclo.mesInicio + i;
      const ano = ciclo.anoInicio + Math.floor((mesAbs - 1) / 12);
      const mes = ((mesAbs - 1) % 12) + 1;
      rows.push({
        skuMarca: marca ? `${sku}-${marca}` : sku,
        sku,
        descricao,
        linha,
        marca,
        venda,
        mes: `${ano}-${String(mes).padStart(2, "0")}-01`,
        qtd,
        valorTotal: Math.round(qtd * venda * 100) / 100,
        relatorio,
        tipoComercial,
        tipo,
        tp,
        gestor,
      });
    }
  }

  rows.sort(
    (a, b) => a.sku.localeCompare(b.sku) || a.mes.localeCompare(b.mes) || a.relatorio.localeCompare(b.relatorio)
  );
  return { ciclo, rows };
}

export async function getResumoProd(cicloId: number) {
  const ciclo = await getCicloComercial(cicloId);
  if (!ciclo) throw new Error("Ciclo não encontrado");
  const itens = await listCicloComercialItens(cicloId);
  const grouped = new Map<
    string,
    {
      ano: number;
      mes: number;
      tipoEstoque: string;
      marca: string;
      linha: string;
      planoColab: string;
      qtd: number;
    }
  >();

  for (const item of itens) {
    for (let index = 0; index < 12; index++) {
      const qtd = toNum(item[MES_KEYS[index]]);
      if (qtd === 0) continue;
      const monthAbsolute = ciclo.mesInicio - 1 + index;
      const ano = ciclo.anoInicio + Math.floor(monthAbsolute / 12);
      const mes = (monthAbsolute % 12) + 1;
      const tipoEstoque = item.tipoEstoque || "MTS";
      const marca = item.marca || "SEM-MARCA";
      const linha = item.linha || "SEM-LINHA";
      const key = [ano, mes, tipoEstoque, marca, linha, item.planoColab].join("||");
      const row = grouped.get(key) ?? {
        ano,
        mes,
        tipoEstoque,
        marca,
        linha,
        planoColab: item.planoColab,
        qtd: 0,
      };
      row.qtd += qtd;
      grouped.set(key, row);
    }
  }

  return {
    ciclo,
    rows: Array.from(grouped.values()).sort(
      (a, b) =>
        a.ano - b.ano ||
        a.mes - b.mes ||
        a.tipoEstoque.localeCompare(b.tipoEstoque) ||
        a.marca.localeCompare(b.marca) ||
        a.linha.localeCompare(b.linha)
    ),
  };
}

export async function getMtoVariacao(cicloId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const ciclo = await getCicloComercial(cicloId);
  if (!ciclo) throw new Error("Ciclo não encontrado");

  const now = new Date();
  const lastClosed = new Date(now.getFullYear(), now.getMonth(), 0);
  const beforeCycle = new Date(ciclo.anoInicio, ciclo.mesInicio - 1, 0);
  const referenceMonthEnd =
    beforeCycle.getTime() < lastClosed.getTime() ? beforeCycle : lastClosed;
  const referenceEnd = new Date(
    referenceMonthEnd.getFullYear(),
    referenceMonthEnd.getMonth() + 1,
    0,
    23,
    59,
    59
  );
  const anoAtual = referenceEnd.getFullYear();
  const anoAA = anoAtual - 1;
  const mesFim = referenceEnd.getMonth() + 1;
  const dePara = await loadDeParaMap();
  const itens = await listCicloComercialItens(cicloId);
  const skusCiclo = new Set(itens.map(i => i.sku.toUpperCase()));

  const fatAA = await db
    .select({
      codMaterial: faturamento.codMaterial,
      qtd: faturamento.qtd,
      marca: faturamento.marca,
    })
    .from(faturamento)
    .where(
      and(
        eq(faturamento.tipoFaturamento, "SAIDA"),
        eq(faturamento.tipoEstoque, "MTO"),
        gte(faturamento.dataEmissao, new Date(`${anoAA}-01-01`)),
        lte(
          faturamento.dataEmissao,
          new Date(anoAA, mesFim, 0, 23, 59, 59)
        )
      )
    );

  const fatYtd = await db
    .select({ codMaterial: faturamento.codMaterial })
    .from(faturamento)
    .where(
      and(
        eq(faturamento.tipoFaturamento, "SAIDA"),
        eq(faturamento.tipoEstoque, "MTO"),
        gte(faturamento.dataEmissao, new Date(`${anoAtual}-01-01`)),
        lte(faturamento.dataEmissao, referenceEnd)
      )
    );

  const skusYtd = new Set(
    fatYtd.map(r => resolveCodigoAtual((r.codMaterial || "").trim(), dePara).toUpperCase()).filter(Boolean)
  );

  const aaBySku = new Map<string, { sku: string; marca: string | null; qtdAA: number }>();
  for (const row of fatAA) {
    const sku = resolveCodigoAtual((row.codMaterial || "").trim(), dePara);
    if (!sku) continue;
    const key = sku.toUpperCase();
    if (!aaBySku.has(key)) aaBySku.set(key, { sku, marca: row.marca, qtdAA: 0 });
    aaBySku.get(key)!.qtdAA += toNum(row.qtd);
  }

  const faltantes = Array.from(aaBySku.values())
    .filter(r => !skusYtd.has(r.sku.toUpperCase()) && !skusCiclo.has(r.sku.toUpperCase()))
    .sort((a, b) => b.qtdAA - a.qtdAA);

  return { anoAA, anoAtual, mesFim, faltantes, totalSkus: faltantes.length };
}

export async function getRelatorioRfs(cicloId: number) {
  const ciclo = await getCicloComercial(cicloId);
  const itens = await listCicloComercialItens(cicloId);
  const rows = itens.map(item => {
    const meses: Record<string, number> = {};
    let total = 0;
    for (let i = 0; i < 12; i++) {
      const q = toNum(item[MES_KEYS[i]]);
      meses[`m${i + 1}`] = q;
      total += q;
    }
    return {
      sku: item.sku,
      descricao: item.descricao,
      marca: item.marca,
      linha: item.linha,
      planoColab: item.planoColab,
      tipoEstoque: item.tipoEstoque,
      projetar: item.projetar,
      ...meses,
      total,
      estatistica12m: toNum(item.qtdeTotalEstatistica),
    };
  });
  return { ciclo, rows };
}

export async function getAaPrevReal(cicloId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const ciclo = await getCicloComercial(cicloId);
  if (!ciclo) throw new Error("Ciclo não encontrado");

  const itens = await listCicloComercialItens(cicloId);
  const dePara = await loadDeParaMap();
  const anoAA = ciclo.anoInicio - 1;
  const inicio = new Date(ciclo.anoInicio, ciclo.mesInicio - 1, 1);
  const fim = new Date(ciclo.anoInicio, ciclo.mesInicio - 1 + 12, 0);

  const fatRows = await db
    .select({
      codMaterial: faturamento.codMaterial,
      dataEmissao: faturamento.dataEmissao,
      qtd: faturamento.qtd,
      tipoFaturamento: faturamento.tipoFaturamento,
    })
    .from(faturamento);

  const aaBySku = new Map<string, number>();
  const realBySku = new Map<string, number>();
  const dAAStart = new Date(inicio);
  dAAStart.setFullYear(dAAStart.getFullYear() - 1);
  const dAAEnd = new Date(fim);
  dAAEnd.setFullYear(dAAEnd.getFullYear() - 1);

  for (const row of fatRows) {
    const sku = resolveCodigoAtual((row.codMaterial || "").trim(), dePara).toUpperCase();
    if (!sku) continue;
    const d = new Date(String(row.dataEmissao));
    if (Number.isNaN(d.getTime())) continue;
    const sign = row.tipoFaturamento === "DEVOLUCAO" ? -1 : 1;
    const q = toNum(row.qtd) * sign;
    if (d >= dAAStart && d <= dAAEnd) aaBySku.set(sku, (aaBySku.get(sku) || 0) + q);
    if (d >= inicio && d <= fim) realBySku.set(sku, (realBySku.get(sku) || 0) + q);
  }

  const rows = itens
    .filter(i => i.planoColab === "MTS" || i.planoColab === "JITO")
    .map(item => {
      const key = item.sku.toUpperCase();
      const colab = sumItemMonths(item as Record<string, unknown>);
      const prev = toNum(item.qtdeTotalEstatistica);
      const aa = aaBySku.get(key) || 0;
      const real = realBySku.get(key) || 0;
      return {
        sku: item.sku,
        marca: item.marca,
        planoColab: item.planoColab,
        aa,
        prev,
        real,
        colab,
        varAaColab: aa === 0 ? null : (colab - aa) / aa,
        varPrevReal: prev === 0 ? null : (real - prev) / prev,
      };
    });

  return { anoAA, rows };
}

export async function getSazonalidadeInvalidas() {
  const db = await getDb();
  if (!db) return [];
  const result = await db.execute(sql`
    SELECT marcaNome, SUM(percentual) as soma
    FROM sazonalidade_marca
    GROUP BY marcaNome
    HAVING ABS(SUM(percentual) - 1) > 0.02
  `);
  const rows = (result[0] as unknown) as Array<{ marcaNome: string; soma: string }>;
  return (rows || []).map(r => ({ marcaNome: r.marcaNome, soma: toNum(r.soma) }));
}

/** Realizado mensal por SKU (faturamento) para anos calendário — grade MTS. */
export async function getRealizadoAnualPorSku(anos: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const years = anos.filter(y => Number.isFinite(y));
  if (!years.length) return {} as Record<string, Record<number, number[]>>;

  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);
  const result = await db.execute(sql`
    SELECT
      UPPER(TRIM(codMaterial)) AS sku,
      YEAR(dataEmissao) AS ano,
      MONTH(dataEmissao) AS mes,
      SUM(
        CASE
          WHEN tipoFaturamento = 'DEVOLUCAO' THEN -COALESCE(qtd, 0)
          ELSE COALESCE(qtd, 0)
        END
      ) AS qtde
    FROM faturamento
    WHERE dataEmissao >= ${`${minYear}-01-01`}
      AND dataEmissao < ${`${maxYear + 1}-01-01`}
      AND codMaterial IS NOT NULL
      AND TRIM(codMaterial) <> ''
    GROUP BY UPPER(TRIM(codMaterial)), YEAR(dataEmissao), MONTH(dataEmissao)
  `);
  const rows = (result[0] as unknown) as Array<{
    sku: string;
    ano: number;
    mes: number;
    qtde: string | number;
  }>;

  const dePara = await loadDeParaMap();
  const out: Record<string, Record<number, number[]>> = {};

  for (const row of rows) {
    const sku = resolveCodigoAtual((row.sku || "").trim(), dePara).toUpperCase();
    if (!sku) continue;
    const y = Number(row.ano);
    const m = Number(row.mes);
    if (!years.includes(y) || m < 1 || m > 12) continue;
    if (!out[sku]) out[sku] = {};
    if (!out[sku][y]) out[sku][y] = Array(12).fill(0);
    out[sku][y][m - 1] += toNum(row.qtde);
  }
  return out;
}

export type CarteiraSkuRow = {
  codigo: string;
  sequencia?: number;
  competencia: string;
  sku: string;
  quantidade: string | number;
  receitaBruta?: string | number;
  faturado?: boolean;
};

/** Importa PV Aberto (Excel) resolvendo SKU → produtoId. */
export async function importCarteiraBySku(rows: CarteiraSkuRow[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { byCode } = await loadProdutoMaps();
  const dePara = await loadDeParaMap();

  const toInsert: Array<{
    codigo: string;
    sequencia: number;
    competencia: Date;
    quantidade: string;
    receitaBruta: string;
    produtoId: number;
    faturado: boolean;
  }> = [];
  const erros: string[] = [];
  const avisos: string[] = [];

  for (const row of rows) {
    const skuRaw = String(row.sku ?? "").trim();
    if (!skuRaw) {
      erros.push("Linha sem SKU");
      continue;
    }
    const resolved = resolveCodigoAtual(skuRaw, dePara) || skuRaw;
    const prod =
      byCode.get(resolved.toUpperCase()) || byCode.get(skuRaw.toUpperCase());
    if (!prod) {
      erros.push(`SKU não cadastrado: ${skuRaw}`);
      continue;
    }
    const competencia = parseCompetencia(row.competencia);
    if (!competencia) {
      erros.push(`Competência inválida (${skuRaw}): ${row.competencia}`);
      continue;
    }
    const qtd = toNum(row.quantidade);
    const receita = toNum(row.receitaBruta);
    if (qtd <= 0) {
      avisos.push(`Qtd zero ignorada: ${skuRaw}`);
      continue;
    }
    toInsert.push({
      codigo: String(row.codigo || skuRaw).trim() || skuRaw,
      sequencia: Number(row.sequencia) > 0 ? Number(row.sequencia) : 1,
      competencia,
      quantidade: String(qtd),
      receitaBruta: String(receita),
      produtoId: prod.id,
      faturado: Boolean(row.faturado),
    });
  }

  for (const row of toInsert) {
    await db
      .insert(carteiraPedidos)
      .values(row)
      .onDuplicateKeyUpdate({
        set: {
          competencia: row.competencia,
          quantidade: row.quantidade,
          receitaBruta: row.receitaBruta,
          produtoId: row.produtoId,
          faturado: row.faturado,
        },
      });
  }

  return {
    importados: toInsert.length,
    erros: erros.slice(0, 50),
    avisos: avisos.slice(0, 50),
  };
}

function parseCompetencia(raw: string): Date | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  // Excel serial
  const asNum = Number(s);
  if (Number.isFinite(asNum) && asNum > 20000 && asNum < 80000) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    epoch.setUTCDate(epoch.getUTCDate() + Math.floor(asNum));
    return epoch;
  }
  // YYYY-MM-DD or YYYY-MM or DD/MM/YYYY
  const iso = s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/);
  if (iso) {
    return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3] ?? 1));
  }
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) {
    return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
