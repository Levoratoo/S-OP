import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, boolean, date } from "drizzle-orm/mysql-core";

// ==================== USUÁRIOS ====================
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  // Nível de acesso: 1=Gestor (vê só suas marcas), 2=Gerente (vê tudo, não edita), 3=Master (acesso total)
  nivelAcesso: int("nivelAcesso").default(1).notNull(),
  ativo: boolean("ativo").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ==================== NÍVEIS DE ACESSO ====================
export const niveisAcesso = mysqlTable("niveis_acesso", {
  id: int("id").autoincrement().primaryKey(),
  nivel: int("nivel").notNull().unique(),
  nome: varchar("nome", { length: 50 }).notNull(),
  descricao: text("descricao"),
  podeEditarCadastros: boolean("podeEditarCadastros").default(false).notNull(),
  podeVerTodasMarcas: boolean("podeVerTodasMarcas").default(false).notNull(),
  podeGerenciarUsuarios: boolean("podeGerenciarUsuarios").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type NivelAcesso = typeof niveisAcesso.$inferSelect;
export type InsertNivelAcesso = typeof niveisAcesso.$inferInsert;

// ==================== USUÁRIO-MARCA (Relacionamento) ====================
export const usuarioMarcas = mysqlTable("usuario_marcas", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  marcaId: int("marcaId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type UsuarioMarca = typeof usuarioMarcas.$inferSelect;
export type InsertUsuarioMarca = typeof usuarioMarcas.$inferInsert;

// ==================== FAMÍLIAS ====================
export const familias = mysqlTable("familias", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 100 }).notNull(),
  descricao: text("descricao"),
  tipo: mysqlEnum("tipo", ["MTS", "MTO"]).default("MTS").notNull(),
  ativo: boolean("ativo").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Familia = typeof familias.$inferSelect;
export type InsertFamilia = typeof familias.$inferInsert;

// ==================== SUBFAMÍLIAS ====================
export const subfamilias = mysqlTable("subfamilias", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 100 }).notNull(),
  familiaId: int("familiaId").notNull(),
  ativo: boolean("ativo").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Subfamilia = typeof subfamilias.$inferSelect;
export type InsertSubfamilia = typeof subfamilias.$inferInsert;

// ==================== TABELAS AUXILIARES ====================

// Status (Ativo, Inativo)
export const statusCadastro = mysqlTable("status_cadastro", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 50 }).notNull().unique(),
  descricao: text("descricao"),
  ativo: boolean("ativo").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type StatusCadastro = typeof statusCadastro.$inferSelect;
export type InsertStatusCadastro = typeof statusCadastro.$inferInsert;

// Tipo Negócio (JIT, PRG, VAR)
export const tiposNegocio = mysqlTable("tipos_negocio", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 50 }).notNull().unique(),
  descricao: text("descricao"),
  ativo: boolean("ativo").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TipoNegocio = typeof tiposNegocio.$inferSelect;
export type InsertTipoNegocio = typeof tiposNegocio.$inferInsert;

// Tipo Estoque (MTS, MTO)
export const tiposEstoque = mysqlTable("tipos_estoque", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 50 }).notNull().unique(),
  descricao: text("descricao"),
  ativo: boolean("ativo").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TipoEstoque = typeof tiposEstoque.$inferSelect;
export type InsertTipoEstoque = typeof tiposEstoque.$inferInsert;

// Linha (Adicionais, Automática, Classic, Elegance, etc.)
export const linhas = mysqlTable("linhas", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 100 }).notNull().unique(),
  descricao: text("descricao"),
  ativo: boolean("ativo").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Linha = typeof linhas.$inferSelect;
export type InsertLinha = typeof linhas.$inferInsert;

// Modelo (Adicionais, Caixa, Saco, Sacola, Serviço, Envelope)
export const modelos = mysqlTable("modelos", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 100 }).notNull().unique(),
  descricao: text("descricao"),
  ativo: boolean("ativo").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Modelo = typeof modelos.$inferSelect;
export type InsertModelo = typeof modelos.$inferInsert;

// ==================== TAMANHOS ====================
export const tamanhos = mysqlTable("tamanhos", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 50 }).notNull().unique(),
  descricao: text("descricao"),
  ordem: int("ordem").default(0), // Para ordenar PP, P, M, G, GG
  ativo: boolean("ativo").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Tamanho = typeof tamanhos.$inferSelect;
export type InsertTamanho = typeof tamanhos.$inferInsert;

// ==================== PRODUTOS ====================
export const produtos = mysqlTable("produtos", {
  id: int("id").autoincrement().primaryKey(),
  codItem: varchar("codItem", { length: 50 }).unique(), // Código do item (99.99.999999)
  descricao: varchar("descricao", { length: 300 }), // Descrição do produto
  status: mysqlEnum("status", ["ATIVO", "INATIVO"]).default("ATIVO").notNull(),
  statusId: int("statusId"), // Referência para tabela status_cadastro
  tipoNegocio: varchar("tipoNegocio", { length: 50 }), // JIT, PRG, VAR
  tipoNegocioId: int("tipoNegocioId"), // Referência para tabela tipos_negocio
  tipoEstoque: mysqlEnum("tipoEstoque", ["MTS", "MTO"]).default("MTS"),
  tipoEstoqueId: int("tipoEstoqueId"), // Referência para tabela tipos_estoque
  linha: varchar("linha", { length: 100 }), // Classic, Automática, Elegance
  linhaId: int("linhaId"), // Referência para tabela linhas
  modelo: varchar("modelo", { length: 100 }), // Sacola, Caixa, Adicionais
  modeloId: int("modeloId"), // Referência para tabela modelos
  tamanho: varchar("tamanho", { length: 50 }), // PP, P, M, G, GG
  tamanhoId: int("tamanhoId"), // Referência para tabela tamanhos
  axlxp: varchar("axlxp", { length: 50 }), // Dimensões: 165 x 130 x 65
  marca: varchar("marca", { length: 100 }),
  marcaId: int("marcaId"), // Referência para tabela marcas
  grupo: varchar("grupo", { length: 100 }),
  ramoAtuacao: varchar("ramoAtuacao", { length: 100 }),
  valorVenda: decimal("valorVenda", { precision: 15, scale: 2 }),
  valorCusto: decimal("valorCusto", { precision: 15, scale: 2 }),
  qtdePallet: int("qtdePallet"),
  loteEconomicoViavel: int("loteEconomicoViavel"),
  fluxo: varchar("fluxo", { length: 100 }),
  fluxoId: int("fluxoId"), // Referência para tabela fluxos
  caminho: text("caminho"), // Recursos do fluxo (preenchido automaticamente)
  pista: int("pista"),
  // Campos legados para compatibilidade
  codigo: varchar("codigo", { length: 50 }),
  nome: varchar("nome", { length: 200 }),
  familiaId: int("familiaId"),
  subfamiliaId: int("subfamiliaId"),
  unidade: varchar("unidade", { length: 20 }).default("UN"),
  /** Se false, SKU não entra na estatística (usa projeção comercial/cliente). */
  projetarEstatistica: boolean("projetarEstatistica").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Produto = typeof produtos.$inferSelect;
export type InsertProduto = typeof produtos.$inferInsert;

// ==================== CLIENTES ====================
export const clientes = mysqlTable("clientes", {
  id: int("id").autoincrement().primaryKey(),
  codigo: varchar("codigo", { length: 50 }),
  razaoSocial: varchar("razaoSocial", { length: 200 }).notNull(),
  nomeFantasia: varchar("nomeFantasia", { length: 200 }),
  cnpjCpf: varchar("cnpjCpf", { length: 20 }).unique(),
  clienteRelacionadoId: int("clienteRelacionadoId"),
  cidade: varchar("cidade", { length: 100 }),
  estado: varchar("estado", { length: 2 }),
  status: mysqlEnum("status", ["ATIVO", "INATIVO"]).default("ATIVO").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Cliente = typeof clientes.$inferSelect;
export type InsertCliente = typeof clientes.$inferInsert;

// ==================== RECURSOS (MÁQUINAS/EQUIPAMENTOS) ====================
export const recursos = mysqlTable("recursos", {
  id: int("id").autoincrement().primaryKey(),
  tipo: mysqlEnum("tipo", ["Intermediário", "Acabamento"]).default("Intermediário").notNull(), // Tipo do recurso
  tipoExecucao: mysqlEnum("tipoExecucao", ["Interno", "Externo"]).default("Interno").notNull(), // Tipo de Execução
  tipoAcabamento: varchar("tipoAcabamento", { length: 100 }), // Enobrecimento, Impressão, Acabamento, Manuseio
  linhaProducao: mysqlEnum("linhaProducao", ["Offset", "Flexo", "Terceiro"]).default("Offset"), // Linha de Produção
  linhaProduto: varchar("linhaProduto", { length: 100 }), // Automática, Classic, Evolution, Elegance, Fundo Q, Fundo V, etc.
  grupoTrabalho: varchar("grupoTrabalho", { length: 100 }), // Corte Vinco, Guilhotina, Automática 1, etc.
  nome: varchar("nome", { length: 100 }).notNull(), // Nome do Recurso (Desbobinadeira, Imp CD, etc.)
  velocidadeLiquida: decimal("velocidadeLiquida", { precision: 10, scale: 2 }), // Velocidade líquida para cálculo de capacidade (unidades/hora)
  ativo: boolean("ativo").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Recurso = typeof recursos.$inferSelect;
export type InsertRecurso = typeof recursos.$inferInsert;

// ==================== CONFIGURAÇÃO MENSAL DE RECURSOS ====================
export const recursosMensais = mysqlTable("recursos_mensais", {
  id: int("id").autoincrement().primaryKey(),
  recursoId: int("recursoId").notNull(), // Referência para tabela recursos
  ano: int("ano").notNull(),
  mes: int("mes").notNull(), // 1-12
  turnoId: int("turnoId").notNull(), // Referência para tabela turnos
  horasManutencao: decimal("horasManutencao", { precision: 6, scale: 2 }).default("0"), // Horas de manutenção previstas no mês
  horasExtras: decimal("horasExtras", { precision: 6, scale: 2 }).default("0"), // Horas extras previstas no mês
  velocidadeLiquida: decimal("velocidadeLiquida", { precision: 10, scale: 2 }), // Velocidade líquida ajustada para o mês (pode diferir do recurso)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type RecursoMensal = typeof recursosMensais.$inferSelect;
export type InsertRecursoMensal = typeof recursosMensais.$inferInsert;

// ==================== DIAS ÚTEIS ====================
// tipoDias: 'seg-sex' (5 dias), 'seg-sab' (6 dias), '7-dias' (todos os dias)
export const diasUteis = mysqlTable("dias_uteis", {
  id: int("id").autoincrement().primaryKey(),
  ano: int("ano").notNull(),
  mes: int("mes").notNull(),
  tipoDias: varchar("tipoDias", { length: 20 }).default("seg-sex").notNull(), // seg-sex, seg-sab, 7-dias
  diasUteis: int("diasUteis").notNull(),
  feriados: int("feriados").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DiaUtil = typeof diasUteis.$inferSelect;
export type InsertDiaUtil = typeof diasUteis.$inferInsert;

// ==================== TURNOS ====================
export const turnos = mysqlTable("turnos", {
  id: int("id").autoincrement().primaryKey(),
  turnoHora: varchar("turnoHora", { length: 50 }).notNull().unique(), // s/ turno, Comercial, 1/8, 2/8, 3/8, 1/10, 2/10, 12/36
  horasTrabalho: varchar("horasTrabalho", { length: 10 }).notNull(), // 00:00, 08:00, 10:00, 12:00
  horasRefeicao: varchar("horasRefeicao", { length: 10 }).default("01:00"), // 00:00, 01:00
  horasTrabalhadas: varchar("horasTrabalhadas", { length: 10 }).default("07:00"), // Horas de trabalho - Horas de refeição (horas úteis)
  diasTrabalhados: varchar("diasTrabalhados", { length: 50 }).notNull(), // segunda - sexta, segunda - sábado, Domingo - Domingo
  horaExtra: boolean("horaExtra").default(false).notNull(), // sim/não
  ativo: boolean("ativo").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Turno = typeof turnos.$inferSelect;
export type InsertTurno = typeof turnos.$inferInsert;

// ==================== ROTEIROS DE PRODUÇÃO ====================
export const roteiros = mysqlTable("roteiros", {
  id: int("id").autoincrement().primaryKey(),
  produtoId: int("produtoId").notNull(),
  sequencia: int("sequencia").notNull(),
  atividade: varchar("atividade", { length: 200 }).notNull(),
  recursoId: int("recursoId"),
  tempoOperacaoMin: int("tempoOperacaoMin").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Roteiro = typeof roteiros.$inferSelect;
export type InsertRoteiro = typeof roteiros.$inferInsert;

// ==================== HIERARQUIAS COMERCIAIS ====================
export const hierarquias = mysqlTable("hierarquias", {
  id: int("id").autoincrement().primaryKey(),
  codigo: varchar("codigo", { length: 50 }).notNull().unique(),
  mercado: varchar("mercado", { length: 100 }),
  canalVenda: varchar("canalVenda", { length: 100 }),
  forcaVenda: varchar("forcaVenda", { length: 100 }),
  zonaVenda: varchar("zonaVenda", { length: 100 }),
  membroId: int("membroId"),
  ativo: boolean("ativo").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Hierarquia = typeof hierarquias.$inferSelect;
export type InsertHierarquia = typeof hierarquias.$inferInsert;

// ==================== MEMBROS (VENDEDORES/REPRESENTANTES) ====================
export const membros = mysqlTable("membros", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 200 }).notNull(),
  funcao: varchar("funcao", { length: 100 }),
  email: varchar("email", { length: 320 }),
  areaEmpresa: varchar("areaEmpresa", { length: 100 }),
  hierarquiaId: int("hierarquiaId"),
  ativo: boolean("ativo").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Membro = typeof membros.$inferSelect;
export type InsertMembro = typeof membros.$inferInsert;

// ==================== PARADAS DE PRODUÇÃO ====================
export const paradas = mysqlTable("paradas", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 200 }).notNull(),
  programada: boolean("programada").default(false),
  tempoMinutos: int("tempoMinutos").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Parada = typeof paradas.$inferSelect;
export type InsertParada = typeof paradas.$inferInsert;

// ==================== METAS DE PRODUÇÃO ====================
export const metasProducao = mysqlTable("metas_producao", {
  id: int("id").autoincrement().primaryKey(),
  ano: int("ano").notNull(),
  mes: int("mes").notNull(),
  recursoId: int("recursoId").notNull(),
  disponibilidadeMeta: decimal("disponibilidadeMeta", { precision: 5, scale: 2 }),
  performanceMeta: decimal("performanceMeta", { precision: 5, scale: 2 }),
  qualidadeMeta: decimal("qualidadeMeta", { precision: 5, scale: 2 }),
  irogMeta: decimal("irogMeta", { precision: 5, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MetaProducao = typeof metasProducao.$inferSelect;
export type InsertMetaProducao = typeof metasProducao.$inferInsert;

// ==================== FATURAMENTO (BASE PRINCIPAL DE VENDAS) ====================
export const faturamento = mysqlTable("faturamento", {
  id: int("id").autoincrement().primaryKey(),
  // Dados da NF
  dataEmissao: date("dataEmissao").notNull(),
  nfNumero: varchar("nfNumero", { length: 50 }),
  // Dados do Cliente
  codCliente: varchar("codCliente", { length: 50 }),
  cnpj: varchar("cnpj", { length: 20 }),
  // Localização
  unidade: varchar("unidade", { length: 100 }), // Franquia, Loja Própria, Multimarcas
  cidade: varchar("cidade", { length: 100 }),
  uf: varchar("uf", { length: 2 }),
  // Dados do Produto
  marca: varchar("marca", { length: 100 }),
  codMaterial: varchar("codMaterial", { length: 50 }),
  descricaoItem: varchar("descricaoItem", { length: 300 }),
  // Classificação
  tipoNegocio: varchar("tipoNegocio", { length: 50 }), // JIT, PRG, VAR
  tipoEstoque: mysqlEnum("tipoEstoque", ["MTS", "MTO"]),
  linhaProduto: varchar("linhaProduto", { length: 100 }), // Automática, Classic, Elegance
  // Valores
  qtd: decimal("qtd", { precision: 15, scale: 4 }).notNull(),
  valorTotal: decimal("valorTotal", { precision: 15, scale: 2 }).notNull(),
  // Responsável
  gestor: varchar("gestor", { length: 200 }),
  // Fiscal
  cfop: varchar("cfop", { length: 10 }),
  descCfop: varchar("descCfop", { length: 200 }),
  tipoFaturamento: mysqlEnum("tipoFaturamento", ["DEVOLUCAO", "SAIDA"]).default("SAIDA"),
  // Controle
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Faturamento = typeof faturamento.$inferSelect;
export type InsertFaturamento = typeof faturamento.$inferInsert;

// ==================== VENDAS (LEGADO - MANTER COMPATIBILIDADE) ====================
export const vendas = mysqlTable("vendas", {
  id: int("id").autoincrement().primaryKey(),
  nfNumero: varchar("nfNumero", { length: 50 }),
  sequencia: int("sequencia").default(1),
  dataNf: date("dataNf").notNull(),
  quantidade: decimal("quantidade", { precision: 15, scale: 4 }).notNull(),
  receitaBruta: decimal("receitaBruta", { precision: 15, scale: 2 }).notNull(),
  produtoId: int("produtoId").notNull(),
  clienteId: int("clienteId"),
  membroId: int("membroId"),
  canalVenda: varchar("canalVenda", { length: 100 }),
  forcaVenda: varchar("forcaVenda", { length: 100 }),
  zonaVenda: varchar("zonaVenda", { length: 100 }),
  codigoPedido: varchar("codigoPedido", { length: 50 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Venda = typeof vendas.$inferSelect;
export type InsertVenda = typeof vendas.$inferInsert;

// ==================== CARTEIRA DE PEDIDOS ====================
export const carteiraPedidos = mysqlTable("carteira_pedidos", {
  id: int("id").autoincrement().primaryKey(),
  codigo: varchar("codigo", { length: 50 }).notNull(),
  sequencia: int("sequencia").default(1).notNull(),
  competencia: date("competencia").notNull(),
  quantidade: decimal("quantidade", { precision: 15, scale: 4 }).notNull(),
  receitaBruta: decimal("receitaBruta", { precision: 15, scale: 2 }).notNull(),
  produtoId: int("produtoId").notNull(),
  clienteId: int("clienteId"),
  faturado: boolean("faturado").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CarteiraPedido = typeof carteiraPedidos.$inferSelect;
export type InsertCarteiraPedido = typeof carteiraPedidos.$inferInsert;

// ==================== FORECAST ====================
export const forecasts = mysqlTable("forecasts", {
  id: int("id").autoincrement().primaryKey(),
  codigo: varchar("codigo", { length: 50 }),
  competencia: date("competencia").notNull(),
  canalVenda: varchar("canalVenda", { length: 100 }),
  clienteId: int("clienteId"),
  receitaBruta: decimal("receitaBruta", { precision: 15, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Forecast = typeof forecasts.$inferSelect;
export type InsertForecast = typeof forecasts.$inferInsert;

// ==================== ORÇAMENTO ====================
export const orcamentos = mysqlTable("orcamentos", {
  id: int("id").autoincrement().primaryKey(),
  ano: int("ano").notNull(),
  mes: int("mes").notNull(),
  familiaId: int("familiaId"),
  valorMeta: decimal("valorMeta", { precision: 15, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Orcamento = typeof orcamentos.$inferSelect;
export type InsertOrcamento = typeof orcamentos.$inferInsert;

// ==================== PREVISÕES ====================
export const previsoes = mysqlTable("previsoes", {
  id: int("id").autoincrement().primaryKey(),
  produtoId: int("produtoId"),
  familiaId: int("familiaId"),
  ano: int("ano").notNull(),
  mes: int("mes").notNull(),
  valorPrevisto: decimal("valorPrevisto", { precision: 15, scale: 2 }).notNull(),
  modeloUtilizado: varchar("modeloUtilizado", { length: 100 }),
  mape: decimal("mape", { precision: 5, scale: 2 }),
  wmape: decimal("wmape", { precision: 5, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Previsao = typeof previsoes.$inferSelect;
export type InsertPrevisao = typeof previsoes.$inferInsert;

// ==================== COLABORAÇÕES ====================
export const colaboracoes = mysqlTable("colaboracoes", {
  id: int("id").autoincrement().primaryKey(),
  ano: int("ano").notNull(),
  ciclo: int("ciclo").notNull(),
  colaborador: mysqlEnum("colaborador", ["COMERCIAL", "MARKETING", "PLANEJAMENTO", "FINANCEIRO"]).notNull(),
  status: mysqlEnum("status", ["PENDENTE", "EM_ANDAMENTO", "APROVADO", "REJEITADO"]).default("PENDENTE").notNull(),
  observacoes: text("observacoes"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Colaboracao = typeof colaboracoes.$inferSelect;
export type InsertColaboracao = typeof colaboracoes.$inferInsert;

// ==================== CONSENSOS ====================
export const consensos = mysqlTable("consensos", {
  id: int("id").autoincrement().primaryKey(),
  ano: int("ano").notNull(),
  ciclo: int("ciclo").notNull(),
  status: mysqlEnum("status", ["ABERTO", "EM_REVISAO", "APROVADO", "FECHADO"]).default("ABERTO").notNull(),
  dataAprovacao: timestamp("dataAprovacao"),
  observacoes: text("observacoes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Consenso = typeof consensos.$inferSelect;
export type InsertConsenso = typeof consensos.$inferInsert;


// ==================== MARCAS ====================
export const marcas = mysqlTable("marcas", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 100 }).notNull(),
  grupoMarca: varchar("grupoMarca", { length: 100 }),
  ramoAtuacao: varchar("ramoAtuacao", { length: 100 }),
  ativo: boolean("ativo").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Marca = typeof marcas.$inferSelect;
export type InsertMarca = typeof marcas.$inferInsert;

// ==================== GESTORES COMERCIAIS ====================
export const gestores = mysqlTable("gestores", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 200 }).notNull(),
  email: varchar("email", { length: 320 }),
  telefone: varchar("telefone", { length: 20 }),
  ativo: boolean("ativo").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Gestor = typeof gestores.$inferSelect;
export type InsertGestor = typeof gestores.$inferInsert;

// ==================== RELACIONAMENTO GESTOR x MARCA ====================
export const gestorMarca = mysqlTable("gestor_marca", {
  id: int("id").autoincrement().primaryKey(),
  gestorId: int("gestorId").notNull(),
  marcaId: int("marcaId").notNull(),
  dataInicio: date("dataInicio"),
  dataFim: date("dataFim"),
  ativo: boolean("ativo").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type GestorMarca = typeof gestorMarca.$inferSelect;
export type InsertGestorMarca = typeof gestorMarca.$inferInsert;

// ==================== DE-PARA DE CÓDIGOS DE ITEM ====================
export const deParaCodigos = mysqlTable("de_para_codigos", {
  id: int("id").autoincrement().primaryKey(),
  skuAntigo: varchar("sku_antigo", { length: 100 }).notNull().unique(),
  skuNovo: varchar("sku_novo", { length: 100 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type DeParaCodigo = typeof deParaCodigos.$inferSelect;
export type InsertDeParaCodigo = typeof deParaCodigos.$inferInsert;


// ==================== CONFIGURAÇÃO SHAREPOINT ====================
export const sharepointConfig = mysqlTable("sharepoint_config", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: varchar("tenantId", { length: 100 }),
  clientId: varchar("clientId", { length: 100 }),
  clientSecret: text("clientSecret"),
  siteUrl: varchar("siteUrl", { length: 500 }),
  folderPath: varchar("folderPath", { length: 500 }),
  arquivoProdutos: varchar("arquivoProdutos", { length: 255 }).default("produtos.xlsx"),
  arquivoFaturamento: varchar("arquivoFaturamento", { length: 255 }).default("faturamento.xlsx"),
  arquivoClientes: varchar("arquivoClientes", { length: 255 }).default("clientes.xlsx"),
  intervaloHoras: int("intervaloHoras").default(6),
  ativo: boolean("ativo").default(false).notNull(),
  ultimaSincronizacao: timestamp("ultimaSincronizacao"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SharepointConfig = typeof sharepointConfig.$inferSelect;
export type InsertSharepointConfig = typeof sharepointConfig.$inferInsert;

// ==================== LOGS DE SINCRONIZAÇÃO ====================
export const syncLogs = mysqlTable("sync_logs", {
  id: int("id").autoincrement().primaryKey(),
  tipo: mysqlEnum("tipo", ["produtos", "faturamento", "clientes", "todos"]).notNull(),
  status: mysqlEnum("status", ["iniciado", "sucesso", "erro", "parcial"]).notNull(),
  registrosProcessados: int("registrosProcessados").default(0),
  registrosInseridos: int("registrosInseridos").default(0),
  registrosAtualizados: int("registrosAtualizados").default(0),
  registrosErro: int("registrosErro").default(0),
  mensagem: text("mensagem"),
  detalhesErro: text("detalhesErro"),
  arquivoOrigem: varchar("arquivoOrigem", { length: 255 }),
  duracaoSegundos: int("duracaoSegundos"),
  executadoPor: varchar("executadoPor", { length: 100 }).default("sistema"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SyncLog = typeof syncLogs.$inferSelect;
export type InsertSyncLog = typeof syncLogs.$inferInsert;


// ==================== FLUXOS DE PRODUÇÃO ====================
export const fluxos = mysqlTable("fluxos", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 100 }).notNull().unique(), // Fluxo 01, Fluxo 02, etc.
  descricao: text("descricao"),
  ativo: boolean("ativo").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Fluxo = typeof fluxos.$inferSelect;
export type InsertFluxo = typeof fluxos.$inferInsert;

// ==================== FLUXO-RECURSO (Relacionamento) ====================
export const fluxoRecursos = mysqlTable("fluxo_recursos", {
  id: int("id").autoincrement().primaryKey(),
  fluxoId: int("fluxoId").notNull(), // Referência para tabela fluxos
  recursoId: int("recursoId").notNull(), // Referência para tabela recursos
  ordem: int("ordem").default(0), // Ordem do recurso no fluxo
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FluxoRecurso = typeof fluxoRecursos.$inferSelect;
export type InsertFluxoRecurso = typeof fluxoRecursos.$inferInsert;

// ==================== JOBS PREVISAO PYTHON ====================
export const previsaoPythonJobs = mysqlTable("previsao_python_jobs", {
  id: int("id").autoincrement().primaryKey(),
  status: mysqlEnum("status", ["PENDING", "RUNNING", "SUCCESS", "ERROR"]).default("PENDING").notNull(),
  scriptVersion: varchar("scriptVersion", { length: 50 }).default("v5.2-COMPLETO").notNull(),
  scriptHash: varchar("scriptHash", { length: 64 }),
  inputMetadataJson: text("inputMetadataJson"),
  createdBy: varchar("createdBy", { length: 320 }),
  vendasFileName: varchar("vendasFileName", { length: 255 }).notNull(),
  previstoFileName: varchar("previstoFileName", { length: 255 }),
  clientesFileName: varchar("clientesFileName", { length: 255 }),
  outputFileName: varchar("outputFileName", { length: 255 }),
  workdir: varchar("workdir", { length: 500 }),
  logPath: varchar("logPath", { length: 500 }),
  message: text("message"),
  exitCode: int("exitCode"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  startedAt: timestamp("startedAt"),
  finishedAt: timestamp("finishedAt"),
});

export type PrevisaoPythonJob = typeof previsaoPythonJobs.$inferSelect;
export type InsertPrevisaoPythonJob = typeof previsaoPythonJobs.$inferInsert;

export const previsaoPythonScenarioSnapshots = mysqlTable("previsao_python_scenario_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  jobId: int("jobId").notNull(),
  cicloRef: varchar("cicloRef", { length: 80 }).notNull(),
  horizonteRef: varchar("horizonteRef", { length: 40 }),
  titulo: varchar("titulo", { length: 140 }),
  observacoes: text("observacoes"),
  summaryJson: text("summaryJson").notNull(),
  dataJson: text("dataJson").notNull(),
  createdBy: varchar("createdBy", { length: 320 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PrevisaoPythonScenarioSnapshot = typeof previsaoPythonScenarioSnapshots.$inferSelect;
export type InsertPrevisaoPythonScenarioSnapshot =
  typeof previsaoPythonScenarioSnapshots.$inferInsert;

// ==================== SAZONALIDADE POR MARCA (Passo 3) ====================
export const sazonalidadeMarca = mysqlTable("sazonalidade_marca", {
  id: int("id").autoincrement().primaryKey(),
  marcaId: int("marcaId"),
  marcaNome: varchar("marcaNome", { length: 100 }).notNull(),
  mes: int("mes").notNull(), // 1-12
  percentual: decimal("percentual", { precision: 8, scale: 6 }).notNull(), // fração 0-1
  anoReferencia: int("anoReferencia"),
  observacoes: text("observacoes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SazonalidadeMarca = typeof sazonalidadeMarca.$inferSelect;
export type InsertSazonalidadeMarca = typeof sazonalidadeMarca.$inferInsert;

// ==================== CICLO COMERCIAL S&OP ====================
export const ciclosComerciais = mysqlTable("ciclos_comerciais", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 140 }).notNull(),
  anoInicio: int("anoInicio").notNull(),
  mesInicio: int("mesInicio").notNull(), // 1-12
  horizonteMeses: int("horizonteMeses").default(12).notNull(),
  jobId: int("jobId"), // job Python origem (Visao_Executiva)
  status: mysqlEnum("status", ["ABERTO", "EM_COLABORACAO", "CONSOLIDADO", "FECHADO"])
    .default("ABERTO")
    .notNull(),
  observacoes: text("observacoes"),
  createdBy: varchar("createdBy", { length: 320 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CicloComercial = typeof ciclosComerciais.$inferSelect;
export type InsertCicloComercial = typeof ciclosComerciais.$inferInsert;

/** Linhas do ciclo: desagregação estatística + edição comercial (MTS/JITO/PV/CRM). */
export const cicloComercialItens = mysqlTable("ciclo_comercial_itens", {
  id: int("id").autoincrement().primaryKey(),
  cicloId: int("cicloId").notNull(),
  planoColab: mysqlEnum("planoColab", ["MTS", "JITO", "PV_MTO", "CRM"]).notNull(),
  sku: varchar("sku", { length: 80 }).notNull(),
  descricao: varchar("descricao", { length: 300 }),
  marca: varchar("marca", { length: 100 }),
  linha: varchar("linha", { length: 100 }),
  tipoEstoque: mysqlEnum("tipoEstoque", ["MTS", "MTO"]).default("MTS"),
  tipoMarcaLinha: varchar("tipoMarcaLinha", { length: 200 }), // ex. MTS-Adidas-Automática
  projetar: boolean("projetar").default(true).notNull(),
  rateio12m: decimal("rateio12m", { precision: 10, scale: 6 }),
  rateio6m: decimal("rateio6m", { precision: 10, scale: 6 }),
  rateioConsiderar: decimal("rateioConsiderar", { precision: 10, scale: 6 }),
  qtdeTotalEstatistica: decimal("qtdeTotalEstatistica", { precision: 15, scale: 2 }),
  /** Previsão estatística mensal (snapshot na desagregação). */
  e1: decimal("e1", { precision: 15, scale: 2 }),
  e2: decimal("e2", { precision: 15, scale: 2 }),
  e3: decimal("e3", { precision: 15, scale: 2 }),
  e4: decimal("e4", { precision: 15, scale: 2 }),
  e5: decimal("e5", { precision: 15, scale: 2 }),
  e6: decimal("e6", { precision: 15, scale: 2 }),
  e7: decimal("e7", { precision: 15, scale: 2 }),
  e8: decimal("e8", { precision: 15, scale: 2 }),
  e9: decimal("e9", { precision: 15, scale: 2 }),
  e10: decimal("e10", { precision: 15, scale: 2 }),
  e11: decimal("e11", { precision: 15, scale: 2 }),
  e12: decimal("e12", { precision: 15, scale: 2 }),
  /** Colaboração do vendedor (null = usa estatística e*). */
  m1: decimal("m1", { precision: 15, scale: 2 }),
  m2: decimal("m2", { precision: 15, scale: 2 }),
  m3: decimal("m3", { precision: 15, scale: 2 }),
  m4: decimal("m4", { precision: 15, scale: 2 }),
  m5: decimal("m5", { precision: 15, scale: 2 }),
  m6: decimal("m6", { precision: 15, scale: 2 }),
  m7: decimal("m7", { precision: 15, scale: 2 }),
  m8: decimal("m8", { precision: 15, scale: 2 }),
  m9: decimal("m9", { precision: 15, scale: 2 }),
  m10: decimal("m10", { precision: 15, scale: 2 }),
  m11: decimal("m11", { precision: 15, scale: 2 }),
  m12: decimal("m12", { precision: 15, scale: 2 }),
  qtdeColaborada: decimal("qtdeColaborada", { precision: 15, scale: 2 }),
  valorVendaSnapshot: decimal("valorVendaSnapshot", { precision: 15, scale: 2 }),
  familiaSnapshot: varchar("familiaSnapshot", { length: 120 }),
  gestorSnapshot: varchar("gestorSnapshot", { length: 160 }),
  crmCard: varchar("crmCard", { length: 120 }),
  crmTipo: varchar("crmTipo", { length: 40 }),
  crmTemperatura: varchar("crmTemperatura", { length: 20 }),
  crmCliente: varchar("crmCliente", { length: 160 }),
  crmOrcamento: decimal("crmOrcamento", { precision: 15, scale: 2 }),
  origem: mysqlEnum("origem", ["ESTATISTICA", "MANUAL", "CRM", "PV"]).default("ESTATISTICA").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CicloComercialItem = typeof cicloComercialItens.$inferSelect;
export type InsertCicloComercialItem = typeof cicloComercialItens.$inferInsert;
