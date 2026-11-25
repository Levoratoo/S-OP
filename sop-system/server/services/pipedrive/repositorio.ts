import { and, desc, eq } from "drizzle-orm";
import { getCicloComercial, getDb } from "../../db";
import {
  cicloComercialItens,
  cicloCrmPipedriveSync,
  cicloStatusHistorico,
  ciclosComerciais,
  gestores,
  produtos,
  type InsertCicloComercialItem,
} from "../../../drizzle/schema";
import { importCrmParaCiclo, substituirCargaCrmDoCiclo } from "../ciclo-colab-extras";
import { loadDeParaMap } from "../de-para-map";
import { paraLinhaImportCrm, type LinhaCrmTratada } from "@shared/pipedrive-crm";
import type { RegistroSync, RepositorioPipedrive, TransacaoPipedrive } from "./sync";

const MES = ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9", "m10", "m11", "m12"] as const;

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const data = value instanceof Date ? value : new Date(value);
  return Number.isNaN(data.getTime()) ? null : data.toISOString();
}

function numero(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function paraRegistro(row: typeof cicloCrmPipedriveSync.$inferSelect): RegistroSync {
  return {
    id: row.id,
    cicloId: row.cicloId,
    usuario: row.usuario,
    previewHash: row.previewHash,
    negocios: row.negocios,
    linhas: row.linhas,
    quantidade: numero(row.quantidade),
    valor: numero(row.valor),
    alertasQtd: row.alertasQtd,
    totaisJson: row.totaisJson,
    snapshotJson: row.snapshotJson,
    createdAt: iso(row.createdAt) ?? new Date(0).toISOString(),
    desfeitoEm: iso(row.desfeitoEm),
  };
}

async function exigirDb() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db;
}

export function criarRepositorioPipedrive(): RepositorioPipedrive {
  return {
    async obterCiclo(cicloId) {
      const ciclo = await getCicloComercial(cicloId);
      if (!ciclo) return null;
      return {
        id: ciclo.id,
        status: ciclo.status,
        anoInicio: ciclo.anoInicio,
        mesInicio: ciclo.mesInicio,
      };
    },
    async listarGestores() {
      const db = await exigirDb();
      const rows = await db
        .select({ nome: gestores.nome })
        .from(gestores)
        .where(eq(gestores.ativo, true));
      return rows.map(row => row.nome).filter(Boolean);
    },
    async listarProdutos() {
      const db = await exigirDb();
      const rows = await db
        .select({
          codItem: produtos.codItem,
          codigo: produtos.codigo,
          descricao: produtos.descricao,
          nome: produtos.nome,
          marca: produtos.marca,
        })
        .from(produtos);
      const saida: Array<{ codigo: string; descricao: string | null; marca: string | null }> = [];
      for (const row of rows) {
        const descricao = row.descricao || row.nome || null;
        const marca = row.marca?.trim() || null;
        if (row.codItem?.trim()) saida.push({ codigo: row.codItem.trim(), descricao, marca });
        if (row.codigo?.trim() && row.codigo.trim() !== row.codItem?.trim()) {
          saida.push({ codigo: row.codigo.trim(), descricao, marca });
        }
      }
      return saida;
    },
    async listarDePara() {
      const mapa = await loadDeParaMap();
      return Array.from(mapa.entries()).map(([skuAntigo, skuNovo]) => ({ skuAntigo, skuNovo }));
    },
    async listarCargaCrm(cicloId) {
      const db = await exigirDb();
      const rows = await db
        .select()
        .from(cicloComercialItens)
        .where(
          and(
            eq(cicloComercialItens.cicloId, cicloId),
            eq(cicloComercialItens.planoColab, "CRM"),
            eq(cicloComercialItens.origem, "CRM")
          )
        );
      return rows.map(row => ({
        sku: row.sku,
        marca: row.marca,
        valorVenda: numero(row.valorVendaSnapshot),
        meses: MES.map(mes => numero(row[mes])),
      }));
    },
    async materializar(cicloId, linhas: LinhaCrmTratada[]) {
      const resultado = await importCrmParaCiclo(
        cicloId,
        linhas.map(paraLinhaImportCrm),
        { permitirApostaGenericaSemOrcamento: true, somenteMontar: true }
      );
      return {
        itens: resultado.itens ?? [],
        skusCriados: resultado.skusCriados,
        erros: resultado.erros,
        avisos: resultado.avisos,
        foraHorizonte: resultado.foraHorizonte,
      };
    },
    async transacao(fn) {
      const db = await exigirDb();
      return db.transaction(async tx => {
        const adaptado: TransacaoPipedrive = {
          async statusCiclo(cicloId) {
            const [row] = await tx
              .select({ status: ciclosComerciais.status })
              .from(ciclosComerciais)
              .where(eq(ciclosComerciais.id, cicloId));
            return row?.status ?? null;
          },
          async snapshotCarga(cicloId) {
            const rows = await tx
              .select()
              .from(cicloComercialItens)
              .where(
                and(
                  eq(cicloComercialItens.cicloId, cicloId),
                  eq(cicloComercialItens.planoColab, "CRM"),
                  eq(cicloComercialItens.origem, "CRM")
                )
              );
            return rows.map(row => ({ ...row }));
          },
          async substituirCarga(cicloId, itens) {
            await substituirCargaCrmDoCiclo(tx, cicloId, itens as InsertCicloComercialItem[]);
          },
          async registrarHistorico(entrada) {
            await tx.insert(cicloStatusHistorico).values({
              cicloId: entrada.cicloId,
              statusDe: entrada.status,
              statusPara: entrada.status,
              usuario: entrada.usuario,
              comentario: entrada.comentario,
            });
          },
          async registrarSync(registro) {
            await tx.insert(cicloCrmPipedriveSync).values({
              cicloId: registro.cicloId,
              usuario: registro.usuario,
              previewHash: registro.previewHash,
              negocios: registro.negocios,
              linhas: registro.linhas,
              quantidade: String(registro.quantidade),
              valor: String(registro.valor),
              alertasQtd: registro.alertasQtd,
              totaisJson: registro.totaisJson,
              snapshotJson: registro.snapshotJson,
            });
          },
          async ultimaSync(cicloId) {
            const [row] = await tx
              .select()
              .from(cicloCrmPipedriveSync)
              .where(eq(cicloCrmPipedriveSync.cicloId, cicloId))
              .orderBy(desc(cicloCrmPipedriveSync.id))
              .limit(1);
            return row ? paraRegistro(row) : null;
          },
          async marcarDesfeita(id, quando) {
            await tx
              .update(cicloCrmPipedriveSync)
              .set({ desfeitoEm: quando })
              .where(eq(cicloCrmPipedriveSync.id, id));
          },
        };
        return fn(adaptado);
      });
    },
    async ultimaSincronizacao(cicloId) {
      const db = await exigirDb();
      const [row] = await db
        .select()
        .from(cicloCrmPipedriveSync)
        .where(eq(cicloCrmPipedriveSync.cicloId, cicloId))
        .orderBy(desc(cicloCrmPipedriveSync.id))
        .limit(1);
      return row ? paraRegistro(row) : null;
    },
  };
}
