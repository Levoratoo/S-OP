/** Regras de merge importação base Marca × Gestor (export CSV/XLSX). */

export type GestorMarcaImportRow = { marca: string; gestor: string };

export type GestorMarcaMergeEntity = { id: number; nome: string };

export type GestorMarcaMergeLink = {
  id: number;
  marcaId: number;
  gestorId: number;
};

export type GestorMarcaMergeContext = {
  marcas: GestorMarcaMergeEntity[];
  gestores: GestorMarcaMergeEntity[];
  links: GestorMarcaMergeLink[];
};

export type GestorMarcaMergePlanItem =
  | { kind: "preserve_link"; marcaNome: string }
  | { kind: "create_link"; marcaNome: string; gestorNome: string; marcaId: number; gestorId: number }
  | { kind: "update_link"; marcaNome: string; gestorNome: string; linkId: number; gestorId: number }
  | { kind: "store_pending_gestor"; marcaNome: string; gestorNome: string }
  | { kind: "unknown_gestor"; marcaNome: string; gestorNome: string };

export type GestorMarcaMergePlan = {
  items: GestorMarcaMergePlanItem[];
  stats: {
    rowsInFile: number;
    rowsUsed: number;
    preserved: number;
    linksCreated: number;
    linksUpdated: number;
    pendingGestorStored: number;
    unknownGestor: number;
    skippedEmptyMarca: number;
  };
};

export function normalizeMarcaKey(nome: string): string {
  return nome.trim().toLowerCase();
}

export function normalizeGestorKey(nome: string): string {
  return nome.trim().toLowerCase();
}

/** Última linha vence para a mesma marca (case-insensitive). */
export function dedupeGestorMarcaRows(rows: GestorMarcaImportRow[]): GestorMarcaImportRow[] {
  const byMarca = new Map<string, GestorMarcaImportRow>();
  for (const row of rows) {
    const marca = row.marca?.trim() ?? "";
    if (!marca) continue;
    byMarca.set(normalizeMarcaKey(marca), { marca, gestor: row.gestor?.trim() ?? "" });
  }
  return [...byMarca.values()];
}

function findMarca(ctx: GestorMarcaMergeContext, marcaNome: string) {
  const key = normalizeMarcaKey(marcaNome);
  return ctx.marcas.find(m => normalizeMarcaKey(m.nome) === key);
}

function findGestor(ctx: GestorMarcaMergeContext, gestorNome: string) {
  const key = normalizeGestorKey(gestorNome);
  return ctx.gestores.find(g => normalizeGestorKey(g.nome) === key);
}

function findLinkForMarca(ctx: GestorMarcaMergeContext, marcaId: number) {
  return ctx.links.find(l => l.marcaId === marcaId);
}

/**
 * - Marca já cadastrada + gestor vazio no arquivo: mantém vínculo atual.
 * - Marca já cadastrada + gestor no arquivo: cria ou atualiza vínculo se mudou.
 * - Marca ainda não cadastrada + gestor no arquivo: guarda gestor sugerido (marca continua pendente até aceite).
 * - Marca não cadastrada + gestor vazio: nenhuma alteração.
 * - Vínculos existentes fora do arquivo não são removidos.
 */
export function planGestorMarcaImportMerge(
  rawRows: GestorMarcaImportRow[],
  ctx: GestorMarcaMergeContext
): GestorMarcaMergePlan {
  const rows = dedupeGestorMarcaRows(rawRows);
  const items: GestorMarcaMergePlanItem[] = [];
  const stats = {
    rowsInFile: rawRows.length,
    rowsUsed: rows.length,
    preserved: 0,
    linksCreated: 0,
    linksUpdated: 0,
    pendingGestorStored: 0,
    unknownGestor: 0,
    skippedEmptyMarca: rawRows.filter(r => !(r.marca?.trim())).length,
  };

  for (const row of rows) {
    const marcaNome = row.marca.trim();
    const gestorNome = row.gestor.trim();
    const marca = findMarca(ctx, marcaNome);

    if (!marca) {
      if (gestorNome) {
        items.push({ kind: "store_pending_gestor", marcaNome, gestorNome });
        stats.pendingGestorStored += 1;
      }
      continue;
    }

    if (!gestorNome) {
      items.push({ kind: "preserve_link", marcaNome });
      stats.preserved += 1;
      continue;
    }

    const gestor = findGestor(ctx, gestorNome);
    if (!gestor) {
      items.push({ kind: "unknown_gestor", marcaNome, gestorNome });
      stats.unknownGestor += 1;
      continue;
    }

    const link = findLinkForMarca(ctx, marca.id);
    if (!link) {
      items.push({
        kind: "create_link",
        marcaNome,
        gestorNome,
        marcaId: marca.id,
        gestorId: gestor.id,
      });
      stats.linksCreated += 1;
      continue;
    }

    if (link.gestorId === gestor.id) {
      items.push({ kind: "preserve_link", marcaNome });
      stats.preserved += 1;
      continue;
    }

    items.push({
      kind: "update_link",
      marcaNome,
      gestorNome,
      linkId: link.id,
      gestorId: gestor.id,
    });
    stats.linksUpdated += 1;
  }

  return { items, stats };
}

/** Cabeçalhos aceitos para Marca / Gestor (export e import). */
export function parseGestorMarcaSheetRows(rows: unknown[][]): GestorMarcaImportRow[] {
  if (rows.length < 2) return [];
  const headerRow = rows[0] as unknown[];
  const headers = headerRow.map(h => String(h ?? "").trim().toLowerCase());

  const marcaIdx = headers.findIndex(h => h === "marca" || h === "nome marca" || h === "marca ");
  const gestorIdx = headers.findIndex(h => h === "gestor" || h === "nome gestor" || h === "gestor comercial");
  if (marcaIdx < 0) {
    throw new Error('Coluna "Marca" não encontrada no arquivo.');
  }

  const out: GestorMarcaImportRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    if (!row?.length) continue;
    const marca = String(row[marcaIdx] ?? "").trim();
    if (!marca) continue;
    const gestor = gestorIdx >= 0 ? String(row[gestorIdx] ?? "").trim() : "";
    out.push({ marca, gestor });
  }
  return out;
}
