/**
 * Passo 3 — desagrega Previsão Final Sugerida (Tipo-Marca-Linha / total 12M)
 * em grade SKU × mês usando sazonalidade da marca e rateio (6M preferencial, senão 12M).
 */
import { and, eq } from "drizzle-orm";
import XLSX from "xlsx";
import { getDb } from "../db";
import {
  cicloComercialItens,
  ciclosComerciais,
  faturamento,
  marcas,
  produtos,
  sazonalidadeMarca,
  type InsertCicloComercialItem,
} from "../../drizzle/schema";
import * as previsaoPython from "../previsaoPython";

const MES_KEYS = ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9", "m10", "m11", "m12"] as const;

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

async function computeRateiosPorSku() {
  const db = await getDb();
  if (!db) return new Map<string, { rateio12: number; rateio6: number; tipoMarcaLinha: string; sku: string; descricao: string | null; marca: string | null; linha: string | null; tipoEstoque: "MTS" | "MTO"; projetar: boolean }>();

  const fat = await db
    .select({
      codMaterial: faturamento.codMaterial,
      marca: faturamento.marca,
      linha: faturamento.linhaProduto,
      tipoEstoque: faturamento.tipoEstoque,
      qtd: faturamento.qtd,
      dataEmissao: faturamento.dataEmissao,
    })
    .from(faturamento)
    .where(eq(faturamento.tipoFaturamento, "SAIDA"));

  const produtosRows = await db.select().from(produtos);
  const byCode = new Map<string, (typeof produtosRows)[number]>();
  for (const p of produtosRows) {
    if (p.codItem) byCode.set(p.codItem, p);
    if (p.codigo) byCode.set(p.codigo, p);
  }

  type Agg = {
    sku: string;
    descricao: string | null;
    marca: string | null;
    linha: string | null;
    tipoEstoque: "MTS" | "MTO";
    tipoMarcaLinha: string;
    projetar: boolean;
    q12: number;
    q6: number;
  };

  const now = new Date();
  const cutoff6 = new Date(now.getFullYear(), now.getMonth() - 6, 1);
  const cutoff12 = new Date(now.getFullYear(), now.getMonth() - 12, 1);

  const bySku = new Map<string, Agg>();
  const groupTotals12 = new Map<string, number>();
  const groupTotals6 = new Map<string, number>();

  for (const row of fat) {
    const sku = (row.codMaterial || "").trim();
    if (!sku) continue;
    const prod = byCode.get(sku);
    const tipo = (row.tipoEstoque || prod?.tipoEstoque || "MTS") as "MTS" | "MTO";
    const marca = row.marca || prod?.marca || "SEM-MARCA";
    const linha = row.linha || prod?.linha || "SEM-LINHA";
    const tml = buildCodificacao(tipo, marca, linha);
    const d = new Date(String(row.dataEmissao));
    if (Number.isNaN(d.getTime())) continue;
    const q = toNumber(row.qtd);

    if (!bySku.has(sku)) {
      bySku.set(sku, {
        sku,
        descricao: prod?.descricao || prod?.nome || null,
        marca,
        linha,
        tipoEstoque: tipo,
        tipoMarcaLinha: tml,
        projetar: prod?.projetarEstatistica !== false,
        q12: 0,
        q6: 0,
      });
    }
    const agg = bySku.get(sku)!;
    if (d >= cutoff12) {
      agg.q12 += q;
      groupTotals12.set(tml, (groupTotals12.get(tml) || 0) + q);
    }
    if (d >= cutoff6) {
      agg.q6 += q;
      groupTotals6.set(tml, (groupTotals6.get(tml) || 0) + q);
    }
  }

  const result = new Map<
    string,
    {
      rateio12: number;
      rateio6: number;
      tipoMarcaLinha: string;
      sku: string;
      descricao: string | null;
      marca: string | null;
      linha: string | null;
      tipoEstoque: "MTS" | "MTO";
      projetar: boolean;
    }
  >();

  Array.from(bySku.entries()).forEach(([sku, agg]) => {
    const t12 = groupTotals12.get(agg.tipoMarcaLinha) || 0;
    const t6 = groupTotals6.get(agg.tipoMarcaLinha) || 0;
    const rateio12 = t12 > 0 ? agg.q12 / t12 : 0;
    const rateio6 = t6 > 0 ? agg.q6 / t6 : rateio12;
    result.set(sku, {
      rateio12,
      rateio6,
      tipoMarcaLinha: agg.tipoMarcaLinha,
      sku,
      descricao: agg.descricao,
      marca: agg.marca,
      linha: agg.linha,
      tipoEstoque: agg.tipoEstoque,
      projetar: agg.projetar,
    });
  });

  return result;
}

function resolvePlanoColab(tipoEstoque: "MTS" | "MTO", tipoNegocioHint?: string | null): "MTS" | "JITO" | "PV_MTO" {
  if (tipoEstoque === "MTO") return "PV_MTO";
  const hint = (tipoNegocioHint || "").toUpperCase();
  if (hint.includes("JIT")) return "JITO";
  return "MTS";
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
  const totalColName = pickColumn(columns, [
    "Previsao Final Sugerida",
    "Previsão Final Sugerida",
    "Valor Melhor Opcao",
    "Valor Melhor Opção",
    "Qtde Total",
  ]);

  if (!codigoColName || !totalColName) {
    throw new Error(
      "Não foi possível localizar Codigo / Previsão Final Sugerida na aba Visao_Executiva."
    );
  }

  const codigoIdx = columns.indexOf(codigoColName);
  const totalIdx = columns.indexOf(totalColName);

  const totaisPorGrupo = new Map<string, number>();
  for (const row of allRows) {
    const codigo = String(row[codigoIdx] ?? "").trim();
    if (!codigo) continue;
    totaisPorGrupo.set(codigo, toNumber(row[totalIdx]));
  }

  if (totaisPorGrupo.size === 0) {
    throw new Error("Visao_Executiva sem linhas utilizáveis para desagregação.");
  }

  const sazonalidade = await loadSazonalidadeMap();
  const rateios = await computeRateiosPorSku();

  type SkuRateio = NonNullable<ReturnType<typeof rateios.get>>;
  const skusPorGrupo = new Map<string, SkuRateio[]>();
  Array.from(rateios.values()).forEach(info => {
    const list = skusPorGrupo.get(info.tipoMarcaLinha) ?? [];
    list.push(info);
    skusPorGrupo.set(info.tipoMarcaLinha, list);
  });

  const now = new Date();
  const anoInicio = input.anoInicio ?? now.getFullYear();
  const mesInicio = input.mesInicio ?? ((now.getMonth() + 1) % 12) + 1; // próximo mês
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
    observacoes: `Desagregado de job Python #${input.jobId}. Itens executivos: ${analytics.summary?.skuCount ?? totaisPorGrupo.size}.`,
  });
  const cicloId = insertResult[0].insertId;
  const itens: InsertCicloComercialItem[] = [];

  for (const [grupo, total12m] of Array.from(totaisPorGrupo.entries())) {
    const skus = skusPorGrupo.get(grupo) || [];
    // Se não há SKUs no faturamento para o grupo, cria linha sintética no próprio grupo
    const lista =
      skus.length > 0
        ? skus
        : [
            {
              rateio12: 1,
              rateio6: 1,
              tipoMarcaLinha: grupo,
              sku: grupo,
              descricao: grupo,
              marca: grupo.split("-")[1] || null,
              linha: grupo.split("-").slice(2).join("-") || null,
              tipoEstoque: (grupo.startsWith("MTO") ? "MTO" : "MTS") as "MTS" | "MTO",
              projetar: true,
            },
          ];

    // Renormaliza rateio a considerar entre SKUs que projetam
    const projetaveis = lista.filter((s) => s.projetar);
    const base = projetaveis.length > 0 ? projetaveis : lista;
    const prefer6 = base.some((s) => s.rateio6 > 0);
    let pesos = base.map((s) => (prefer6 && s.rateio6 > 0 ? s.rateio6 : s.rateio12));
    let somaPesos = pesos.reduce((a, b) => a + b, 0);
    if (somaPesos <= 0) {
      pesos = base.map(() => 1);
      somaPesos = pesos.length;
    }

    base.forEach((skuInfo, idx) => {
      const rateio = pesos[idx] / somaPesos;
      const marcaKey = (skuInfo.marca || "").toLowerCase();
      const saz = sazonalidade.get(marcaKey) || defaultSazonalidade();
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
      for (let i = 0; i < 12; i++) {
        const q = skuInfo.projetar ? total12m * saz[i] * rateio : 0;
        const rounded = Math.round(q * 100) / 100;
        meses[MES_KEYS[i]] = String(rounded);
        totalSku += rounded;
      }

      itens.push({
        cicloId,
        planoColab: resolvePlanoColab(skuInfo.tipoEstoque),
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
        qtdeTotalEstatistica: String(Math.round(total12m * 100) / 100),
        ...meses,
        qtdeColaborada: String(Math.round(totalSku * 100) / 100),
        origem: "ESTATISTICA",
      });
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
