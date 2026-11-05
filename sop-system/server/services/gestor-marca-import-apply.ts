import { eq } from "drizzle-orm";
import * as db from "../db";
import { gestorMarcaImportMap } from "../../drizzle/schema";
import {
  type GestorMarcaImportRow,
  normalizeMarcaKey,
  planGestorMarcaImportMerge,
} from "./gestor-marca-import";

export type GestorMarcaImportResult = {
  stats: ReturnType<typeof planGestorMarcaImportMerge>["stats"];
  unknownGestores: string[];
};

async function loadMergeContext() {
  const [marcas, gestores, links] = await Promise.all([
    db.listMarcas(),
    db.listGestores(),
    db.listGestorMarca(),
  ]);
  return {
    marcas: marcas.map(m => ({ id: m.id, nome: m.nome })),
    gestores: gestores.map(g => ({ id: g.id, nome: g.nome })),
    links: links.map(l => ({ id: l.id, marcaId: l.marcaId, gestorId: l.gestorId })),
  };
}

export async function upsertGestorMarcaImportMap(marcaNome: string, gestorNome: string) {
  const conn = await db.getDb();
  if (!conn) return;
  const marcaKey = normalizeMarcaKey(marcaNome);
  await conn
    .insert(gestorMarcaImportMap)
    .values({
      marcaKey,
      marcaNome: marcaNome.trim(),
      gestorNome: gestorNome.trim(),
    })
    .onDuplicateKeyUpdate({
      set: {
        marcaNome: marcaNome.trim(),
        gestorNome: gestorNome.trim(),
      },
    });
}

export async function getGestorNomeFromImportMap(marcaNome: string): Promise<string | null> {
  const conn = await db.getDb();
  if (!conn) return null;
  const key = normalizeMarcaKey(marcaNome);
  const rows = await conn
    .select({ gestorNome: gestorMarcaImportMap.gestorNome })
    .from(gestorMarcaImportMap)
    .where(eq(gestorMarcaImportMap.marcaKey, key))
    .limit(1);
  const nome = rows[0]?.gestorNome?.trim();
  return nome || null;
}

/** Aplica gestor armazenado no mapa quando a marca já existe no cadastro. */
export async function applyImportMapLinkForMarcaNome(marcaNome: string): Promise<boolean> {
  const gestorNome = await getGestorNomeFromImportMap(marcaNome);
  if (!gestorNome) return false;

  const [marcas, gestores, links] = await Promise.all([
    db.listMarcas(),
    db.listGestores(),
    db.listGestorMarca(),
  ]);
  const marca = marcas.find(m => normalizeMarcaKey(m.nome) === normalizeMarcaKey(marcaNome));
  const gestor = gestores.find(g => g.nome.trim().toLowerCase() === gestorNome.toLowerCase());
  if (!marca || !gestor) return false;

  const existing = links.find(l => l.marcaId === marca.id);
  if (existing) {
    if (existing.gestorId === gestor.id) return true;
    await db.updateGestorMarca(existing.id, { gestorId: gestor.id, ativo: true });
    return true;
  }
  await db.createGestorMarca({ marcaId: marca.id, gestorId: gestor.id, ativo: true });
  return true;
}

export async function applyImportMapLinksForMarcaNomes(nomes: string[]) {
  let applied = 0;
  for (const nome of nomes) {
    if (await applyImportMapLinkForMarcaNome(nome)) applied += 1;
  }
  return applied;
}

export async function applyGestorMarcaImportMerge(rows: GestorMarcaImportRow[]): Promise<GestorMarcaImportResult> {
  const ctx = await loadMergeContext();
  const plan = planGestorMarcaImportMerge(rows, ctx);
  const unknownGestores: string[] = [];

  for (const item of plan.items) {
    switch (item.kind) {
      case "store_pending_gestor":
        await upsertGestorMarcaImportMap(item.marcaNome, item.gestorNome);
        break;
      case "create_link":
        await db.createGestorMarca({
          marcaId: item.marcaId,
          gestorId: item.gestorId,
          ativo: true,
        });
        break;
      case "update_link":
        await db.updateGestorMarca(item.linkId, { gestorId: item.gestorId, ativo: true });
        break;
      case "unknown_gestor":
        unknownGestores.push(`${item.marcaNome} → ${item.gestorNome}`);
        break;
      case "preserve_link":
        break;
      default: {
        const _exhaustive: never = item;
        return _exhaustive;
      }
    }
  }

  return { stats: plan.stats, unknownGestores };
}

/** Após sync de faturamento: aplica mapa para marcas já cadastradas sem vínco. */
export async function reconcileGestorMarcaImportMapAfterFaturamento() {
  const conn = await db.getDb();
  if (!conn) return { applied: 0 };
  const mapRows = await conn.select().from(gestorMarcaImportMap);
  let applied = 0;
  for (const row of mapRows) {
    if (await applyImportMapLinkForMarcaNome(row.marcaNome)) applied += 1;
  }
  return { applied };
}

/** Marcas novas no faturamento com gestor no mapa de importação → cadastro + vínculo automático. */
export async function autoCreateMarcasWithGestorFromImportMap() {
  const { listPendingMarcasFromFaturamento } = await import("./seed-from-faturamento");
  const pending = await listPendingMarcasFromFaturamento();
  let created = 0;
  let linked = 0;
  for (const row of pending) {
    const gestorNome = await getGestorNomeFromImportMap(row.nome);
    if (!gestorNome) continue;
    await db.createMarcasBatch([{ nome: row.nome, ativo: true }]);
    created += 1;
    if (await applyImportMapLinkForMarcaNome(row.nome)) linked += 1;
  }
  return { created, linked, scanned: pending.length };
}
