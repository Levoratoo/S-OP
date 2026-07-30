import { eq, desc, and, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { 
  InsertUser, users, User,
  niveisAcesso, InsertNivelAcesso, NivelAcesso,
  usuarioMarcas, InsertUsuarioMarca, UsuarioMarca,
  familias, InsertFamilia, Familia,
  subfamilias, InsertSubfamilia, Subfamilia,
  produtos, InsertProduto, Produto,
  clientes, InsertCliente, Cliente,
  recursos, InsertRecurso, Recurso,
  diasUteis, InsertDiaUtil, DiaUtil,
  roteiros, InsertRoteiro, Roteiro,
  hierarquias, InsertHierarquia, Hierarquia,
  membros, InsertMembro, Membro,
  paradas, InsertParada, Parada,
  vendas, InsertVenda, Venda,
  carteiraPedidos, InsertCarteiraPedido,
  forecasts, InsertForecast,
  orcamentos, InsertOrcamento,
  previsoes, InsertPrevisao,
  colaboracoes, InsertColaboracao,
  consensos, InsertConsenso,
  metasProducao, InsertMetaProducao,
  faturamento, InsertFaturamento, Faturamento,
  statusCadastro, InsertStatusCadastro, StatusCadastro,
  tiposNegocio, InsertTipoNegocio, TipoNegocio,
  tiposEstoque, InsertTipoEstoque, TipoEstoque,
  linhas, InsertLinha, Linha,
  modelos, InsertModelo, Modelo,
  tamanhos, InsertTamanho, Tamanho,
  marcas, InsertMarca, Marca,
  gestores, InsertGestor, Gestor,
  gestorMarca, InsertGestorMarca, GestorMarca,
  deParaCodigos, InsertDeParaCodigo, DeParaCodigo,
  turnos, InsertTurno, Turno,
  recursosMensais, InsertRecursoMensal, RecursoMensal,
  fluxos, InsertFluxo, Fluxo,
  fluxoRecursos, InsertFluxoRecurso, FluxoRecurso,
  previsaoPythonJobs, InsertPrevisaoPythonJob, PrevisaoPythonJob,
  previsaoPythonScenarioSnapshots,
  InsertPrevisaoPythonScenarioSnapshot,
  PrevisaoPythonScenarioSnapshot,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ==================== USUÁRIOS ====================
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ==================== FAMÍLIAS ====================
export async function listFamilias() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(familias).orderBy(familias.nome);
}

export async function getFamiliaById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(familias).where(eq(familias.id, id)).limit(1);
  return result[0];
}

export async function createFamilia(data: InsertFamilia) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(familias).values(data);
  return { id: result[0].insertId };
}

export async function updateFamilia(id: number, data: Partial<InsertFamilia>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(familias).set(data).where(eq(familias.id, id));
}

export async function deleteFamilia(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(familias).where(eq(familias.id, id));
}

// ==================== SUBFAMÍLIAS ====================
export async function listSubfamilias(familiaId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (familiaId) {
    return db.select().from(subfamilias).where(eq(subfamilias.familiaId, familiaId)).orderBy(subfamilias.nome);
  }
  return db.select().from(subfamilias).orderBy(subfamilias.nome);
}

export async function createSubfamilia(data: InsertSubfamilia) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(subfamilias).values(data);
  return { id: result[0].insertId };
}

export async function updateSubfamilia(id: number, data: Partial<InsertSubfamilia>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(subfamilias).set(data).where(eq(subfamilias.id, id));
}

export async function deleteSubfamilia(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(subfamilias).where(eq(subfamilias.id, id));
}

// ==================== PRODUTOS ====================
export async function listProdutos() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(produtos).orderBy(produtos.nome);
}

export async function getProdutoById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(produtos).where(eq(produtos.id, id)).limit(1);
  return result[0];
}

export async function createProduto(data: InsertProduto) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(produtos).values(data);
  return { id: result[0].insertId };
}

export async function updateProduto(id: number, data: Partial<InsertProduto>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(produtos).set(data).where(eq(produtos.id, id));
}

export async function deleteProduto(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(produtos).where(eq(produtos.id, id));
}

export async function createProdutosBatch(data: InsertProduto[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (data.length === 0) return { count: 0 };
  await db.insert(produtos).values(data);
  return { count: data.length };
}

// ==================== CLIENTES ====================
export async function listClientes() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(clientes).orderBy(clientes.razaoSocial);
}

export async function getClienteById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(clientes).where(eq(clientes.id, id)).limit(1);
  return result[0];
}

export async function createCliente(data: InsertCliente) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(clientes).values(data);
  return { id: result[0].insertId };
}

export async function updateCliente(id: number, data: Partial<InsertCliente>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(clientes).set(data).where(eq(clientes.id, id));
}

export async function deleteCliente(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(clientes).where(eq(clientes.id, id));
}

// ==================== RECURSOS ====================
export async function listRecursos() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(recursos).orderBy(recursos.nome);
}

export async function getRecursoById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(recursos).where(eq(recursos.id, id)).limit(1);
  return result[0];
}

export async function getRecursoByNome(nome: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(recursos).where(eq(recursos.nome, nome)).limit(1);
  return result[0];
}

export async function createRecurso(data: Omit<InsertRecurso, 'velocidadeLiquida'> & { velocidadeLiquida?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const insertData: InsertRecurso = {
    ...data,
    velocidadeLiquida: data.velocidadeLiquida?.toString(),
  };
  const result = await db.insert(recursos).values(insertData);
  return { id: result[0].insertId };
}

export async function updateRecurso(id: number, data: Partial<Omit<InsertRecurso, 'velocidadeLiquida'>> & { velocidadeLiquida?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateData: Partial<InsertRecurso> = {};
  Object.entries(data).forEach(([key, value]) => {
    if (key === 'velocidadeLiquida' && value !== undefined && value !== null) {
      (updateData as Record<string, unknown>)[key] = String(value);
    } else if (value !== undefined) {
      (updateData as Record<string, unknown>)[key] = value;
    }
  });
  await db.update(recursos).set(updateData).where(eq(recursos.id, id));
}

export async function deleteRecurso(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(recursos).where(eq(recursos.id, id));
}

// ==================== DIAS ÚTEIS ====================
export async function listDiasUteis(ano?: number) {
  const db = await getDb();
  if (!db) return [];
  if (ano) {
    return db.select().from(diasUteis).where(eq(diasUteis.ano, ano)).orderBy(diasUteis.mes);
  }
  return db.select().from(diasUteis).orderBy(desc(diasUteis.ano), diasUteis.mes);
}

export async function createDiaUtil(data: InsertDiaUtil) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(diasUteis).values(data);
  return { id: result[0].insertId };
}

export async function updateDiaUtil(id: number, data: Partial<InsertDiaUtil>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(diasUteis).set(data).where(eq(diasUteis.id, id));
}

export async function deleteDiaUtil(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(diasUteis).where(eq(diasUteis.id, id));
}

// ==================== HIERARQUIAS ====================
export async function listHierarquias() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(hierarquias).orderBy(hierarquias.codigo);
}

export async function createHierarquia(data: InsertHierarquia) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(hierarquias).values(data);
  return { id: result[0].insertId };
}

export async function updateHierarquia(id: number, data: Partial<InsertHierarquia>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(hierarquias).set(data).where(eq(hierarquias.id, id));
}

export async function deleteHierarquia(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(hierarquias).where(eq(hierarquias.id, id));
}

// ==================== MEMBROS ====================
export async function listMembros() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(membros).orderBy(membros.nome);
}

export async function createMembro(data: InsertMembro) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(membros).values(data);
  return { id: result[0].insertId };
}

export async function updateMembro(id: number, data: Partial<InsertMembro>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(membros).set(data).where(eq(membros.id, id));
}

export async function deleteMembro(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(membros).where(eq(membros.id, id));
}

// ==================== PARADAS ====================
export async function listParadas() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(paradas).orderBy(paradas.nome);
}

export async function createParada(data: InsertParada) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(paradas).values(data);
  return { id: result[0].insertId };
}

export async function updateParada(id: number, data: Partial<InsertParada>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(paradas).set(data).where(eq(paradas.id, id));
}

export async function deleteParada(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(paradas).where(eq(paradas.id, id));
}

// ==================== VENDAS ====================
export async function listVendas(limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(vendas).orderBy(desc(vendas.dataNf)).limit(limit);
}

export async function createVenda(data: InsertVenda) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(vendas).values(data);
  return { id: result[0].insertId };
}

export async function createVendasBatch(data: InsertVenda[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (data.length === 0) return { count: 0 };
  await db.insert(vendas).values(data);
  return { count: data.length };
}

// ==================== CARTEIRA DE PEDIDOS ====================
export async function listCarteiraPedidos(limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(carteiraPedidos)
    .orderBy(desc(carteiraPedidos.competencia), desc(carteiraPedidos.id))
    .limit(limit);
}

export async function createCarteiraPedido(data: InsertCarteiraPedido) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(carteiraPedidos).values(data);
  return { id: result[0].insertId };
}

export async function updateCarteiraPedido(id: number, data: Partial<InsertCarteiraPedido>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(carteiraPedidos).set(data).where(eq(carteiraPedidos.id, id));
}

export async function deleteCarteiraPedido(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(carteiraPedidos).where(eq(carteiraPedidos.id, id));
}

export async function createCarteiraPedidosBatch(data: InsertCarteiraPedido[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (data.length === 0) return { count: 0 };
  await db.insert(carteiraPedidos).values(data);
  return { count: data.length };
}

// ==================== FORECAST ====================
export async function listForecasts(limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(forecasts)
    .orderBy(desc(forecasts.competencia), desc(forecasts.id))
    .limit(limit);
}

export async function createForecast(data: InsertForecast) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(forecasts).values(data);
  return { id: result[0].insertId };
}

export async function updateForecast(id: number, data: Partial<InsertForecast>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(forecasts).set(data).where(eq(forecasts.id, id));
}

export async function deleteForecast(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(forecasts).where(eq(forecasts.id, id));
}

export async function createForecastsBatch(data: InsertForecast[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (data.length === 0) return { count: 0 };
  await db.insert(forecasts).values(data);
  return { count: data.length };
}

// ==================== ORCAMENTOS ====================
export async function listOrcamentos(ano?: number) {
  const db = await getDb();
  if (!db) return [];
  if (ano !== undefined) {
    return db
      .select()
      .from(orcamentos)
      .where(eq(orcamentos.ano, ano))
      .orderBy(desc(orcamentos.ano), orcamentos.mes, orcamentos.id);
  }
  return db.select().from(orcamentos).orderBy(desc(orcamentos.ano), orcamentos.mes, orcamentos.id);
}

export async function createOrcamento(data: InsertOrcamento) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(orcamentos).values(data);
  return { id: result[0].insertId };
}

export async function updateOrcamento(id: number, data: Partial<InsertOrcamento>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(orcamentos).set(data).where(eq(orcamentos.id, id));
}

export async function deleteOrcamento(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(orcamentos).where(eq(orcamentos.id, id));
}

export async function createOrcamentosBatch(data: InsertOrcamento[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (data.length === 0) return { count: 0 };
  await db.insert(orcamentos).values(data);
  return { count: data.length };
}

// ==================== PREVISOES ====================
export async function listPrevisoes(ano?: number) {
  const db = await getDb();
  if (!db) return [];
  if (ano !== undefined) {
    return db
      .select()
      .from(previsoes)
      .where(eq(previsoes.ano, ano))
      .orderBy(desc(previsoes.ano), previsoes.mes, previsoes.id);
  }
  return db.select().from(previsoes).orderBy(desc(previsoes.ano), previsoes.mes, previsoes.id);
}

export async function createPrevisao(data: InsertPrevisao) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(previsoes).values(data);
  return { id: result[0].insertId };
}

export async function updatePrevisao(id: number, data: Partial<InsertPrevisao>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(previsoes).set(data).where(eq(previsoes.id, id));
}

export async function deletePrevisao(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(previsoes).where(eq(previsoes.id, id));
}

export async function createPrevisoesBatch(data: InsertPrevisao[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (data.length === 0) return { count: 0 };
  await db.insert(previsoes).values(data);
  return { count: data.length };
}

// ==================== COLABORACOES ====================
export async function listColaboracoes(ano?: number, ciclo?: number) {
  const db = await getDb();
  if (!db) return [];

  const conditions: any[] = [];
  if (ano !== undefined) conditions.push(eq(colaboracoes.ano, ano));
  if (ciclo !== undefined) conditions.push(eq(colaboracoes.ciclo, ciclo));

  const baseQuery = db.select().from(colaboracoes);
  if (conditions.length === 0) {
    return baseQuery.orderBy(desc(colaboracoes.ano), desc(colaboracoes.ciclo), colaboracoes.id);
  }
  if (conditions.length === 1) {
    return baseQuery
      .where(conditions[0])
      .orderBy(desc(colaboracoes.ano), desc(colaboracoes.ciclo), colaboracoes.id);
  }
  return baseQuery
    .where(and(...conditions))
    .orderBy(desc(colaboracoes.ano), desc(colaboracoes.ciclo), colaboracoes.id);
}

export async function createColaboracao(data: InsertColaboracao) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(colaboracoes).values(data);
  return { id: result[0].insertId };
}

export async function updateColaboracao(id: number, data: Partial<InsertColaboracao>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(colaboracoes).set(data).where(eq(colaboracoes.id, id));
}

export async function deleteColaboracao(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(colaboracoes).where(eq(colaboracoes.id, id));
}

// ==================== CONSENSOS ====================
export async function listConsensos(ano?: number, ciclo?: number) {
  const db = await getDb();
  if (!db) return [];

  const conditions: any[] = [];
  if (ano !== undefined) conditions.push(eq(consensos.ano, ano));
  if (ciclo !== undefined) conditions.push(eq(consensos.ciclo, ciclo));

  const baseQuery = db.select().from(consensos);
  if (conditions.length === 0) {
    return baseQuery.orderBy(desc(consensos.ano), desc(consensos.ciclo), consensos.id);
  }
  if (conditions.length === 1) {
    return baseQuery
      .where(conditions[0])
      .orderBy(desc(consensos.ano), desc(consensos.ciclo), consensos.id);
  }
  return baseQuery
    .where(and(...conditions))
    .orderBy(desc(consensos.ano), desc(consensos.ciclo), consensos.id);
}

export async function createConsenso(data: InsertConsenso) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(consensos).values(data);
  return { id: result[0].insertId };
}

export async function updateConsenso(id: number, data: Partial<InsertConsenso>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(consensos).set(data).where(eq(consensos.id, id));
}

export async function deleteConsenso(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(consensos).where(eq(consensos.id, id));
}

// ==================== METAS DE PRODUCAO ====================
export async function listMetasProducao(ano?: number, recursoId?: number) {
  const db = await getDb();
  if (!db) return [];

  const conditions: any[] = [];
  if (ano !== undefined) conditions.push(eq(metasProducao.ano, ano));
  if (recursoId !== undefined) conditions.push(eq(metasProducao.recursoId, recursoId));

  const baseQuery = db.select().from(metasProducao);
  if (conditions.length === 0) {
    return baseQuery.orderBy(desc(metasProducao.ano), metasProducao.mes, metasProducao.id);
  }
  if (conditions.length === 1) {
    return baseQuery
      .where(conditions[0])
      .orderBy(desc(metasProducao.ano), metasProducao.mes, metasProducao.id);
  }
  return baseQuery
    .where(and(...conditions))
    .orderBy(desc(metasProducao.ano), metasProducao.mes, metasProducao.id);
}

export async function createMetaProducao(data: InsertMetaProducao) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(metasProducao).values(data);
  return { id: result[0].insertId };
}

export async function updateMetaProducao(id: number, data: Partial<InsertMetaProducao>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(metasProducao).set(data).where(eq(metasProducao.id, id));
}

export async function deleteMetaProducao(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(metasProducao).where(eq(metasProducao.id, id));
}

export async function getIndicadoresAcuracidade(ano?: number) {
  const db = await getDb();
  if (!db) {
    return { mape: null, wmape: null, bias: null, acuracidade: null, irog: null, totalPrevisoes: 0 };
  }

  const filtroAnoPrevisao = ano !== undefined ? sql`AND p.ano = ${ano}` : sql``;
  const filtroAnoMeta = ano !== undefined ? sql`WHERE ano = ${ano}` : sql``;

  const previsaoResult = await db.execute(sql`
    SELECT
      COUNT(*) AS totalPrevisoes,
      AVG(CASE WHEN p.mape IS NOT NULL THEN p.mape END) AS mapeMedio,
      (
        SUM(CASE WHEN p.wmape IS NOT NULL THEN p.wmape * p.valorPrevisto ELSE 0 END)
        / NULLIF(SUM(CASE WHEN p.wmape IS NOT NULL THEN p.valorPrevisto ELSE 0 END), 0)
      ) AS wmapePonderado,
      (
        SUM(COALESCE(p.valorPrevisto, 0) - COALESCE(v.realizado, 0))
        / NULLIF(SUM(COALESCE(v.realizado, 0)), 0)
      ) * 100 AS biasPercentual
    FROM previsoes p
    LEFT JOIN (
      SELECT
        produtoId,
        YEAR(dataNf) AS ano,
        MONTH(dataNf) AS mes,
        SUM(receitaBruta) AS realizado
      FROM vendas
      GROUP BY produtoId, YEAR(dataNf), MONTH(dataNf)
    ) v ON v.produtoId = p.produtoId AND v.ano = p.ano AND v.mes = p.mes
    WHERE 1=1
    ${filtroAnoPrevisao}
  `);

  const irogResult = await db.execute(sql`
    SELECT AVG(irogMeta) AS irogMedio
    FROM metas_producao
    ${filtroAnoMeta}
  `);

  const previsaoRow = ((previsaoResult[0] as unknown) as any[])?.[0] ?? {};
  const irogRow = ((irogResult[0] as unknown) as any[])?.[0] ?? {};

  const toNumberOrNull = (value: unknown) => {
    if (value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const round2 = (value: number | null) => (value === null ? null : Number(value.toFixed(2)));

  const mape = round2(toNumberOrNull(previsaoRow.mapeMedio));
  const wmape = round2(toNumberOrNull(previsaoRow.wmapePonderado));
  const bias = round2(toNumberOrNull(previsaoRow.biasPercentual));
  const irog = round2(toNumberOrNull(irogRow.irogMedio));
  const acuracidade = wmape === null ? null : round2(100 - wmape);
  const totalPrevisoes = Number(previsaoRow.totalPrevisoes || 0);

  return { mape, wmape, bias, acuracidade, irog, totalPrevisoes };
}

// ==================== DASHBOARD QUERIES ====================
export async function getDashboardDemanda() {
  const db = await getDb();
  if (!db) return { totalVendas: 0, totalClientes: 0, totalProdutos: 0 };
  
  const [vendasCount] = await db.select({ count: sql<number>`count(*)` }).from(vendas);
  const [clientesCount] = await db.select({ count: sql<number>`count(*)` }).from(clientes);
  const [produtosCount] = await db.select({ count: sql<number>`count(*)` }).from(produtos);
  
  return {
    totalVendas: vendasCount?.count || 0,
    totalClientes: clientesCount?.count || 0,
    totalProdutos: produtosCount?.count || 0,
  };
}

export async function getVendasPorMes(ano: number) {
  const db = await getDb();
  if (!db) return [];
  
  const result = await db.execute(sql`
    SELECT 
      MONTH(dataNf) as mes,
      SUM(receitaBruta) as receita,
      SUM(quantidade) as quantidade
    FROM vendas 
    WHERE YEAR(dataNf) = ${ano}
    GROUP BY MONTH(dataNf)
    ORDER BY mes
  `);
  
  return (result[0] as unknown) as { mes: number; receita: string; quantidade: string }[];
}

// ==================== ROTEIROS ====================
export async function listRoteiros(produtoId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (produtoId) {
    return db.select().from(roteiros).where(eq(roteiros.produtoId, produtoId)).orderBy(roteiros.sequencia);
  }
  return db.select().from(roteiros).orderBy(roteiros.produtoId, roteiros.sequencia);
}

export async function createRoteiro(data: InsertRoteiro) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(roteiros).values(data);
  return { id: result[0].insertId };
}

export async function updateRoteiro(id: number, data: Partial<InsertRoteiro>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(roteiros).set(data).where(eq(roteiros.id, id));
}

export async function deleteRoteiro(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(roteiros).where(eq(roteiros.id, id));
}


// ==================== FATURAMENTO ====================
export async function listFaturamento(limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(faturamento).orderBy(desc(faturamento.dataEmissao)).limit(limit);
}

export async function createFaturamento(data: InsertFaturamento) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(faturamento).values(data);
  return { id: result[0].insertId };
}

export async function createFaturamentoBatch(data: InsertFaturamento[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (data.length === 0) return { count: 0 };
  
  // Inserir em lotes de 500 para evitar timeout
  const batchSize = 500;
  let totalInserted = 0;
  
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    await db.insert(faturamento).values(batch);
    totalInserted += batch.length;
  }
  
  return { count: totalInserted };
}

export async function deleteFaturamento(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(faturamento).where(eq(faturamento.id, id));
}

export async function clearFaturamento() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(faturamento);
  return { success: true };
}

export async function getFaturamentoStats() {
  const db = await getDb();
  if (!db) return { totalRegistros: 0, totalValor: 0, totalQtd: 0 };
  
  const [stats] = await db.select({
    totalRegistros: sql<number>`count(*)`,
    totalValor: sql<string>`COALESCE(SUM(valorTotal), 0)`,
    totalQtd: sql<string>`COALESCE(SUM(qtd), 0)`,
  }).from(faturamento);
  
  return {
    totalRegistros: stats?.totalRegistros || 0,
    totalValor: parseFloat(stats?.totalValor || "0"),
    totalQtd: parseFloat(stats?.totalQtd || "0"),
  };
}

export async function getFaturamentoPorMes(ano: number) {
  const db = await getDb();
  if (!db) return [];
  
  const result = await db.execute(sql`
    SELECT 
      MONTH(dataEmissao) as mes,
      SUM(CASE WHEN tipoFaturamento = 'SAIDA' THEN valorTotal ELSE -valorTotal END) as receita,
      SUM(CASE WHEN tipoFaturamento = 'SAIDA' THEN qtd ELSE -qtd END) as quantidade,
      COUNT(*) as registros
    FROM faturamento 
    WHERE YEAR(dataEmissao) = ${ano}
    GROUP BY MONTH(dataEmissao)
    ORDER BY mes
  `);
  
  return (result[0] as unknown) as { mes: number; receita: string; quantidade: string; registros: number }[];
}


// ==================== STATUS CADASTRO ====================
export async function listStatusCadastro() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(statusCadastro).orderBy(statusCadastro.nome);
}

export async function createStatusCadastro(data: InsertStatusCadastro) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(statusCadastro).values(data);
  return { id: result[0].insertId };
}

export async function updateStatusCadastro(id: number, data: Partial<InsertStatusCadastro>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(statusCadastro).set(data).where(eq(statusCadastro.id, id));
}

export async function deleteStatusCadastro(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(statusCadastro).where(eq(statusCadastro.id, id));
}

export async function createStatusCadastroBatch(data: InsertStatusCadastro[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (data.length === 0) return { count: 0 };
  await db.insert(statusCadastro).values(data);
  return { count: data.length };
}

// ==================== TIPOS NEGÓCIO ====================
export async function listTiposNegocio() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tiposNegocio).orderBy(tiposNegocio.nome);
}

export async function createTipoNegocio(data: InsertTipoNegocio) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(tiposNegocio).values(data);
  return { id: result[0].insertId };
}

export async function updateTipoNegocio(id: number, data: Partial<InsertTipoNegocio>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(tiposNegocio).set(data).where(eq(tiposNegocio.id, id));
}

export async function deleteTipoNegocio(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(tiposNegocio).where(eq(tiposNegocio.id, id));
}

export async function createTiposNegocioBatch(data: InsertTipoNegocio[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (data.length === 0) return { count: 0 };
  await db.insert(tiposNegocio).values(data);
  return { count: data.length };
}

// ==================== TIPOS ESTOQUE ====================
export async function listTiposEstoque() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tiposEstoque).orderBy(tiposEstoque.nome);
}

export async function createTipoEstoque(data: InsertTipoEstoque) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(tiposEstoque).values(data);
  return { id: result[0].insertId };
}

export async function updateTipoEstoque(id: number, data: Partial<InsertTipoEstoque>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(tiposEstoque).set(data).where(eq(tiposEstoque.id, id));
}

export async function deleteTipoEstoque(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(tiposEstoque).where(eq(tiposEstoque.id, id));
}

export async function createTiposEstoqueBatch(data: InsertTipoEstoque[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (data.length === 0) return { count: 0 };
  await db.insert(tiposEstoque).values(data);
  return { count: data.length };
}

// ==================== LINHAS ====================
export async function listLinhas() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(linhas).orderBy(linhas.nome);
}

export async function createLinha(data: InsertLinha) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(linhas).values(data);
  return { id: result[0].insertId };
}

export async function updateLinha(id: number, data: Partial<InsertLinha>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(linhas).set(data).where(eq(linhas.id, id));
}

export async function deleteLinha(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(linhas).where(eq(linhas.id, id));
}

export async function createLinhasBatch(data: InsertLinha[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (data.length === 0) return { count: 0 };
  await db.insert(linhas).values(data);
  return { count: data.length };
}

// ==================== MODELOS ====================
export async function listModelos() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(modelos).orderBy(modelos.nome);
}

export async function createModelo(data: InsertModelo) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(modelos).values(data);
  return { id: result[0].insertId };
}

export async function updateModelo(id: number, data: Partial<InsertModelo>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(modelos).set(data).where(eq(modelos.id, id));
}

export async function deleteModelo(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(modelos).where(eq(modelos.id, id));
}

export async function createModelosBatch(data: InsertModelo[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (data.length === 0) return { count: 0 };
  await db.insert(modelos).values(data);
  return { count: data.length };
}

// ==================== TAMANHOS ====================
export async function listTamanhos() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tamanhos).orderBy(tamanhos.ordem, tamanhos.nome);
}

export async function createTamanho(data: InsertTamanho) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(tamanhos).values(data);
  return { id: result[0].insertId };
}

export async function updateTamanho(id: number, data: Partial<InsertTamanho>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(tamanhos).set(data).where(eq(tamanhos.id, id));
}

export async function deleteTamanho(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(tamanhos).where(eq(tamanhos.id, id));
}

export async function createTamanhosBatch(data: InsertTamanho[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (data.length === 0) return { count: 0 };
  await db.insert(tamanhos).values(data);
  return { count: data.length };
}


// ==================== MARCAS ====================
export async function listMarcas() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(marcas).orderBy(marcas.nome);
}

export async function createMarca(data: InsertMarca) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(marcas).values(data);
  return { id: result[0].insertId };
}

export async function updateMarca(id: number, data: Partial<InsertMarca>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(marcas).set(data).where(eq(marcas.id, id));
}

export async function deleteMarca(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(marcas).where(eq(marcas.id, id));
}

export async function createMarcasBatch(data: InsertMarca[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (data.length === 0) return { count: 0 };
  await db.insert(marcas).values(data);
  return { count: data.length };
}

// ==================== GESTORES COMERCIAIS ====================
export async function listGestores() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(gestores).orderBy(gestores.nome);
}

export async function createGestor(data: InsertGestor) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(gestores).values(data);
  return { id: result[0].insertId };
}

export async function updateGestor(id: number, data: Partial<InsertGestor>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(gestores).set(data).where(eq(gestores.id, id));
}

export async function deleteGestor(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(gestores).where(eq(gestores.id, id));
}

export async function createGestoresBatch(data: InsertGestor[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (data.length === 0) return { count: 0 };
  await db.insert(gestores).values(data);
  return { count: data.length };
}

// ==================== RELACIONAMENTO GESTOR x MARCA ====================
export async function listGestorMarca() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(gestorMarca).orderBy(gestorMarca.id);
}

export async function listGestorMarcaComDetalhes() {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: gestorMarca.id,
    gestorId: gestorMarca.gestorId,
    gestorNome: gestores.nome,
    marcaId: gestorMarca.marcaId,
    marcaNome: marcas.nome,
    dataInicio: gestorMarca.dataInicio,
    dataFim: gestorMarca.dataFim,
    ativo: gestorMarca.ativo,
    createdAt: gestorMarca.createdAt,
    updatedAt: gestorMarca.updatedAt,
  })
  .from(gestorMarca)
  .leftJoin(gestores, eq(gestorMarca.gestorId, gestores.id))
  .leftJoin(marcas, eq(gestorMarca.marcaId, marcas.id))
  .orderBy(gestores.nome, marcas.nome);
}

export async function createGestorMarca(data: InsertGestorMarca) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(gestorMarca).values(data);
  return { id: result[0].insertId };
}

export async function updateGestorMarca(id: number, data: Partial<InsertGestorMarca>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(gestorMarca).set(data).where(eq(gestorMarca.id, id));
}

export async function deleteGestorMarca(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(gestorMarca).where(eq(gestorMarca.id, id));
}

// ==================== DE-PARA DE CÓDIGOS ====================
export async function listDeParaCodigos() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(deParaCodigos).orderBy(deParaCodigos.skuAntigo);
}

export async function createDeParaCodigo(data: InsertDeParaCodigo) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(deParaCodigos).values(data);
  return { id: result[0].insertId };
}

export async function updateDeParaCodigo(id: number, data: Partial<InsertDeParaCodigo>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(deParaCodigos).set(data).where(eq(deParaCodigos.id, id));
}

export async function deleteDeParaCodigo(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(deParaCodigos).where(eq(deParaCodigos.id, id));
}

export async function createDeParaCodigosBatch(data: InsertDeParaCodigo[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (data.length === 0) return { count: 0 };
  await db.insert(deParaCodigos).values(data);
  return { count: data.length };
}

// Função para obter o código atual de um produto (seguindo a cadeia de De-Para)
export async function getCodigoAtual(codigoOriginal: string): Promise<string> {
  const db = await getDb();
  if (!db) return codigoOriginal;
  
  let codigoAtual = codigoOriginal;
  let encontrou = true;
  
  while (encontrou) {
    const [dePara] = await db.select()
      .from(deParaCodigos)
      .where(eq(deParaCodigos.skuAntigo, codigoAtual))
      .limit(1);
    
    if (dePara) {
      codigoAtual = dePara.skuNovo;
    } else {
      encontrou = false;
    }
  }
  
  return codigoAtual;
}


// ==================== VENDAS CONSOLIDADAS COM DE-PARA ====================

// Função para obter vendas consolidadas por código atual (aplicando De-Para)
export async function getVendasConsolidadasPorProduto(ano: number) {
  const db = await getDb();
  if (!db) return [];
  
  // Primeiro, buscar todas as vendas do ano
  const vendas = await db.select({
    codMaterial: faturamento.codMaterial,
    quantidade: faturamento.qtd,
    valorTotal: faturamento.valorTotal,
    mes: sql<number>`MONTH(${faturamento.dataEmissao})`,
  })
  .from(faturamento)
  .where(sql`YEAR(${faturamento.dataEmissao}) = ${ano}`);
  
  // Mapear códigos antigos para códigos atuais
  const consolidado: Record<string, { codigoAtual: string; quantidade: number; valorTotal: number; meses: Record<number, { quantidade: number; valor: number }> }> = {};
  
  for (const venda of vendas) {
    const codigoOriginal = venda.codMaterial || '';
    const codigoAtual = await getCodigoAtual(codigoOriginal);
    
    if (!consolidado[codigoAtual]) {
      consolidado[codigoAtual] = {
        codigoAtual,
        quantidade: 0,
        valorTotal: 0,
        meses: {},
      };
    }
    
    const qtd = typeof venda.quantidade === 'number' ? venda.quantidade : parseInt(String(venda.quantidade)) || 0;
    const valor = parseFloat(String(venda.valorTotal) || '0');
    const mes = venda.mes;
    
    consolidado[codigoAtual].quantidade += qtd;
    consolidado[codigoAtual].valorTotal += valor;
    
    if (!consolidado[codigoAtual].meses[mes]) {
      consolidado[codigoAtual].meses[mes] = { quantidade: 0, valor: 0 };
    }
    consolidado[codigoAtual].meses[mes].quantidade += qtd;
    consolidado[codigoAtual].meses[mes].valor += valor;
  }
  
  return Object.values(consolidado);
}

// Função para obter vendas por mês consolidadas com De-Para
export async function getVendasPorMesConsolidadas(ano: number) {
  const db = await getDb();
  if (!db) return [];
  
  // Buscar todas as vendas do ano da tabela de faturamento
  const vendas = await db.select({
    codMaterial: faturamento.codMaterial,
    quantidade: faturamento.qtd,
    valorTotal: faturamento.valorTotal,
    mes: sql<number>`MONTH(${faturamento.dataEmissao})`,
  })
  .from(faturamento)
  .where(sql`YEAR(${faturamento.dataEmissao}) = ${ano}`);
  
  // Consolidar por mês (aplicando De-Para)
  const porMes: Record<number, { receita: number; quantidade: number }> = {};
  
  for (let i = 1; i <= 12; i++) {
    porMes[i] = { receita: 0, quantidade: 0 };
  }
  
  for (const venda of vendas) {
    const mes = venda.mes;
    const qtd = typeof venda.quantidade === 'number' ? venda.quantidade : parseInt(String(venda.quantidade)) || 0;
    const valor = parseFloat(String(venda.valorTotal) || '0');
    
    porMes[mes].receita += valor;
    porMes[mes].quantidade += qtd;
  }
  
  return Object.entries(porMes).map(([mes, dados]) => ({
    mes: parseInt(mes),
    receita: dados.receita.toFixed(2),
    quantidade: dados.quantidade.toString(),
  }));
}

// Função para obter vendas por marca consolidadas
export async function getVendasPorMarca(ano: number) {
  const db = await getDb();
  if (!db) return [];
  
  const result = await db.execute(sql`
    SELECT 
      marca,
      SUM(valorTotal) as receita,
      SUM(qtd) as quantidade
    FROM faturamento 
    WHERE YEAR(dataEmissao) = ${ano} AND marca IS NOT NULL AND marca != ''
    GROUP BY marca
    ORDER BY receita DESC
    LIMIT 10
  `);
  
  return (result[0] as unknown) as { marca: string; receita: string; quantidade: string }[];
}

// Função para obter vendas por linha de produto
export async function getVendasPorLinha(ano: number) {
  const db = await getDb();
  if (!db) return [];
  
  const result = await db.execute(sql`
    SELECT 
      linhaProduto as linha,
      SUM(valorTotal) as receita,
      SUM(qtd) as quantidade
    FROM faturamento 
    WHERE YEAR(dataEmissao) = ${ano} AND linhaProduto IS NOT NULL AND linhaProduto != ''
    GROUP BY linhaProduto
    ORDER BY receita DESC
  `);
  
  return (result[0] as unknown) as { linha: string; receita: string; quantidade: string }[];
}

// Função para obter vendas por UF
export async function getVendasPorUF(ano: number) {
  const db = await getDb();
  if (!db) return [];
  
  const result = await db.execute(sql`
    SELECT 
      uf,
      SUM(valorTotal) as receita,
      SUM(qtd) as quantidade
    FROM faturamento 
    WHERE YEAR(dataEmissao) = ${ano} AND uf IS NOT NULL AND uf != ''
    GROUP BY uf
    ORDER BY receita DESC
  `);
  
  return (result[0] as unknown) as { uf: string; receita: string; quantidade: string }[];
}


// ==================== NÍVEIS DE ACESSO ====================

export async function getAllNiveisAcesso() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(niveisAcesso).orderBy(niveisAcesso.nivel);
}

export async function getNivelAcessoById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(niveisAcesso).where(eq(niveisAcesso.id, id)).limit(1);
  return result[0] || null;
}

export async function getNivelAcessoByNivel(nivel: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(niveisAcesso).where(eq(niveisAcesso.nivel, nivel)).limit(1);
  return result[0] || null;
}

export async function createNivelAcesso(data: InsertNivelAcesso) {
  const db = await getDb();
  if (!db) return;
  await db.insert(niveisAcesso).values(data);
}

export async function updateNivelAcesso(id: number, data: Partial<InsertNivelAcesso>) {
  const db = await getDb();
  if (!db) return;
  await db.update(niveisAcesso).set(data).where(eq(niveisAcesso.id, id));
}

export async function deleteNivelAcesso(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(niveisAcesso).where(eq(niveisAcesso.id, id));
}

// ==================== GERENCIAMENTO DE USUÁRIOS ====================

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).orderBy(users.name);
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0] || null;
}

export async function updateUserNivelAcesso(userId: number, nivelAcesso: number, ativo: boolean = true) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ nivelAcesso, ativo }).where(eq(users.id, userId));
}

export async function updateUserAtivo(userId: number, ativo: boolean) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ ativo }).where(eq(users.id, userId));
}

export async function deleteUser(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível");
  
  // Primeiro remove as associações de marca do usuário
  await db.delete(usuarioMarcas).where(eq(usuarioMarcas.userId, userId));
  
  // Depois remove o usuário
  await db.delete(users).where(eq(users.id, userId));
  
  return { success: true };
}

export async function updateUserData(userId: number, data: { name?: string; email?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível");
  
  // Verificar se email já existe em outro usuário
  if (data.email) {
    const existing = await db.select().from(users).where(eq(users.email, data.email)).limit(1);
    if (existing.length > 0 && existing[0].id !== userId) {
      throw new Error("Já existe outro usuário com este email");
    }
  }
  
  await db.update(users).set(data).where(eq(users.id, userId));
  
  return { success: true };
}

export async function createUser(data: { name: string; email: string; nivelAcesso?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível");
  
  // Verificar se email já existe
  const existing = await db.select().from(users).where(eq(users.email, data.email)).limit(1);
  if (existing.length > 0) {
    throw new Error("Já existe um usuário com este email");
  }
  
  // Criar usuário com openId temporário (será atualizado no primeiro login)
  const openId = `temp_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  
  await db.insert(users).values({
    openId,
    name: data.name,
    email: data.email,
    nivelAcesso: data.nivelAcesso || 1,
    ativo: true,
  });
  
  return { success: true };
}

// ==================== USUÁRIO-MARCA ====================

export async function getUsuarioMarcas(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(usuarioMarcas).where(eq(usuarioMarcas.userId, userId));
}

export async function getAllUsuarioMarcas() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(usuarioMarcas);
}

export async function addUsuarioMarca(userId: number, marcaId: number) {
  const db = await getDb();
  if (!db) return;
  // Verificar se já existe
  const existing = await db.select().from(usuarioMarcas)
    .where(and(eq(usuarioMarcas.userId, userId), eq(usuarioMarcas.marcaId, marcaId)))
    .limit(1);
  if (existing.length === 0) {
    await db.insert(usuarioMarcas).values({ userId, marcaId });
  }
}

export async function removeUsuarioMarca(userId: number, marcaId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(usuarioMarcas).where(
    and(eq(usuarioMarcas.userId, userId), eq(usuarioMarcas.marcaId, marcaId))
  );
}

export async function setUsuarioMarcas(userId: number, marcaIds: number[]) {
  const db = await getDb();
  if (!db) return;
  // Remover todas as marcas do usuário
  await db.delete(usuarioMarcas).where(eq(usuarioMarcas.userId, userId));
  // Adicionar as novas marcas
  for (const marcaId of marcaIds) {
    await db.insert(usuarioMarcas).values({ userId, marcaId });
  }
}

// Função para obter marcas permitidas para um usuário
export async function getMarcasPermitidas(userId: number, nivelAcesso: number) {
  const db = await getDb();
  if (!db) return [];
  
  // Nível 2 e 3 podem ver todas as marcas
  if (nivelAcesso >= 2) {
    return db.select().from(marcas).orderBy(marcas.nome);
  }
  
  // Nível 1 só vê as marcas associadas
  const userMarcas = await db.select({ marcaId: usuarioMarcas.marcaId })
    .from(usuarioMarcas)
    .where(eq(usuarioMarcas.userId, userId));
  
  if (userMarcas.length === 0) return [];
  
  const marcaIds = userMarcas.map(um => um.marcaId);
  const result = await db.select().from(marcas);
  return result.filter(m => marcaIds.includes(m.id));
}

// Inicializar níveis de acesso padrão
export async function initNiveisAcessoPadrao() {
  const db = await getDb();
  if (!db) return;
  
  const niveis = [
    { nivel: 1, nome: 'Gestor', descricao: 'Visualiza apenas dados das marcas que gerencia', podeEditarCadastros: false, podeVerTodasMarcas: false, podeGerenciarUsuarios: false },
    { nivel: 2, nome: 'Gerente Comercial', descricao: 'Visualiza todas as marcas, mas não edita cadastros', podeEditarCadastros: false, podeVerTodasMarcas: true, podeGerenciarUsuarios: false },
    { nivel: 3, nome: 'Master/Admin', descricao: 'Acesso total ao sistema', podeEditarCadastros: true, podeVerTodasMarcas: true, podeGerenciarUsuarios: true },
  ];
  
  for (const nivel of niveis) {
    const existing = await db.select().from(niveisAcesso).where(eq(niveisAcesso.nivel, nivel.nivel)).limit(1);
    if (existing.length === 0) {
      await db.insert(niveisAcesso).values(nivel);
    }
  }
}

// ==================== TURNOS ====================
export async function listTurnos() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(turnos).orderBy(turnos.turnoHora);
}

export async function createTurno(data: InsertTurno) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(turnos).values(data);
  return { id: result[0].insertId };
}

export async function updateTurno(id: number, data: Partial<InsertTurno>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(turnos).set(data).where(eq(turnos.id, id));
}

export async function deleteTurno(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(turnos).where(eq(turnos.id, id));
}

// ==================== RECURSOS MENSAIS ====================
export async function listRecursosMensais(ano: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(recursosMensais).where(eq(recursosMensais.ano, ano));
}

export async function listRecursosMensaisByRecurso(recursoId: number, ano: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(recursosMensais)
    .where(and(
      eq(recursosMensais.recursoId, recursoId),
      eq(recursosMensais.ano, ano)
    ));
}

export async function saveRecursoMensal(data: { recursoId: number; ano: number; mes: number; turnoId: number; horasManutencao?: number; horasExtras?: number; velocidadeLiquida?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Verificar se já existe configuração para este recurso/ano/mês
  const existing = await db.select().from(recursosMensais)
    .where(and(
      eq(recursosMensais.recursoId, data.recursoId),
      eq(recursosMensais.ano, data.ano),
      eq(recursosMensais.mes, data.mes)
    ))
    .limit(1);
  
  const updateData: { turnoId: number; horasManutencao?: string; horasExtras?: string; velocidadeLiquida?: string } = { turnoId: data.turnoId };
  if (data.horasManutencao !== undefined) {
    updateData.horasManutencao = data.horasManutencao.toString();
  }
  if (data.horasExtras !== undefined) {
    updateData.horasExtras = data.horasExtras.toString();
  }
  if (data.velocidadeLiquida !== undefined) {
    updateData.velocidadeLiquida = data.velocidadeLiquida.toString();
  }
  
  if (existing.length > 0) {
    // Atualizar
    await db.update(recursosMensais)
      .set(updateData)
      .where(eq(recursosMensais.id, existing[0].id));
    return { id: existing[0].id };
  } else {
    // Inserir
    const insertData: {
      recursoId: number;
      ano: number;
      mes: number;
      turnoId: number;
      horasManutencao: string;
      horasExtras: string;
      velocidadeLiquida?: string;
    } = {
      recursoId: data.recursoId,
      ano: data.ano,
      mes: data.mes,
      turnoId: data.turnoId,
      horasManutencao: data.horasManutencao?.toString() || "0",
      horasExtras: data.horasExtras?.toString() || "0",
    };
    if (data.velocidadeLiquida !== undefined) {
      insertData.velocidadeLiquida = data.velocidadeLiquida.toString();
    }
    const result = await db.insert(recursosMensais).values(insertData);
    return { id: result[0].insertId };
  }
}

export async function clearRecursosMensais(recursoId: number, ano: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(recursosMensais)
    .where(and(
      eq(recursosMensais.recursoId, recursoId),
      eq(recursosMensais.ano, ano)
    ));
  return { success: true };
}


// ==================== FLUXOS ====================
export async function listFluxos() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(fluxos).orderBy(fluxos.nome);
}

export async function getFluxoById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(fluxos).where(eq(fluxos.id, id)).limit(1);
  return result[0] || null;
}

export async function createFluxo(data: InsertFluxo) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(fluxos).values(data);
  return { id: result[0].insertId };
}

export async function updateFluxo(id: number, data: Partial<InsertFluxo>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(fluxos).set(data).where(eq(fluxos.id, id));
}

export async function deleteFluxo(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Primeiro remove os relacionamentos
  await db.delete(fluxoRecursos).where(eq(fluxoRecursos.fluxoId, id));
  // Depois remove o fluxo
  await db.delete(fluxos).where(eq(fluxos.id, id));
}

// ==================== FLUXO-RECURSOS ====================
export async function listFluxoRecursos(fluxoId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(fluxoRecursos)
    .where(eq(fluxoRecursos.fluxoId, fluxoId))
    .orderBy(fluxoRecursos.ordem);
}

export async function addRecursoToFluxo(fluxoId: number, recursoId: number, ordem: number = 0) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Verificar se já existe
  const existing = await db.select().from(fluxoRecursos)
    .where(and(
      eq(fluxoRecursos.fluxoId, fluxoId),
      eq(fluxoRecursos.recursoId, recursoId)
    ))
    .limit(1);
  
  if (existing.length > 0) {
    return { id: existing[0].id };
  }
  
  const result = await db.insert(fluxoRecursos).values({ fluxoId, recursoId, ordem });
  return { id: result[0].insertId };
}

export async function removeRecursoFromFluxo(fluxoId: number, recursoId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(fluxoRecursos).where(and(
    eq(fluxoRecursos.fluxoId, fluxoId),
    eq(fluxoRecursos.recursoId, recursoId)
  ));
}

export async function setFluxoRecursos(fluxoId: number, recursoIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Remove todos os recursos existentes do fluxo
  await db.delete(fluxoRecursos).where(eq(fluxoRecursos.fluxoId, fluxoId));
  
  // Adiciona os novos recursos
  if (recursoIds.length > 0) {
    const values = recursoIds.map((recursoId, index) => ({
      fluxoId,
      recursoId,
      ordem: index,
    }));
    await db.insert(fluxoRecursos).values(values);
  }
}

export async function getFluxosComRecursos() {
  const db = await getDb();
  if (!db) return [];
  
  const allFluxos = await db.select().from(fluxos).orderBy(fluxos.nome);
  const allRecursos = await db.select().from(recursos).orderBy(recursos.nome);
  const allRelations = await db.select().from(fluxoRecursos);
  
  return allFluxos.map(fluxo => ({
    ...fluxo,
    recursos: allRelations
      .filter(r => r.fluxoId === fluxo.id)
      .sort((a, b) => (a.ordem || 0) - (b.ordem || 0))
      .map(r => allRecursos.find(rec => rec.id === r.recursoId))
      .filter(Boolean),
  }));
}

// ==================== PREVISAO PYTHON JOBS ====================
let _previsaoJobsTableReady = false;

async function ensurePrevisaoPythonJobsTable() {
  if (_previsaoJobsTableReady) return;
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS previsao_python_jobs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      status ENUM('PENDING','RUNNING','SUCCESS','ERROR') NOT NULL DEFAULT 'PENDING',
      scriptVersion VARCHAR(50) NOT NULL DEFAULT 'v5.2',
      createdBy VARCHAR(320) NULL,
      vendasFileName VARCHAR(255) NOT NULL,
      previstoFileName VARCHAR(255) NULL,
      clientesFileName VARCHAR(255) NULL,
      outputFileName VARCHAR(255) NULL,
      workdir VARCHAR(500) NULL,
      logPath VARCHAR(500) NULL,
      message TEXT NULL,
      exitCode INT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      startedAt TIMESTAMP NULL DEFAULT NULL,
      finishedAt TIMESTAMP NULL DEFAULT NULL
    )
  `);

  _previsaoJobsTableReady = true;
}

export async function listPrevisaoPythonJobs(limit = 20) {
  const db = await getDb();
  if (!db) return [];
  await ensurePrevisaoPythonJobsTable();
  return db.select().from(previsaoPythonJobs).orderBy(desc(previsaoPythonJobs.id)).limit(limit);
}

export async function listPrevisaoPythonJobsByStatus(
  status: "PENDING" | "RUNNING" | "SUCCESS" | "ERROR",
  limit = 200
) {
  const db = await getDb();
  if (!db) return [];
  await ensurePrevisaoPythonJobsTable();
  return db
    .select()
    .from(previsaoPythonJobs)
    .where(eq(previsaoPythonJobs.status, status))
    .orderBy(desc(previsaoPythonJobs.id))
    .limit(limit);
}

export async function getPrevisaoPythonJobById(id: number) {
  const db = await getDb();
  if (!db) return null;
  await ensurePrevisaoPythonJobsTable();
  const result = await db.select().from(previsaoPythonJobs).where(eq(previsaoPythonJobs.id, id)).limit(1);
  return result[0] || null;
}

export async function createPrevisaoPythonJob(data: InsertPrevisaoPythonJob) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await ensurePrevisaoPythonJobsTable();
  const result = await db.insert(previsaoPythonJobs).values(data);
  return { id: result[0].insertId };
}

export async function updatePrevisaoPythonJob(id: number, data: Partial<InsertPrevisaoPythonJob>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await ensurePrevisaoPythonJobsTable();
  await db.update(previsaoPythonJobs).set(data).where(eq(previsaoPythonJobs.id, id));
}

function getAffectedRowsFromResult(result: unknown) {
  if (!result) return 0;

  if (typeof result === "object" && result !== null) {
    const direct = result as Record<string, unknown>;
    const directAffected = Number(direct.affectedRows ?? direct.rowsAffected ?? 0);
    if (Number.isFinite(directAffected) && directAffected > 0) return directAffected;
  }

  if (Array.isArray(result)) {
    for (const item of result) {
      if (typeof item === "object" && item !== null) {
        const row = item as Record<string, unknown>;
        const affected = Number(row.affectedRows ?? row.rowsAffected ?? 0);
        if (Number.isFinite(affected) && affected > 0) return affected;
      }
    }
  }

  return 0;
}

export async function claimPrevisaoPythonJob(
  id: number,
  message = "Iniciando execucao do script Python..."
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await ensurePrevisaoPythonJobsTable();

  const result = await db
    .update(previsaoPythonJobs)
    .set({
      status: "RUNNING",
      startedAt: new Date(),
      finishedAt: null,
      exitCode: null,
      message,
    })
    .where(and(eq(previsaoPythonJobs.id, id), eq(previsaoPythonJobs.status, "PENDING")));

  return getAffectedRowsFromResult(result) > 0;
}

let _previsaoScenarioSnapshotsTableReady = false;

async function ensurePrevisaoPythonScenarioSnapshotsTable() {
  if (_previsaoScenarioSnapshotsTableReady) return;
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS previsao_python_scenario_snapshots (
      id INT AUTO_INCREMENT PRIMARY KEY,
      jobId INT NOT NULL,
      cicloRef VARCHAR(80) NOT NULL,
      horizonteRef VARCHAR(40) NULL,
      titulo VARCHAR(140) NULL,
      observacoes TEXT NULL,
      summaryJson MEDIUMTEXT NOT NULL,
      dataJson LONGTEXT NOT NULL,
      createdBy VARCHAR(320) NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_previsao_scenario_job_created (jobId, createdAt),
      INDEX idx_previsao_scenario_ciclo (cicloRef)
    )
  `);

  _previsaoScenarioSnapshotsTableReady = true;
}

export async function listPrevisaoPythonScenarioSnapshots(jobId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  await ensurePrevisaoPythonScenarioSnapshotsTable();
  const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
  return db
    .select()
    .from(previsaoPythonScenarioSnapshots)
    .where(eq(previsaoPythonScenarioSnapshots.jobId, jobId))
    .orderBy(desc(previsaoPythonScenarioSnapshots.createdAt), desc(previsaoPythonScenarioSnapshots.id))
    .limit(safeLimit);
}

export async function getPrevisaoPythonScenarioSnapshotById(id: number) {
  const db = await getDb();
  if (!db) return null;
  await ensurePrevisaoPythonScenarioSnapshotsTable();
  const result = await db
    .select()
    .from(previsaoPythonScenarioSnapshots)
    .where(eq(previsaoPythonScenarioSnapshots.id, id))
    .limit(1);
  return result[0] || null;
}

export async function createPrevisaoPythonScenarioSnapshot(
  data: InsertPrevisaoPythonScenarioSnapshot
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await ensurePrevisaoPythonScenarioSnapshotsTable();
  const result = await db.insert(previsaoPythonScenarioSnapshots).values(data);
  return { id: result[0].insertId };
}

export async function updatePrevisaoPythonScenarioSnapshot(
  id: number,
  data: Partial<InsertPrevisaoPythonScenarioSnapshot>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await ensurePrevisaoPythonScenarioSnapshotsTable();
  await db
    .update(previsaoPythonScenarioSnapshots)
    .set(data)
    .where(eq(previsaoPythonScenarioSnapshots.id, id));
}
