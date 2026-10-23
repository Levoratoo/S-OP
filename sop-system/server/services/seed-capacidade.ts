/**
 * Baseline operacional de capacidade:
 * - velocidade líquida calibrada pela demanda do ciclo (ou faturamento)
 * - configuração mensal (turno) para o ano
 * - fluxo por linha + vínculo produto.fluxoId
 */
import { sql } from "drizzle-orm";
import { canonicalizeLinha } from "../../shared/linha";
import * as db from "../db";

export type SeedCapacidadeResult = {
  dryRun: boolean;
  ano: number;
  turno: { id: number; turnoHora: string };
  utilizacaoAlvo: number;
  demandaFonte: "ciclo" | "faturamento" | "nenhuma";
  cicloId: number | null;
  recursosAtualizados: number;
  configsMensaisCriadas: number;
  configsMensaisExistentes: number;
  configsMensaisAtualizadas: number;
  fluxosVinculados: number;
  produtosComFluxo: number;
  linhas: Array<{
    linha: string;
    demanda12m: number;
    recursos: number;
    velocidade: number;
  }>;
};

const MES_KEYS = ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9", "m10", "m11", "m12"] as const;

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const n = Number(String(value ?? "0").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function horasUteisTurno(turno: { turnoHora: string; horasTrabalhadas: string | null }): number {
  const ht = turno.horasTrabalhadas || "00:00";
  const [h, m] = ht.split(":").map(Number);
  const horasPorTurno = (h || 0) + (m || 0) / 60;
  const match = (turno.turnoHora || "").match(/^(\d+)\//);
  const numTurnos = match ? parseInt(match[1], 10) : 1;
  return Math.max(0, horasPorTurno * numTurnos);
}

async function loadDemandaPorLinha(cicloId?: number): Promise<{
  fonte: "ciclo" | "faturamento" | "nenhuma";
  cicloId: number | null;
  porLinha: Map<string, number>;
}> {
  const porLinha = new Map<string, number>();

  // Preferir ciclo informado ou o mais recente
  let resolvedCicloId = cicloId ?? null;
  if (!resolvedCicloId) {
    const ciclos = await db.listCiclosComerciais();
    resolvedCicloId = ciclos[0]?.id ?? null;
  }

  if (resolvedCicloId) {
    const itens = await db.listCicloComercialItens(resolvedCicloId);
    for (const item of itens) {
      const key = canonicalizeLinha(item.linha);
      if (!key) continue;
      let q = 0;
      for (const k of MES_KEYS) q += toNumber(item[k]);
      if (q <= 0) q = toNumber(item.qtdeColaborada);
      porLinha.set(key, (porLinha.get(key) || 0) + q);
    }
    if (Array.from(porLinha.values()).some((v) => v > 0)) {
      return { fonte: "ciclo", cicloId: resolvedCicloId, porLinha };
    }
  }

  // Fallback: faturamento SAIDA do ano corrente
  const conn = await db.getDb();
  if (conn) {
    const ano = new Date().getFullYear();
    const result = await conn.execute(sql`
      SELECT linhaProduto, SUM(
        CASE WHEN tipoFaturamento = 'SAIDA' THEN qtd ELSE -qtd END
      ) AS qtd
      FROM faturamento
      WHERE YEAR(dataEmissao) = ${ano}
        AND linhaProduto IS NOT NULL AND TRIM(linhaProduto) <> ''
      GROUP BY linhaProduto
    `);
    const rows = (result[0] as unknown as Array<{ linhaProduto: string; qtd: string }>) || [];
    for (const row of rows) {
      const key = canonicalizeLinha(row.linhaProduto);
      if (!key) continue;
      porLinha.set(key, (porLinha.get(key) || 0) + toNumber(row.qtd));
    }
    if (Array.from(porLinha.values()).some((v) => v > 0)) {
      return { fonte: "faturamento", cicloId: resolvedCicloId, porLinha };
    }
  }

  return { fonte: "nenhuma", cicloId: resolvedCicloId, porLinha };
}

function estimateHoursPerYear(
  turno: { turnoHora: string; horasTrabalhadas: string | null; diasTrabalhados: string | null },
  diasUteisPorMes: Map<number, number>
): number {
  const horasDia = horasUteisTurno(turno);
  let total = 0;
  for (let mes = 1; mes <= 12; mes++) {
    const dias = diasUteisPorMes.get(mes) || 22;
    total += dias * horasDia;
  }
  return Math.max(total, 1);
}

export async function seedCapacidadeBaseline(options?: {
  ano?: number;
  cicloId?: number;
  turnoHora?: string;
  utilizacaoAlvo?: number;
  dryRun?: boolean;
  forceVelocidade?: boolean;
}): Promise<SeedCapacidadeResult> {
  const dryRun = Boolean(options?.dryRun);
  const ano = options?.ano ?? new Date().getFullYear();
  const utilizacaoAlvo = Math.min(0.95, Math.max(0.3, options?.utilizacaoAlvo ?? 0.75));
  const turnoHoraPreferido = options?.turnoHora || "2/8";
  const forceVelocidade = options?.forceVelocidade ?? true;

  const turnos = await db.listTurnos();
  const turno =
    turnos.find((t) => t.turnoHora === turnoHoraPreferido) ||
    turnos.find((t) => (t.turnoHora || "").startsWith("2/")) ||
    turnos.find((t) => (t.turnoHora || "").startsWith("1/")) ||
    turnos[0];
  if (!turno) {
    throw new Error("Nenhum turno cadastrado. Importe turnos.csv antes do seed de capacidade.");
  }

  const diasRows = await db.listDiasUteis(ano);
  const diasUteisPorMes = new Map<number, number>();
  for (const d of diasRows) {
    const tipo = d.tipoDias || "seg-sex";
    // Preferir seg-sex; se já houver, manter o maior (mais conservador para capacidade)
    if (tipo === "seg-sex" || !diasUteisPorMes.has(d.mes)) {
      diasUteisPorMes.set(d.mes, d.diasUteis);
    }
  }
  if (diasUteisPorMes.size === 0) {
    for (let m = 1; m <= 12; m++) diasUteisPorMes.set(m, 22);
  }

  const horasAno = estimateHoursPerYear(turno, diasUteisPorMes);
  const demanda = await loadDemandaPorLinha(options?.cicloId);
  const recursos = await db.listRecursos();
  const ativos = recursos.filter((r) => r.ativo !== false);

  const recursosPorLinha = new Map<string, typeof ativos>();
  for (const r of ativos) {
    const key = canonicalizeLinha(r.linhaProduto);
    if (!key) continue;
    const list = recursosPorLinha.get(key) || [];
    list.push(r);
    recursosPorLinha.set(key, list);
  }

  const linhasResult: SeedCapacidadeResult["linhas"] = [];
  let recursosAtualizados = 0;
  let configsMensaisCriadas = 0;
  let configsMensaisExistentes = 0;
  let fluxosVinculados = 0;
  let produtosComFluxo = 0;

  const velocidadePorRecursoId = new Map<number, number>();
  const displayLinhaPorKey = new Map<string, string>();

  // Nome de exibição: preferir linhaProduto do recurso
  for (const r of ativos) {
    const key = canonicalizeLinha(r.linhaProduto);
    if (key && r.linhaProduto && !displayLinhaPorKey.has(key)) {
      displayLinhaPorKey.set(key, r.linhaProduto.trim());
    }
  }

  const allLineKeys = new Set([
    ...Array.from(recursosPorLinha.keys()),
    ...Array.from(demanda.porLinha.keys()),
  ]);

  for (const key of Array.from(allLineKeys)) {
    const recs = recursosPorLinha.get(key) || [];
    const dem = demanda.porLinha.get(key) || 0;
    if (recs.length === 0) continue;

    let velocidade: number;
    if (dem > 0) {
      const raw = dem / (recs.length * horasAno * utilizacaoAlvo);
      velocidade = Math.min(500000, Math.max(50, Math.round(raw)));
    } else {
      // Sem demanda conhecida: default conservador por tipo
      velocidade = 1000;
    }

    linhasResult.push({
      linha: displayLinhaPorKey.get(key) || key,
      demanda12m: Math.round(dem),
      recursos: recs.length,
      velocidade,
    });

    for (const r of recs) {
      const existingVel = toNumber(r.velocidadeLiquida);
      const shouldUpdate = forceVelocidade || existingVel <= 0;
      if (shouldUpdate) {
        velocidadePorRecursoId.set(r.id, velocidade);
        if (!dryRun) {
          await db.updateRecurso(r.id, { velocidadeLiquida: velocidade });
        }
        recursosAtualizados += 1;
      } else {
        velocidadePorRecursoId.set(r.id, existingVel);
      }
    }
  }

  // Recursos sem linha: ainda assim dá turno mensal com vel baixa (não entram no match por linha)
  for (const r of ativos) {
    if (velocidadePorRecursoId.has(r.id)) continue;
    const existingVel = toNumber(r.velocidadeLiquida);
    if (existingVel <= 0 && forceVelocidade) {
      if (!dryRun) await db.updateRecurso(r.id, { velocidadeLiquida: 100 });
      velocidadePorRecursoId.set(r.id, 100);
      recursosAtualizados += 1;
    } else if (existingVel > 0) {
      velocidadePorRecursoId.set(r.id, existingVel);
    }
  }

  // Config mensal (cria faltantes; com forceVelocidade também recalibra velocidade mensal)
  let configsMensaisAtualizadas = 0;
  for (const r of ativos) {
    if (!velocidadePorRecursoId.has(r.id) && toNumber(r.velocidadeLiquida) <= 0) continue;
    const vel = velocidadePorRecursoId.get(r.id);
    const existing = dryRun ? [] : await db.listRecursosMensaisByRecurso(r.id, ano);
    const byMes = new Map(existing.map((e) => [e.mes, e] as const));
    for (let mes = 1; mes <= 12; mes++) {
      const prev = byMes.get(mes);
      if (prev) {
        configsMensaisExistentes += 1;
        if (forceVelocidade && vel != null) {
          configsMensaisAtualizadas += 1;
          if (!dryRun) {
            await db.saveRecursoMensal({
              recursoId: r.id,
              ano,
              mes,
              turnoId: prev.turnoId || turno.id,
              horasManutencao: toNumber(prev.horasManutencao),
              horasExtras: toNumber(prev.horasExtras),
              velocidadeLiquida: vel,
            });
          }
        }
        continue;
      }
      configsMensaisCriadas += 1;
      if (!dryRun) {
        await db.saveRecursoMensal({
          recursoId: r.id,
          ano,
          mes,
          turnoId: turno.id,
          horasManutencao: 0,
          horasExtras: 0,
          velocidadeLiquida: vel,
        });
      }
    }
  }

  // Fluxos por linha + produtos.fluxoId
  const fluxos = await db.listFluxos();
  const fluxoByName = new Map(fluxos.map((f) => [f.nome.trim().toLowerCase(), f]));
  const allProdutos = await db.listProdutos();
  const fluxoIdPorLinha = new Map<string, { id: number; nome: string }>();

  for (const [key, recs] of Array.from(recursosPorLinha.entries())) {
    const display = displayLinhaPorKey.get(key) || key;
    const fluxoNome = `Linha: ${display}`;
    let fluxo = fluxoByName.get(fluxoNome.toLowerCase());
    if (!fluxo && !dryRun) {
      const created = await db.createFluxo({
        nome: fluxoNome,
        descricao: `Fluxo operacional gerado para linha ${display}`,
        ativo: true,
      });
      fluxo = {
        id: created.id,
        nome: fluxoNome,
        descricao: `Fluxo operacional gerado para linha ${display}`,
        ativo: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      fluxoByName.set(fluxoNome.toLowerCase(), fluxo);
    }
    if (!fluxo) {
      fluxosVinculados += 1; // dry-run count
      fluxoIdPorLinha.set(key, { id: -1, nome: fluxoNome });
      continue;
    }
    if (!dryRun) {
      await db.setFluxoRecursos(
        fluxo.id,
        recs.map((r) => r.id)
      );
    }
    fluxosVinculados += 1;
    fluxoIdPorLinha.set(key, { id: fluxo.id, nome: fluxoNome });
  }

  for (const p of allProdutos) {
    const key = canonicalizeLinha(p.linha);
    const fluxo = fluxoIdPorLinha.get(key);
    if (!fluxo || fluxo.id < 0) continue;
    if (p.fluxoId === fluxo.id) continue;
    produtosComFluxo += 1;
    if (!dryRun) {
      await db.updateProduto(p.id, { fluxoId: fluxo.id, fluxo: fluxo.nome });
    }
  }

  return {
    dryRun,
    ano,
    turno: { id: turno.id, turnoHora: turno.turnoHora },
    utilizacaoAlvo,
    demandaFonte: demanda.fonte,
    cicloId: demanda.cicloId,
    recursosAtualizados,
    configsMensaisCriadas,
    configsMensaisExistentes,
    configsMensaisAtualizadas,
    fluxosVinculados,
    produtosComFluxo,
    linhas: linhasResult.sort((a, b) => b.demanda12m - a.demanda12m),
  };
}
