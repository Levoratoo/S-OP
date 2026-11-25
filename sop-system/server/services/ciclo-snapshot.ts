import { createHash } from "crypto";
import { desc, eq } from "drizzle-orm";
import { getDb, listCicloComercialItens, listDeParaCodigos } from "../db";
import { isCicloSomenteLeitura, type CicloStatus } from "@shared/ciclo-status";
import {
  cicloSnapshot,
  cicloSnapshotLinhas,
  cicloStatusHistorico,
  ciclosComerciais,
  produtos,
} from "../../drizzle/schema";
import { listCarteiraPvEntregas } from "./carteira-pv-entregas";
import { getConsolidadoArquivo } from "./ciclo-colab-extras";

function sha256(payload: string) {
  return createHash("sha256").update(payload).digest("hex");
}

export async function getLatestSnapshot(cicloId: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(cicloSnapshot)
    .where(eq(cicloSnapshot.cicloId, cicloId))
    .orderBy(desc(cicloSnapshot.versao))
    .limit(1);
  if (!row) return null;
  const linhas = await db
    .select()
    .from(cicloSnapshotLinhas)
    .where(eq(cicloSnapshotLinhas.snapshotId, row.id));
  return { ...row, linhas };
}

export async function captureCicloSnapshot(input: {
  cicloId: number;
  createdBy?: string | null;
  comentario?: string | null;
  retroativo?: boolean;
}) {
  const existing = await getLatestSnapshot(input.cicloId);
  if (existing && !input.retroativo) {
    return existing;
  }
  if (existing && input.retroativo) return existing;

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const itens = await listCicloComercialItens(input.cicloId);
  const dePara = await listDeParaCodigos();
  const precos = await db
    .select({
      codItem: produtos.codItem,
      precoUnitario: produtos.precoUnitario,
      precoOrigem: produtos.precoOrigem,
      valorVenda: produtos.valorVenda,
    })
    .from(produtos);

  const entregas = await listCarteiraPvEntregas();
  const carteira = entregas.map(e => ({
    pedido: e.codigo,
    sku: e.sku,
    ano: e.anoEnt,
    mes: e.mesEnt,
    quantidade: e.quantidade,
    precoUnitario: e.precoUnitario,
    receitaBruta: e.receitaBruta,
  }));
  let consolidado: unknown = [];
  try {
    const arq = await getConsolidadoArquivo(input.cicloId);
    consolidado = arq.rows;
  } catch (err) {
    console.warn("[snapshot] consolidado:", err);
  }

  const pv = itens.filter(i => i.planoColab === "PV_MTO");
  const totais = {
    itens: itens.length,
    pvLinhas: pv.length,
    qtde: itens.reduce((s, i) => s + Number(i.qtdeColaborada || 0), 0),
  };

  const body = JSON.stringify({ itens, dePara, precos, totais, pv, carteira, consolidado });
  const hash = sha256(body);
  const versao = (existing?.versao ?? 0) + 1;

  const inserted = await db.insert(cicloSnapshot).values({
    cicloId: input.cicloId,
    versao,
    hash,
    retroativo: Boolean(input.retroativo),
    createdBy: input.createdBy ?? null,
      comentario:
        input.comentario ||
        (input.retroativo
          ? "retroativo, De-Para e preços da data de geração"
          : "Snapshot da aprovação"),
  });
  const snapshotId = Number(inserted[0].insertId);

  const chunks: Array<{ tipo: string; payloadJson: string }> = [
    { tipo: "totais", payloadJson: JSON.stringify(totais) },
  ];
  const pushChunks = (tipo: string, rows: unknown[]) => {
    for (let i = 0; i < rows.length; i += 200) {
      chunks.push({ tipo, payloadJson: JSON.stringify(rows.slice(i, i + 200)) });
    }
  };
  pushChunks("pv_mto", pv);
  pushChunks("itens", itens);
  pushChunks("de_para", dePara);
  pushChunks("precos", precos);
  pushChunks("carteira", carteira);
  pushChunks("consolidado", consolidado as unknown[]);
  if (chunks.length) {
    await db.insert(cicloSnapshotLinhas).values(chunks.map(c => ({ snapshotId, ...c })));
  }
  return getLatestSnapshot(input.cicloId);
}

/** Gera foto retroativa só para ciclos já CONGELADO/APROVADO sem snapshot. Não mexe no ciclo 13 em colaboração. */
export async function materializarSnapshotsRetroativos() {
  const db = await getDb();
  if (!db) return { criados: 0 };
  const ciclos = await db.select().from(ciclosComerciais);
  let criados = 0;
  for (const ciclo of ciclos) {
    if (!isCicloSomenteLeitura(ciclo.status)) continue;
    const snap = await getLatestSnapshot(ciclo.id);
    if (snap) continue;
    await captureCicloSnapshot({
      cicloId: ciclo.id,
      retroativo: true,
      comentario: "retroativo, De-Para e preços da data de geração",
      createdBy: "migracao",
    });
    criados += 1;
  }
  return { criados };
}

function juntarTipo(snap: { linhas: Array<{ tipo: string; payloadJson: string }> }, tipo: string) {
  return snap.linhas
    .filter(l => l.tipo === tipo)
    .flatMap(l => {
      try {
        const parsed = JSON.parse(l.payloadJson);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    });
}

export async function compararCiclos(cicloA: number, cicloB: number) {
  const [a, b] = await Promise.all([getLatestSnapshot(cicloA), getLatestSnapshot(cicloB)]);
  if (!a || !b) {
    throw new Error("Os dois ciclos precisam ter snapshot aprovado para comparar.");
  }
  const buckets = (snap: NonNullable<typeof a>) => {
    const map = new Map<string, { sku: string; marca: string; mes: number; qtd: number }>();
    for (const item of juntarTipo(snap, "itens") as Array<Record<string, unknown>>) {
      const sku = String(item.sku || "");
      const marca = String(item.marca || "");
      for (let mes = 1; mes <= 12; mes++) {
        const qtd = Number(item[`m${mes}`] || 0);
        if (!qtd) continue;
        const key = `${sku}|${marca}|${mes}`;
        const prev = map.get(key) ?? { sku, marca, mes, qtd: 0 };
        prev.qtd += qtd;
        map.set(key, prev);
      }
    }
    return map;
  };
  const ba = buckets(a);
  const bb = buckets(b);
  const keys = new Set([...ba.keys(), ...bb.keys()]);
  const porSkuMes = [...keys].map(key => {
    const left = ba.get(key);
    const right = bb.get(key);
    const sample = left || right!;
    return {
      sku: sample.sku,
      marca: sample.marca,
      mes: sample.mes,
      qtdA: left?.qtd ?? 0,
      qtdB: right?.qtd ?? 0,
      delta: (left?.qtd ?? 0) - (right?.qtd ?? 0),
    };
  });
  const marcaMap = new Map<string, { marca: string; mes: number; qtdA: number; qtdB: number }>();
  for (const row of porSkuMes) {
    const k = `${row.marca}|${row.mes}`;
    const acc = marcaMap.get(k) ?? { marca: row.marca, mes: row.mes, qtdA: 0, qtdB: 0 };
    acc.qtdA += row.qtdA;
    acc.qtdB += row.qtdB;
    marcaMap.set(k, acc);
  }
  return {
    cicloA: { id: cicloA, versao: a.versao, hash: a.hash, retroativo: a.retroativo, aviso: a.retroativo ? a.comentario : null },
    cicloB: { id: cicloB, versao: b.versao, hash: b.hash, retroativo: b.retroativo, aviso: b.retroativo ? b.comentario : null },
    porSkuMes: porSkuMes.filter(r => r.delta !== 0).slice(0, 500),
    porMarcaMes: [...marcaMap.values()].map(r => ({ ...r, delta: r.qtdA - r.qtdB })),
  };
}

/** Histórico sintético + foto retroativa. Idempotente. Chamado no boot, não no GET. */
export async function aplicarMigracaoCicloNoBoot() {
  const db = await getDb();
  if (!db) return { historicos: 0, snapshots: 0 };
  const ciclos = await db.select().from(ciclosComerciais);
  let historicos = 0;
  for (const ciclo of ciclos) {
    const hist = await db
      .select({ id: cicloStatusHistorico.id })
      .from(cicloStatusHistorico)
      .where(eq(cicloStatusHistorico.cicloId, ciclo.id))
      .limit(1);
    if (hist.length) continue;
    if (ciclo.status === "CONGELADO") {
      await db.insert(cicloStatusHistorico).values([
        {
          cicloId: ciclo.id,
          statusDe: "FECHADO",
          statusPara: "APROVADO",
          usuario: "migracao",
          comentario: "migração sintética",
        },
        {
          cicloId: ciclo.id,
          statusDe: "APROVADO",
          statusPara: "CONGELADO",
          usuario: "migracao",
          comentario: "migração sintética",
        },
      ]);
      historicos += 2;
    } else if (ciclo.status === "CONSENSO") {
      await db.insert(cicloStatusHistorico).values({
        cicloId: ciclo.id,
        statusDe: "CONSOLIDADO",
        statusPara: "CONSENSO",
        usuario: "migracao",
        comentario: "migração sintética",
      });
      historicos += 1;
    }
  }
  const snaps = await materializarSnapshotsRetroativos();
  return { historicos, snapshots: snaps.criados };
}

export function assertStatusCongelavel(status: string): asserts status is CicloStatus {
  if (status !== "APROVADO" && status !== "CONGELADO" && status !== "CONSENSO" && status !== "EM_COLABORACAO" && status !== "ABERTO") {
    throw new Error(`Status desconhecido: ${status}`);
  }
}
