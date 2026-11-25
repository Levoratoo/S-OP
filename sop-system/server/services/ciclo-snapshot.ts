import { createHash } from "crypto";
import { desc, eq } from "drizzle-orm";
import { getDb, listCicloComercialItens, listDeParaCodigos } from "../db";
import {
  cicloSnapshot,
  cicloSnapshotLinhas,
  ciclosComerciais,
  produtos,
} from "../../drizzle/schema";
import { isCicloSomenteLeitura, type CicloStatus } from "@shared/ciclo-status";

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

  const pv = itens.filter(i => i.planoColab === "PV_MTO");
  const totais = {
    itens: itens.length,
    pvLinhas: pv.length,
    qtde: itens.reduce((s, i) => s + Number(i.qtdeColaborada || 0), 0),
  };

  const body = JSON.stringify({ itens, dePara, precos, totais, pv });
  const hash = sha256(body);
  const versao = (existing?.versao ?? 0) + 1;

  const inserted = await db.insert(cicloSnapshot).values({
    cicloId: input.cicloId,
    versao,
    hash,
    retroativo: Boolean(input.retroativo),
    createdBy: input.createdBy ?? null,
    comentario: input.comentario ?? null,
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
      comentario: "Snapshot retroativo gerado a partir dos dados gravados no ciclo (migração de status).",
      createdBy: "sistema",
    });
    criados += 1;
  }
  return { criados };
}

export async function compararCiclos(cicloA: number, cicloB: number) {
  const [a, b] = await Promise.all([getLatestSnapshot(cicloA), getLatestSnapshot(cicloB)]);
  if (!a || !b) {
    throw new Error("Os dois ciclos precisam ter snapshot aprovado para comparar.");
  }
  const parse = (snap: NonNullable<typeof a>, tipo: string) => {
    const row = snap.linhas.find(l => l.tipo === tipo);
    return row ? JSON.parse(row.payloadJson) : null;
  };
  return {
    cicloA: { id: cicloA, versao: a.versao, hash: a.hash, retroativo: a.retroativo, totais: parse(a, "totais") },
    cicloB: { id: cicloB, versao: b.versao, hash: b.hash, retroativo: b.retroativo, totais: parse(b, "totais") },
  };
}

export function assertStatusCongelavel(status: string): asserts status is CicloStatus {
  if (status !== "APROVADO" && status !== "CONGELADO" && status !== "CONSENSO" && status !== "EM_COLABORACAO" && status !== "ABERTO") {
    throw new Error(`Status desconhecido: ${status}`);
  }
}
