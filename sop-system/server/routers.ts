import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import path from "node:path";
import fs from "node:fs";
import * as db from "./db";
import * as sharepoint from "./sharepoint";
import * as previsaoPythonService from "./previsaoPython";
import { importSystemCadastros } from "./services/system-cadastros-importer";
import { gerarBasesPrevisaoPython, PrevisaoEtlUserError } from "./services/previsao-etl";
import { seedDadosMestresOperacionais } from "./services/seed-mestres";
import {
  calcularSazonalidadeDoFaturamento,
  desagregarJobParaCicloComercial,
  parseSazonalidadeWorkbook,
  seedSazonalidadeUniformeSeVazia,
} from "./services/desagregacao";

function resolveDadosSistemaDir(explicit?: string): string {
  if (explicit?.trim()) return path.resolve(explicit.trim());
  const candidates = [
    process.env.SEED_CADASTROS_DIR,
    path.resolve(process.cwd(), "dados-sistema"),
    path.resolve(process.cwd(), "..", "dados sistema"),
  ].filter(Boolean) as string[];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return candidates[0] ?? path.resolve(process.cwd(), "dados-sistema");
}

async function runGerarBasesOrThrow(input?: { dataInicio?: string; dataFim?: string }) {
  try {
    return await gerarBasesPrevisaoPython(input);
  } catch (error) {
    if (error instanceof PrevisaoEtlUserError) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: error.message,
      });
    }
    throw error;
  }
}

export const appRouter = router({
  system: systemRouter,
  
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ==================== FAMÍLIAS ====================
  familias: router({
    list: protectedProcedure.query(() => db.listFamilias()),
    
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getFamiliaById(input.id)),
    
    create: protectedProcedure
      .input(z.object({
        nome: z.string().min(1),
        descricao: z.string().optional(),
        tipo: z.enum(["MTS", "MTO"]).default("MTS"),
        ativo: z.boolean().default(true),
      }))
      .mutation(({ input }) => db.createFamilia(input)),
    
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        nome: z.string().min(1).optional(),
        descricao: z.string().optional(),
        tipo: z.enum(["MTS", "MTO"]).optional(),
        ativo: z.boolean().optional(),
      }))
      .mutation(({ input }) => {
        const { id, ...data } = input;
        return db.updateFamilia(id, data);
      }),
    
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => db.deleteFamilia(input.id)),
  }),

  // ==================== SUBFAMÍLIAS ====================
  subfamilias: router({
    list: protectedProcedure
      .input(z.object({ familiaId: z.number().optional() }).optional())
      .query(({ input }) => db.listSubfamilias(input?.familiaId)),
    
    create: protectedProcedure
      .input(z.object({
        nome: z.string().min(1),
        familiaId: z.number(),
        ativo: z.boolean().default(true),
      }))
      .mutation(({ input }) => db.createSubfamilia(input)),
    
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        nome: z.string().min(1).optional(),
        familiaId: z.number().optional(),
        ativo: z.boolean().optional(),
      }))
      .mutation(({ input }) => {
        const { id, ...data } = input;
        return db.updateSubfamilia(id, data);
      }),
    
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => db.deleteSubfamilia(input.id)),
  }),

  // ==================== PRODUTOS ====================
  produtos: router({
    list: protectedProcedure.query(() => db.listProdutos()),
    
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getProdutoById(input.id)),
    
    create: protectedProcedure
      .input(z.object({
        codItem: z.string().optional(),
        descricao: z.string().optional(),
        status: z.enum(["ATIVO", "INATIVO"]).default("ATIVO"),
        statusId: z.number().optional(),
        tipoNegocio: z.string().optional(),
        tipoNegocioId: z.number().optional(),
        tipoEstoque: z.enum(["MTS", "MTO"]).default("MTS"),
        tipoEstoqueId: z.number().optional(),
        linha: z.string().optional(),
        linhaId: z.number().optional(),
        modelo: z.string().optional(),
        modeloId: z.number().optional(),
        tamanho: z.string().optional(),
        tamanhoId: z.number().optional(),
        axlxp: z.string().optional(),
        marca: z.string().optional(),
        marcaId: z.number().optional(),
        grupo: z.string().optional(),
        ramoAtuacao: z.string().optional(),
        valorVenda: z.string().optional(),
        valorCusto: z.string().optional(),
        qtdePallet: z.number().optional(),
        loteEconomicoViavel: z.number().optional(),
        fluxo: z.string().optional(),
        fluxoId: z.number().optional(),
        caminho: z.string().optional(),
        pista: z.number().optional(),
        projetarEstatistica: z.boolean().default(true),
      }))
      .mutation(({ input }) => db.createProduto(input)),
    
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        codItem: z.string().optional(),
        descricao: z.string().optional(),
        status: z.enum(["ATIVO", "INATIVO"]).optional(),
        statusId: z.number().optional(),
        tipoNegocio: z.string().optional(),
        tipoNegocioId: z.number().optional(),
        tipoEstoque: z.enum(["MTS", "MTO"]).optional(),
        tipoEstoqueId: z.number().optional(),
        linha: z.string().optional(),
        linhaId: z.number().optional(),
        modelo: z.string().optional(),
        modeloId: z.number().optional(),
        tamanho: z.string().optional(),
        tamanhoId: z.number().optional(),
        axlxp: z.string().optional(),
        marca: z.string().optional(),
        marcaId: z.number().optional(),
        grupo: z.string().optional(),
        ramoAtuacao: z.string().optional(),
        valorVenda: z.string().optional(),
        valorCusto: z.string().optional(),
        qtdePallet: z.number().optional(),
        loteEconomicoViavel: z.number().optional(),
        fluxo: z.string().optional(),
        fluxoId: z.number().optional(),
        caminho: z.string().optional(),
        pista: z.number().optional(),
        projetarEstatistica: z.boolean().optional(),
      }))
      .mutation(({ input }) => {
        const { id, ...data } = input;
        return db.updateProduto(id, data);
      }),
    
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => db.deleteProduto(input.id)),
    
    importBatch: protectedProcedure
      .input(z.array(z.object({
        codItem: z.string().optional(),
        descricao: z.string().optional(),
        status: z.enum(["ATIVO", "INATIVO"]).optional(),
        tipoNegocio: z.string().optional(),
        tipoEstoque: z.enum(["MTS", "MTO"]).optional(),
        linha: z.string().optional(),
        modelo: z.string().optional(),
        tamanho: z.string().optional(),
        axlxp: z.string().optional(),
        marca: z.string().optional(),
        grupo: z.string().optional(),
        ramoAtuacao: z.string().optional(),
        valorVenda: z.string().optional(),
        valorCusto: z.string().optional(),
        qtdePallet: z.number().optional(),
        loteEconomicoViavel: z.number().optional(),
        fluxo: z.string().optional(),
        caminho: z.string().optional(),
        pista: z.number().optional(),
      })))
      .mutation(({ input }) => db.createProdutosBatch(input)),
  }),

  // ==================== CLIENTES ====================
  clientes: router({
    list: protectedProcedure.query(() => db.listClientes()),
    
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getClienteById(input.id)),
    
    create: protectedProcedure
      .input(z.object({
        razaoSocial: z.string().min(1),
        nomeFantasia: z.string().optional(),
        cnpjCpf: z.string().optional(),
        clienteRelacionadoId: z.number().nullable().optional(),
        cidade: z.string().optional(),
        estado: z.string().max(2).optional(),
        status: z.enum(["ATIVO", "INATIVO"]).default("ATIVO"),
      }))
      .mutation(({ input }) => db.createCliente(input)),
    
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        razaoSocial: z.string().min(1).optional(),
        nomeFantasia: z.string().optional(),
        cnpjCpf: z.string().optional(),
        clienteRelacionadoId: z.number().nullable().optional(),
        cidade: z.string().optional(),
        estado: z.string().max(2).optional(),
        status: z.enum(["ATIVO", "INATIVO"]).optional(),
      }))
      .mutation(({ input }) => {
        const { id, ...data } = input;
        return db.updateCliente(id, data);
      }),
    
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => db.deleteCliente(input.id)),
  }),

  // ==================== RECURSOS ====================
  recursos: router({
    list: protectedProcedure.query(() => db.listRecursos()),
    
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getRecursoById(input.id)),
    
    create: protectedProcedure
      .input(z.object({
        tipo: z.enum(["Intermediário", "Acabamento"]).default("Intermediário"),
        tipoExecucao: z.enum(["Interno", "Externo"]).default("Interno"),
        tipoAcabamento: z.string().optional(),
        linhaProducao: z.enum(["Offset", "Flexo", "Terceiro"]).optional(),
        linhaProduto: z.string().optional(),
        grupoTrabalho: z.string().optional(),
        nome: z.string().min(1),
        velocidadeLiquida: z.number().optional(),
        ativo: z.boolean().default(true),
      }))
      .mutation(({ input }) => db.createRecurso(input)),
    
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        tipo: z.enum(["Intermediário", "Acabamento"]).optional(),
        tipoExecucao: z.enum(["Interno", "Externo"]).optional(),
        tipoAcabamento: z.string().optional(),
        linhaProducao: z.enum(["Offset", "Flexo", "Terceiro"]).optional(),
        linhaProduto: z.string().optional(),
        grupoTrabalho: z.string().optional(),
        nome: z.string().min(1).optional(),
        velocidadeLiquida: z.number().optional(),
        ativo: z.boolean().optional(),
      }))
      .mutation(({ input }) => {
        const { id, ...data } = input;
        return db.updateRecurso(id, data as Parameters<typeof db.updateRecurso>[1]);
      }),
    
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => db.deleteRecurso(input.id)),

    importBatch: protectedProcedure
      .input(z.array(z.object({
        tipo: z.enum(["Intermediário", "Acabamento"]).optional(),
        tipoExecucao: z.enum(["Interno", "Externo"]).optional(),
        tipoAcabamento: z.string().optional(),
        linhaProducao: z.enum(["Offset", "Flexo", "Terceiro"]).optional(),
        linhaProduto: z.string().optional(),
        grupoTrabalho: z.string().optional(),
        nome: z.string().min(1),
        velocidadeLiquida: z.number().optional(),
        ativo: z.boolean().optional(),
      })))
      .mutation(async ({ input }) => {
        const results = { created: 0, updated: 0, errors: 0 };
        for (const item of input) {
          try {
            // Buscar recurso existente pelo nome
            const existing = await db.getRecursoByNome(item.nome);
            if (existing) {
              // Atualizar recurso existente
              await db.updateRecurso(existing.id, {
                tipo: item.tipo,
                tipoExecucao: item.tipoExecucao,
                tipoAcabamento: item.tipoAcabamento,
                linhaProducao: item.linhaProducao,
                linhaProduto: item.linhaProduto,
                grupoTrabalho: item.grupoTrabalho,
                velocidadeLiquida: item.velocidadeLiquida,
                ativo: item.ativo,
              });
              results.updated++;
            } else {
              // Criar novo recurso
              await db.createRecurso({
                tipo: item.tipo || "Intermediário",
                tipoExecucao: item.tipoExecucao || "Interno",
                tipoAcabamento: item.tipoAcabamento,
                linhaProducao: item.linhaProducao,
                linhaProduto: item.linhaProduto,
                grupoTrabalho: item.grupoTrabalho,
                nome: item.nome,
                velocidadeLiquida: item.velocidadeLiquida,
                ativo: item.ativo ?? true,
              });
              results.created++;
            }
          } catch (error) {
            console.error("Erro ao importar recurso:", item.nome, error);
            results.errors++;
          }
        }
        return results;
      }),
  }),

  // ==================== DIAS ÚTEIS ====================
  diasUteis: router({
    list: protectedProcedure
      .input(z.object({ ano: z.number().optional() }).optional())
      .query(({ input }) => db.listDiasUteis(input?.ano)),
    
    create: protectedProcedure
      .input(z.object({
        ano: z.number(),
        mes: z.number().min(1).max(12),
        diasUteis: z.number(),
        feriados: z.number().default(0),
        tipoDias: z.enum(["seg-sex", "seg-sab", "7-dias"]).default("seg-sex"),
      }))
      .mutation(({ input }) => db.createDiaUtil(input)),
    
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        ano: z.number().optional(),
        mes: z.number().min(1).max(12).optional(),
        diasUteis: z.number().optional(),
        feriados: z.number().optional(),
        tipoDias: z.enum(["seg-sex", "seg-sab", "7-dias"]).optional(),
      }))
      .mutation(({ input }) => {
        const { id, ...data } = input;
        return db.updateDiaUtil(id, data);
      }),
    
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => db.deleteDiaUtil(input.id)),
  }),

  // ==================== HIERARQUIAS ====================
  hierarquias: router({
    list: protectedProcedure.query(() => db.listHierarquias()),
    
    create: protectedProcedure
      .input(z.object({
        codigo: z.string().min(1),
        mercado: z.string().optional(),
        canalVenda: z.string().optional(),
        forcaVenda: z.string().optional(),
        zonaVenda: z.string().optional(),
        membroId: z.number().nullable().optional(),
        ativo: z.boolean().default(true),
      }))
      .mutation(({ input }) => db.createHierarquia(input)),
    
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        codigo: z.string().min(1).optional(),
        mercado: z.string().optional(),
        canalVenda: z.string().optional(),
        forcaVenda: z.string().optional(),
        zonaVenda: z.string().optional(),
        membroId: z.number().nullable().optional(),
        ativo: z.boolean().optional(),
      }))
      .mutation(({ input }) => {
        const { id, ...data } = input;
        return db.updateHierarquia(id, data);
      }),
    
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => db.deleteHierarquia(input.id)),
  }),

  // ==================== MEMBROS ====================
  membros: router({
    list: protectedProcedure.query(() => db.listMembros()),
    
    create: protectedProcedure
      .input(z.object({
        nome: z.string().min(1),
        funcao: z.string().optional(),
        email: z.string().email().optional(),
        areaEmpresa: z.string().optional(),
        hierarquiaId: z.number().nullable().optional(),
        ativo: z.boolean().default(true),
      }))
      .mutation(({ input }) => db.createMembro(input)),
    
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        nome: z.string().min(1).optional(),
        funcao: z.string().optional(),
        email: z.string().email().optional(),
        areaEmpresa: z.string().optional(),
        hierarquiaId: z.number().nullable().optional(),
        ativo: z.boolean().optional(),
      }))
      .mutation(({ input }) => {
        const { id, ...data } = input;
        return db.updateMembro(id, data);
      }),
    
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => db.deleteMembro(input.id)),
  }),

  // ==================== PARADAS ====================
  paradas: router({
    list: protectedProcedure.query(() => db.listParadas()),
    
    create: protectedProcedure
      .input(z.object({
        nome: z.string().min(1),
        programada: z.boolean().default(false),
        tempoMinutos: z.number().default(0),
      }))
      .mutation(({ input }) => db.createParada(input)),
    
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        nome: z.string().min(1).optional(),
        programada: z.boolean().optional(),
        tempoMinutos: z.number().optional(),
      }))
      .mutation(({ input }) => {
        const { id, ...data } = input;
        return db.updateParada(id, data);
      }),
    
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => db.deleteParada(input.id)),
  }),

  // ==================== ROTEIROS ====================
  roteiros: router({
    list: protectedProcedure
      .input(z.object({ produtoId: z.number().optional() }).optional())
      .query(({ input }) => db.listRoteiros(input?.produtoId)),
    
    create: protectedProcedure
      .input(z.object({
        produtoId: z.number(),
        sequencia: z.number(),
        atividade: z.string().min(1),
        recursoId: z.number().nullable().optional(),
        tempoOperacaoMin: z.number().default(0),
      }))
      .mutation(({ input }) => db.createRoteiro(input)),
    
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        produtoId: z.number().optional(),
        sequencia: z.number().optional(),
        atividade: z.string().min(1).optional(),
        recursoId: z.number().nullable().optional(),
        tempoOperacaoMin: z.number().optional(),
      }))
      .mutation(({ input }) => {
        const { id, ...data } = input;
        return db.updateRoteiro(id, data);
      }),
    
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => db.deleteRoteiro(input.id)),
  }),

  // ==================== VENDAS ====================
  vendas: router({
    list: protectedProcedure
      .input(z.object({ limit: z.number().default(100) }).optional())
      .query(({ input }) => db.listVendas(input?.limit)),
    
    create: protectedProcedure
      .input(z.object({
        nfNumero: z.string().optional(),
        sequencia: z.number().default(1),
        dataNf: z.string(),
        quantidade: z.string(),
        receitaBruta: z.string(),
        produtoId: z.number(),
        clienteId: z.number().nullable().optional(),
        membroId: z.number().nullable().optional(),
        canalVenda: z.string().optional(),
        forcaVenda: z.string().optional(),
        zonaVenda: z.string().optional(),
        codigoPedido: z.string().optional(),
      }))
      .mutation(({ input }) => {
        const { dataNf, ...rest } = input;
        return db.createVenda({ ...rest, dataNf: new Date(dataNf) });
      }),
    
    importBatch: protectedProcedure
      .input(z.array(z.object({
        nfNumero: z.string().optional(),
        sequencia: z.number().default(1),
        dataNf: z.string(),
        quantidade: z.string(),
        receitaBruta: z.string(),
        produtoId: z.number(),
        clienteId: z.number().nullable().optional(),
        membroId: z.number().nullable().optional(),
        canalVenda: z.string().optional(),
        forcaVenda: z.string().optional(),
        zonaVenda: z.string().optional(),
        codigoPedido: z.string().optional(),
      })))
      .mutation(({ input }) => {
        const data = input.map(item => ({
          ...item,
          dataNf: new Date(item.dataNf),
        }));
        return db.createVendasBatch(data);
      }),
  }),

  // ==================== CARTEIRA DE PEDIDOS ====================
  carteiraPedidos: router({
    list: protectedProcedure
      .input(z.object({ limit: z.number().default(100) }).optional())
      .query(({ input }) => db.listCarteiraPedidos(input?.limit)),

    create: protectedProcedure
      .input(z.object({
        codigo: z.string().min(1),
        sequencia: z.number().default(1),
        competencia: z.string(),
        quantidade: z.string(),
        receitaBruta: z.string(),
        produtoId: z.number(),
        clienteId: z.number().nullable().optional(),
        faturado: z.boolean().default(false),
      }))
      .mutation(({ input }) => {
        const { competencia, ...rest } = input;
        return db.createCarteiraPedido({ ...rest, competencia: new Date(competencia) });
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        codigo: z.string().optional(),
        sequencia: z.number().optional(),
        competencia: z.string().optional(),
        quantidade: z.string().optional(),
        receitaBruta: z.string().optional(),
        produtoId: z.number().optional(),
        clienteId: z.number().nullable().optional(),
        faturado: z.boolean().optional(),
      }))
      .mutation(({ input }) => {
        const { id, competencia, ...rest } = input;
        return db.updateCarteiraPedido(id, {
          ...rest,
          competencia: competencia ? new Date(competencia) : undefined,
        });
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => db.deleteCarteiraPedido(input.id)),

    importBatch: protectedProcedure
      .input(z.array(z.object({
        codigo: z.string().min(1),
        sequencia: z.number().default(1),
        competencia: z.string(),
        quantidade: z.string(),
        receitaBruta: z.string(),
        produtoId: z.number(),
        clienteId: z.number().nullable().optional(),
        faturado: z.boolean().optional(),
      })))
      .mutation(({ input }) => {
        const data = input.map(item => ({
          ...item,
          competencia: new Date(item.competencia),
          faturado: item.faturado ?? false,
        }));
        return db.createCarteiraPedidosBatch(data);
      }),
  }),

  // ==================== FORECAST ====================
  forecasts: router({
    list: protectedProcedure
      .input(z.object({ limit: z.number().default(100) }).optional())
      .query(({ input }) => db.listForecasts(input?.limit)),

    create: protectedProcedure
      .input(z.object({
        codigo: z.string().optional(),
        competencia: z.string(),
        canalVenda: z.string().optional(),
        clienteId: z.number().nullable().optional(),
        receitaBruta: z.string(),
      }))
      .mutation(({ input }) => {
        const { competencia, ...rest } = input;
        return db.createForecast({ ...rest, competencia: new Date(competencia) });
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        codigo: z.string().optional(),
        competencia: z.string().optional(),
        canalVenda: z.string().optional(),
        clienteId: z.number().nullable().optional(),
        receitaBruta: z.string().optional(),
      }))
      .mutation(({ input }) => {
        const { id, competencia, ...rest } = input;
        return db.updateForecast(id, {
          ...rest,
          competencia: competencia ? new Date(competencia) : undefined,
        });
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => db.deleteForecast(input.id)),

    importBatch: protectedProcedure
      .input(z.array(z.object({
        codigo: z.string().optional(),
        competencia: z.string(),
        canalVenda: z.string().optional(),
        clienteId: z.number().nullable().optional(),
        receitaBruta: z.string(),
      })))
      .mutation(({ input }) => {
        const data = input.map(item => ({
          ...item,
          competencia: new Date(item.competencia),
        }));
        return db.createForecastsBatch(data);
      }),
  }),

  // ==================== ORCAMENTOS ====================
  orcamentos: router({
    list: protectedProcedure
      .input(z.object({ ano: z.number().optional() }).optional())
      .query(({ input }) => db.listOrcamentos(input?.ano)),

    create: protectedProcedure
      .input(z.object({
        ano: z.number(),
        mes: z.number().min(1).max(12),
        familiaId: z.number().nullable().optional(),
        valorMeta: z.string(),
      }))
      .mutation(({ input }) => db.createOrcamento(input)),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        ano: z.number().optional(),
        mes: z.number().min(1).max(12).optional(),
        familiaId: z.number().nullable().optional(),
        valorMeta: z.string().optional(),
      }))
      .mutation(({ input }) => {
        const { id, ...rest } = input;
        return db.updateOrcamento(id, rest);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => db.deleteOrcamento(input.id)),

    importBatch: protectedProcedure
      .input(z.array(z.object({
        ano: z.number(),
        mes: z.number().min(1).max(12),
        familiaId: z.number().nullable().optional(),
        valorMeta: z.string(),
      })))
      .mutation(({ input }) => db.createOrcamentosBatch(input)),
  }),

  // ==================== PREVISOES ====================
  previsoes: router({
    list: protectedProcedure
      .input(z.object({ ano: z.number().optional() }).optional())
      .query(({ input }) => db.listPrevisoes(input?.ano)),

    create: protectedProcedure
      .input(z.object({
        produtoId: z.number().nullable().optional(),
        familiaId: z.number().nullable().optional(),
        ano: z.number(),
        mes: z.number().min(1).max(12),
        valorPrevisto: z.string(),
        modeloUtilizado: z.string().optional(),
        mape: z.string().optional(),
        wmape: z.string().optional(),
      }))
      .mutation(({ input }) => db.createPrevisao(input)),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        produtoId: z.number().nullable().optional(),
        familiaId: z.number().nullable().optional(),
        ano: z.number().optional(),
        mes: z.number().min(1).max(12).optional(),
        valorPrevisto: z.string().optional(),
        modeloUtilizado: z.string().optional(),
        mape: z.string().optional(),
        wmape: z.string().optional(),
      }))
      .mutation(({ input }) => {
        const { id, ...rest } = input;
        return db.updatePrevisao(id, rest);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => db.deletePrevisao(input.id)),

    importBatch: protectedProcedure
      .input(z.array(z.object({
        produtoId: z.number().nullable().optional(),
        familiaId: z.number().nullable().optional(),
        ano: z.number(),
        mes: z.number().min(1).max(12),
        valorPrevisto: z.string(),
        modeloUtilizado: z.string().optional(),
        mape: z.string().optional(),
        wmape: z.string().optional(),
      })))
      .mutation(({ input }) => db.createPrevisoesBatch(input)),
  }),

  // ==================== COLABORACOES ====================
  colaboracoes: router({
    list: protectedProcedure
      .input(z.object({ ano: z.number().optional(), ciclo: z.number().optional() }).optional())
      .query(({ input }) => db.listColaboracoes(input?.ano, input?.ciclo)),

    create: protectedProcedure
      .input(z.object({
        ano: z.number(),
        ciclo: z.number(),
        colaborador: z.enum(["COMERCIAL", "MARKETING", "PLANEJAMENTO", "FINANCEIRO"]),
        status: z.enum(["PENDENTE", "EM_ANDAMENTO", "APROVADO", "REJEITADO"]).default("PENDENTE"),
        observacoes: z.string().optional(),
      }))
      .mutation(({ input }) => db.createColaboracao(input)),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        ano: z.number().optional(),
        ciclo: z.number().optional(),
        colaborador: z.enum(["COMERCIAL", "MARKETING", "PLANEJAMENTO", "FINANCEIRO"]).optional(),
        status: z.enum(["PENDENTE", "EM_ANDAMENTO", "APROVADO", "REJEITADO"]).optional(),
        observacoes: z.string().optional(),
      }))
      .mutation(({ input }) => {
        const { id, ...rest } = input;
        return db.updateColaboracao(id, rest);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => db.deleteColaboracao(input.id)),
  }),

  // ==================== CICLO COMERCIAL (MTS/JITO/PV/CRM) ====================
  cicloComercial: router({
    list: protectedProcedure.query(() => db.listCiclosComerciais()),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getCicloComercial(input.id)),

    itens: protectedProcedure
      .input(
        z.object({
          cicloId: z.number(),
          planoColab: z.enum(["MTS", "JITO", "PV_MTO", "CRM"]).optional(),
        })
      )
      .query(({ input }) => db.listCicloComercialItens(input.cicloId, input.planoColab)),

    consolidado: protectedProcedure
      .input(z.object({ cicloId: z.number() }))
      .query(({ input }) => db.getCicloComercialConsolidado(input.cicloId)),

    updateItem: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          m1: z.string().optional(),
          m2: z.string().optional(),
          m3: z.string().optional(),
          m4: z.string().optional(),
          m5: z.string().optional(),
          m6: z.string().optional(),
          m7: z.string().optional(),
          m8: z.string().optional(),
          m9: z.string().optional(),
          m10: z.string().optional(),
          m11: z.string().optional(),
          m12: z.string().optional(),
          qtdeColaborada: z.string().optional(),
          projetar: z.boolean().optional(),
          planoColab: z.enum(["MTS", "JITO", "PV_MTO", "CRM"]).optional(),
        })
      )
      .mutation(({ input }) => {
        const { id, ...rest } = input;
        return db.updateCicloComercialItem(id, rest);
      }),

    updateStatus: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          status: z.enum(["ABERTO", "EM_COLABORACAO", "CONSOLIDADO", "FECHADO"]),
        })
      )
      .mutation(({ input }) => db.updateCicloComercial(input.id, { status: input.status })),

    desagregarDoJob: protectedProcedure
      .input(
        z.object({
          jobId: z.number(),
          nomeCiclo: z.string().optional(),
          anoInicio: z.number().optional(),
          mesInicio: z.number().min(1).max(12).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await seedSazonalidadeUniformeSeVazia();
        return desagregarJobParaCicloComercial({
          jobId: input.jobId,
          nomeCiclo: input.nomeCiclo,
          anoInicio: input.anoInicio,
          mesInicio: input.mesInicio,
          createdBy: ctx.user?.email || ctx.user?.name || "usuario",
        });
      }),
  }),

  sazonalidadeMarca: router({
    list: protectedProcedure
      .input(z.object({ marcaNome: z.string().optional() }).optional())
      .query(({ input }) => db.listSazonalidadeMarca(input?.marcaNome)),

    seedUniforme: protectedProcedure.mutation(() => seedSazonalidadeUniformeSeVazia()),

    calcularDoFaturamento: protectedProcedure
      .input(z.object({ anosHistorico: z.number().min(1).max(10).default(3) }).optional())
      .mutation(({ input }) =>
        calcularSazonalidadeDoFaturamento(input?.anosHistorico ?? 3)
      ),

    upsertBatch: protectedProcedure
      .input(
        z.object({
          rows: z.array(
            z.object({
              marcaNome: z.string().min(1),
              mes: z.number().min(1).max(12),
              percentual: z.string(),
              marcaId: z.number().optional(),
              observacoes: z.string().optional(),
            })
          ),
        })
      )
      .mutation(({ input }) => db.upsertSazonalidadeMarcaBatch(input.rows)),

    importExcel: protectedProcedure
      .input(
        z.object({
          fileName: z.string().min(1),
          contentBase64: z.string().min(1),
        })
      )
      .mutation(async ({ input }) => {
        const raw = input.contentBase64.includes(",")
          ? input.contentBase64.split(",")[1]
          : input.contentBase64;
        const buffer = Buffer.from(raw, "base64");
        const parsed = parseSazonalidadeWorkbook(buffer);
        await db.upsertSazonalidadeMarcaBatch(parsed.rows);
        return {
          fileName: input.fileName,
          sheetName: parsed.sheetName,
          marcas: parsed.marcas,
          rows: parsed.rows.length,
        };
      }),
  }),

  // ==================== CONSENSOS ====================
  consensos: router({
    list: protectedProcedure
      .input(z.object({ ano: z.number().optional(), ciclo: z.number().optional() }).optional())
      .query(({ input }) => db.listConsensos(input?.ano, input?.ciclo)),

    create: protectedProcedure
      .input(z.object({
        ano: z.number(),
        ciclo: z.number(),
        status: z.enum(["ABERTO", "EM_REVISAO", "APROVADO", "FECHADO"]).default("ABERTO"),
        dataAprovacao: z.string().optional(),
        observacoes: z.string().optional(),
      }))
      .mutation(({ input }) => {
        const { dataAprovacao, ...rest } = input;
        return db.createConsenso({
          ...rest,
          dataAprovacao: dataAprovacao ? new Date(dataAprovacao) : undefined,
        });
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        ano: z.number().optional(),
        ciclo: z.number().optional(),
        status: z.enum(["ABERTO", "EM_REVISAO", "APROVADO", "FECHADO"]).optional(),
        dataAprovacao: z.string().optional(),
        observacoes: z.string().optional(),
      }))
      .mutation(({ input }) => {
        const { id, dataAprovacao, ...rest } = input;
        return db.updateConsenso(id, {
          ...rest,
          dataAprovacao: dataAprovacao ? new Date(dataAprovacao) : undefined,
        });
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => db.deleteConsenso(input.id)),
  }),

  // ==================== METAS DE PRODUCAO ====================
  metasProducao: router({
    list: protectedProcedure
      .input(z.object({ ano: z.number().optional(), recursoId: z.number().optional() }).optional())
      .query(({ input }) => db.listMetasProducao(input?.ano, input?.recursoId)),

    create: protectedProcedure
      .input(z.object({
        ano: z.number(),
        mes: z.number().min(1).max(12),
        recursoId: z.number(),
        disponibilidadeMeta: z.string().optional(),
        performanceMeta: z.string().optional(),
        qualidadeMeta: z.string().optional(),
        irogMeta: z.string().optional(),
      }))
      .mutation(({ input }) => db.createMetaProducao(input)),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        ano: z.number().optional(),
        mes: z.number().min(1).max(12).optional(),
        recursoId: z.number().optional(),
        disponibilidadeMeta: z.string().optional(),
        performanceMeta: z.string().optional(),
        qualidadeMeta: z.string().optional(),
        irogMeta: z.string().optional(),
      }))
      .mutation(({ input }) => {
        const { id, ...rest } = input;
        return db.updateMetaProducao(id, rest);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => db.deleteMetaProducao(input.id)),
  }),

  // ==================== FATURAMENTO ====================
  faturamento: router({
    list: protectedProcedure
      .input(z.object({ limit: z.number().default(100) }).optional())
      .query(({ input }) => db.listFaturamento(input?.limit)),
    
    stats: protectedProcedure.query(() => db.getFaturamentoStats()),
    
    porMes: protectedProcedure
      .input(z.object({ ano: z.number() }))
      .query(({ input }) => db.getFaturamentoPorMes(input.ano)),
    
    importBatch: protectedProcedure
      .input(z.array(z.object({
        dataEmissao: z.string(),
        nfNumero: z.string().optional(),
        codCliente: z.string().optional(),
        cnpj: z.string().optional(),
        unidade: z.string().optional(),
        cidade: z.string().optional(),
        uf: z.string().optional(),
        marca: z.string().optional(),
        codMaterial: z.string().optional(),
        descricaoItem: z.string().optional(),
        tipoNegocio: z.string().optional(),
        tipoEstoque: z.enum(["MTS", "MTO"]).optional(),
        linhaProduto: z.string().optional(),
        qtd: z.string(),
        valorTotal: z.string(),
        gestor: z.string().optional(),
        cfop: z.string().optional(),
        descCfop: z.string().optional(),
        tipoFaturamento: z.enum(["DEVOLUCAO", "SAIDA"]).optional(),
      })))
      .mutation(({ input }) => {
        const data = input.map(item => ({
          ...item,
          dataEmissao: new Date(item.dataEmissao),
        }));
        return db.createFaturamentoBatch(data);
      }),
    
    clear: protectedProcedure.mutation(() => db.clearFaturamento()),
    
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => db.deleteFaturamento(input.id)),
  }),

  // ==================== TABELAS AUXILIARES ====================
  statusCadastro: router({
    list: protectedProcedure.query(() => db.listStatusCadastro()),
    create: protectedProcedure
      .input(z.object({ nome: z.string().min(1), descricao: z.string().optional(), ativo: z.boolean().default(true) }))
      .mutation(({ input }) => db.createStatusCadastro(input)),
    update: protectedProcedure
      .input(z.object({ id: z.number(), nome: z.string().optional(), descricao: z.string().optional(), ativo: z.boolean().optional() }))
      .mutation(({ input }) => { const { id, ...data } = input; return db.updateStatusCadastro(id, data); }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteStatusCadastro(input.id)),
    importBatch: protectedProcedure
      .input(z.array(z.object({ nome: z.string(), descricao: z.string().optional(), ativo: z.boolean().optional() })))
      .mutation(({ input }) => db.createStatusCadastroBatch(input)),
  }),

  tiposNegocio: router({
    list: protectedProcedure.query(() => db.listTiposNegocio()),
    create: protectedProcedure
      .input(z.object({ nome: z.string().min(1), descricao: z.string().optional(), ativo: z.boolean().default(true) }))
      .mutation(({ input }) => db.createTipoNegocio(input)),
    update: protectedProcedure
      .input(z.object({ id: z.number(), nome: z.string().optional(), descricao: z.string().optional(), ativo: z.boolean().optional() }))
      .mutation(({ input }) => { const { id, ...data } = input; return db.updateTipoNegocio(id, data); }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteTipoNegocio(input.id)),
    importBatch: protectedProcedure
      .input(z.array(z.object({ nome: z.string(), descricao: z.string().optional(), ativo: z.boolean().optional() })))
      .mutation(({ input }) => db.createTiposNegocioBatch(input)),
  }),

  tiposEstoque: router({
    list: protectedProcedure.query(() => db.listTiposEstoque()),
    create: protectedProcedure
      .input(z.object({ nome: z.string().min(1), descricao: z.string().optional(), ativo: z.boolean().default(true) }))
      .mutation(({ input }) => db.createTipoEstoque(input)),
    update: protectedProcedure
      .input(z.object({ id: z.number(), nome: z.string().optional(), descricao: z.string().optional(), ativo: z.boolean().optional() }))
      .mutation(({ input }) => { const { id, ...data } = input; return db.updateTipoEstoque(id, data); }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteTipoEstoque(input.id)),
    importBatch: protectedProcedure
      .input(z.array(z.object({ nome: z.string(), descricao: z.string().optional(), ativo: z.boolean().optional() })))
      .mutation(({ input }) => db.createTiposEstoqueBatch(input)),
  }),

  linhas: router({
    list: protectedProcedure.query(() => db.listLinhas()),
    create: protectedProcedure
      .input(z.object({ nome: z.string().min(1), descricao: z.string().optional(), ativo: z.boolean().default(true) }))
      .mutation(({ input }) => db.createLinha(input)),
    update: protectedProcedure
      .input(z.object({ id: z.number(), nome: z.string().optional(), descricao: z.string().optional(), ativo: z.boolean().optional() }))
      .mutation(({ input }) => { const { id, ...data } = input; return db.updateLinha(id, data); }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteLinha(input.id)),
    importBatch: protectedProcedure
      .input(z.array(z.object({ nome: z.string(), descricao: z.string().optional(), ativo: z.boolean().optional() })))
      .mutation(({ input }) => db.createLinhasBatch(input)),
  }),

  modelos: router({
    list: protectedProcedure.query(() => db.listModelos()),
    create: protectedProcedure
      .input(z.object({ nome: z.string().min(1), descricao: z.string().optional(), ativo: z.boolean().default(true) }))
      .mutation(({ input }) => db.createModelo(input)),
    update: protectedProcedure
      .input(z.object({ id: z.number(), nome: z.string().optional(), descricao: z.string().optional(), ativo: z.boolean().optional() }))
      .mutation(({ input }) => { const { id, ...data } = input; return db.updateModelo(id, data); }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteModelo(input.id)),
    importBatch: protectedProcedure
      .input(z.array(z.object({ nome: z.string(), descricao: z.string().optional(), ativo: z.boolean().optional() })))
      .mutation(({ input }) => db.createModelosBatch(input)),
  }),

  tamanhos: router({
    list: protectedProcedure.query(() => db.listTamanhos()),
    create: protectedProcedure
      .input(z.object({ nome: z.string().min(1), descricao: z.string().optional(), ordem: z.number().optional(), ativo: z.boolean().default(true) }))
      .mutation(({ input }) => db.createTamanho(input)),
    update: protectedProcedure
      .input(z.object({ id: z.number(), nome: z.string().optional(), descricao: z.string().optional(), ordem: z.number().optional(), ativo: z.boolean().optional() }))
      .mutation(({ input }) => { const { id, ...data } = input; return db.updateTamanho(id, data); }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteTamanho(input.id)),
    importBatch: protectedProcedure
      .input(z.array(z.object({ nome: z.string(), descricao: z.string().optional(), ordem: z.number().optional(), ativo: z.boolean().optional() })))
      .mutation(({ input }) => db.createTamanhosBatch(input)),
  }),

  // ==================== MARCAS ====================
  marcas: router({
    list: protectedProcedure.query(() => db.listMarcas()),
    create: protectedProcedure
      .input(z.object({ nome: z.string().min(1), grupoMarca: z.string().optional(), ramoAtuacao: z.string().optional(), ativo: z.boolean().default(true) }))
      .mutation(({ input }) => db.createMarca(input)),
    update: protectedProcedure
      .input(z.object({ id: z.number(), nome: z.string().optional(), grupoMarca: z.string().optional(), ramoAtuacao: z.string().optional(), ativo: z.boolean().optional() }))
      .mutation(({ input }) => { const { id, ...data } = input; return db.updateMarca(id, data); }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteMarca(input.id)),
    importBatch: protectedProcedure
      .input(z.array(z.object({ nome: z.string(), grupoMarca: z.string().optional(), ramoAtuacao: z.string().optional(), ativo: z.boolean().optional() })))
      .mutation(({ input }) => db.createMarcasBatch(input)),
  }),

  // ==================== GESTORES COMERCIAIS ====================
  gestores: router({
    list: protectedProcedure.query(() => db.listGestores()),
    create: protectedProcedure
      .input(z.object({ nome: z.string().min(1), email: z.string().optional(), telefone: z.string().optional(), ativo: z.boolean().default(true) }))
      .mutation(({ input }) => db.createGestor(input)),
    update: protectedProcedure
      .input(z.object({ id: z.number(), nome: z.string().optional(), email: z.string().optional(), telefone: z.string().optional(), ativo: z.boolean().optional() }))
      .mutation(({ input }) => { const { id, ...data } = input; return db.updateGestor(id, data); }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteGestor(input.id)),
    importBatch: protectedProcedure
      .input(z.array(z.object({ nome: z.string(), email: z.string().optional(), telefone: z.string().optional(), ativo: z.boolean().optional() })))
      .mutation(({ input }) => db.createGestoresBatch(input)),
  }),

  // ==================== GESTOR x MARCA ====================
  gestorMarca: router({
    list: protectedProcedure.query(() => db.listGestorMarcaComDetalhes()),
    create: protectedProcedure
      .input(z.object({ gestorId: z.number(), marcaId: z.number(), dataInicio: z.string().optional(), dataFim: z.string().optional(), ativo: z.boolean().default(true) }))
      .mutation(({ input }) => {
        const data = {
          ...input,
          dataInicio: input.dataInicio ? new Date(input.dataInicio) : undefined,
          dataFim: input.dataFim ? new Date(input.dataFim) : undefined,
        };
        return db.createGestorMarca(data);
      }),
    update: protectedProcedure
      .input(z.object({ id: z.number(), gestorId: z.number().optional(), marcaId: z.number().optional(), dataInicio: z.string().optional(), dataFim: z.string().optional(), ativo: z.boolean().optional() }))
      .mutation(({ input }) => {
        const { id, dataInicio, dataFim, ...rest } = input;
        const data = {
          ...rest,
          dataInicio: dataInicio ? new Date(dataInicio) : undefined,
          dataFim: dataFim ? new Date(dataFim) : undefined,
        };
        return db.updateGestorMarca(id, data);
      }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteGestorMarca(input.id)),
  }),

  // ==================== DE-PARA DE CÓDIGOS ====================
  deParaCodigos: router({
    list: protectedProcedure.query(() => db.listDeParaCodigos()),
    create: protectedProcedure
      .input(z.object({ 
        skuAntigo: z.string().min(1), 
        skuNovo: z.string().min(1), 
      }))
      .mutation(({ input }) => db.createDeParaCodigo(input)),
    update: protectedProcedure
      .input(z.object({ 
        id: z.number(), 
        skuAntigo: z.string().optional(), 
        skuNovo: z.string().optional(), 
      }))
      .mutation(({ input }) => {
        const { id, ...rest } = input;
        return db.updateDeParaCodigo(id, rest);
      }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteDeParaCodigo(input.id)),
    importBatch: protectedProcedure
      .input(z.array(z.object({ 
        skuAntigo: z.string(), 
        skuNovo: z.string(), 
      })))
      .mutation(({ input }) => db.createDeParaCodigosBatch(input)),
    getCodigoAtual: protectedProcedure
      .input(z.object({ codigo: z.string() }))
      .query(({ input }) => db.getCodigoAtual(input.codigo)),
  }),

  // ==================== SHAREPOINT ====================
  sharepoint: router({
    getConfig: protectedProcedure.query(() => sharepoint.getSharepointConfig()),
    
    saveConfig: protectedProcedure
      .input(z.object({
        tenantId: z.string().optional(),
        clientId: z.string().optional(),
        clientSecret: z.string().optional(),
        siteUrl: z.string().optional(),
        folderPath: z.string().optional(),
        arquivoProdutos: z.string().optional(),
        arquivoFaturamento: z.string().optional(),
        arquivoClientes: z.string().optional(),
        intervaloHoras: z.number().optional(),
        ativo: z.boolean().optional(),
      }))
      .mutation(({ input }) => sharepoint.saveSharepointConfig(input)),
    
    testarConexao: protectedProcedure.mutation(() => sharepoint.testarConexaoSharepoint()),
    
    sincronizar: protectedProcedure
      .input(z.object({
        tipo: z.enum(["produtos", "faturamento", "clientes", "todos"]),
      }))
      .mutation(async ({ input, ctx }) => {
        const executadoPor = ctx.user?.name || ctx.user?.email || "usuario";
        return sharepoint.executarSincronizacao(input.tipo, executadoPor);
      }),
    
    getLogs: protectedProcedure
      .input(z.object({ limit: z.number().optional() }).optional())
      .query(({ input }) => sharepoint.getSyncLogs(input?.limit || 50)),
  }),

  // ==================== PREVISAO PYTHON ====================
  previsaoPython: router({
    list: protectedProcedure
      .input(z.object({ limit: z.number().default(20) }).optional())
      .query(({ input }) => db.listPrevisaoPythonJobs(input?.limit ?? 20)),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getPrevisaoPythonJobById(input.id)),

    create: protectedProcedure
      .input(
        z.object({
          vendas: z.object({
            fileName: z.string().min(1),
            contentBase64: z.string().min(1),
          }),
          previsto: z
            .object({
              fileName: z.string().min(1),
              contentBase64: z.string().min(1),
            })
            .optional(),
          clientes: z
            .object({
              fileName: z.string().min(1),
              contentBase64: z.string().min(1),
            })
            .optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const createdBy = ctx.user?.email || ctx.user?.name || "usuario";
        const job = await previsaoPythonService.createAndQueuePrevisaoJob({
          createdBy,
          vendas: input.vendas,
          previsto: input.previsto,
          clientes: input.clientes,
        });
        return job;
      }),

    /** Passo 1: gera as 3 bases a partir do faturamento e enfileira o job Python. */
    createFromSistema: protectedProcedure
      .input(
        z
          .object({
            dataInicio: z.string().optional(),
            dataFim: z.string().optional(),
          })
          .optional()
      )
      .mutation(async ({ input, ctx }) => {
        const bases = await runGerarBasesOrThrow({
          dataInicio: input?.dataInicio,
          dataFim: input?.dataFim,
        });
        const createdBy = ctx.user?.email || ctx.user?.name || "usuario";
        const job = await previsaoPythonService.createAndQueuePrevisaoJob({
          createdBy,
          vendas: {
            fileName: "1- Base de Dados Vendas.xlsx",
            contentBase64: bases.vendasBase64,
          },
          previsto: bases.previstoBase64
            ? {
                fileName: "1-BasedeDadosPrevisto.xlsx",
                contentBase64: bases.previstoBase64,
              }
            : null,
          clientes: bases.clientesBase64
            ? {
                fileName: "1-BasedeDadosClientes.xlsx",
                contentBase64: bases.clientesBase64,
              }
            : null,
        });
        return { job, stats: bases.stats };
      }),

    gerarBasesPreview: protectedProcedure
      .input(
        z
          .object({
            dataInicio: z.string().optional(),
            dataFim: z.string().optional(),
          })
          .optional()
      )
      .mutation(async ({ input }) => {
        const bases = await runGerarBasesOrThrow({
          dataInicio: input?.dataInicio,
          dataFim: input?.dataFim,
        });
        return {
          stats: bases.stats,
          vendasBase64: bases.vendasBase64,
          previstoBase64: bases.previstoBase64,
          clientesBase64: bases.clientesBase64,
        };
      }),

    createCiclo13Upload: protectedProcedure
      .input(
        z.object({
          workbook: z.object({
            fileName: z.string().min(1),
            contentBase64: z.string().min(1),
          }),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const createdBy = ctx.user?.email || ctx.user?.name || "usuario";
        const job = await previsaoPythonService.createCiclo13UploadJob({
          createdBy,
          workbook: input.workbook,
        });
        return job;
      }),

    log: protectedProcedure
      .input(z.object({ id: z.number(), maxChars: z.number().default(40000).optional() }))
      .query(({ input }) =>
        previsaoPythonService.getPrevisaoJobLog(input.id, input.maxChars ?? 40000)
      ),

    download: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => previsaoPythonService.getPrevisaoJobOutputAsBase64(input.id)),

    workbookMeta: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => previsaoPythonService.getPrevisaoJobWorkbookMeta(input.id)),

    analytics: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          monthsLimit: z.number().min(1).max(120).default(24).optional(),
        })
      )
      .query(({ input }) =>
        previsaoPythonService.getPrevisaoJobAnalytics(input.id, input.monthsLimit ?? 24)
      ),

    executiveAnalytics: protectedProcedure
      .input(
        z.object({
          id: z.number(),
        })
      )
      .query(({ input }) =>
        previsaoPythonService.getPrevisaoJobExecutiveAnalytics(input.id)
      ),

    customerAnalytics: protectedProcedure
      .input(
        z.object({
          id: z.number(),
        })
      )
      .query(({ input }) =>
        previsaoPythonService.getPrevisaoJobCustomerAnalytics(input.id)
      ),

    customerDetailData: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          page: z.number().min(1).default(1).optional(),
          pageSize: z.number().min(1).max(250).default(100).optional(),
          search: z.string().default("").optional(),
          sortBy: z.string().default("").optional(),
          sortDir: z.enum(["asc", "desc"]).default("asc").optional(),
          sku: z.string().default("").optional(),
          codCliente: z.string().default("").optional(),
          comportamento: z.string().default("").optional(),
          fidelidade: z.string().default("").optional(),
        })
      )
      .query(({ input }) =>
        previsaoPythonService.getPrevisaoJobCustomerDetailData(input.id, {
          page: input.page ?? 1,
          pageSize: input.pageSize ?? 100,
          search: input.search ?? "",
          sortBy: input.sortBy ?? "",
          sortDir: input.sortDir ?? "asc",
          sku: input.sku ?? "",
          codCliente: input.codCliente ?? "",
          comportamento: input.comportamento ?? "",
          fidelidade: input.fidelidade ?? "",
        })
      ),

    explainability: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          limit: z.number().min(1).max(200).default(20).optional(),
        })
      )
      .query(({ input }) =>
        previsaoPythonService.getPrevisaoJobExplainability(input.id, input.limit ?? 20)
      ),

    scenarioSnapshots: protectedProcedure
      .input(
        z.object({
          id: z.number(),
        })
      )
      .query(({ input }) => previsaoPythonService.listPrevisaoJobScenarioSnapshots(input.id)),

    createScenarioSnapshot: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          cicloRef: z.string().min(1),
          horizonteRef: z.string().optional(),
          titulo: z.string().optional(),
          observacoes: z.string().optional(),
        })
      )
      .mutation(({ input, ctx }) =>
        previsaoPythonService.createPrevisaoJobScenarioSnapshot(input.id, {
          cicloRef: input.cicloRef,
          horizonteRef: input.horizonteRef,
          titulo: input.titulo,
          observacoes: input.observacoes,
          createdBy: ctx.user?.email || ctx.user?.name || "usuario",
        })
      ),

    compareScenarioSnapshots: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          baseSnapshotId: z.number(),
          targetSnapshotId: z.number(),
        })
      )
      .query(({ input }) =>
        previsaoPythonService.comparePrevisaoJobScenarioSnapshots(
          input.id,
          input.baseSnapshotId,
          input.targetSnapshotId
        )
      ),

    cycleSummary: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          snapshotId: z.number().optional(),
        })
      )
      .query(({ input }) =>
        previsaoPythonService.getPrevisaoJobCycleSummary(input.id, input.snapshotId)
      ),

    sheetPreview: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          sheetName: z.string().min(1),
          maxRows: z.number().default(100).optional(),
        })
      )
      .query(({ input }) =>
        previsaoPythonService.getPrevisaoJobSheetPreview(
          input.id,
          input.sheetName,
          input.maxRows ?? 100
        )
      ),

    sheetData: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          sheetName: z.string().min(1),
          page: z.number().min(1).default(1).optional(),
          pageSize: z.number().min(1).max(250).default(100).optional(),
          search: z.string().default("").optional(),
          sortBy: z.string().default("").optional(),
          sortDir: z.enum(["asc", "desc"]).default("asc").optional(),
          filters: z
            .array(
              z.object({
                column: z.string().min(1),
                value: z.string().min(1),
              })
            )
            .default([])
            .optional(),
        })
      )
      .query(({ input }) =>
        previsaoPythonService.getPrevisaoJobSheetData(input.id, input.sheetName, {
          page: input.page ?? 1,
          pageSize: input.pageSize ?? 100,
          search: input.search ?? "",
          sortBy: input.sortBy ?? "",
          sortDir: input.sortDir ?? "asc",
          filters: input.filters ?? [],
        })
      ),
  }),

  // ==================== NÍVEIS DE ACESSO ====================
  niveisAcesso: router({
    list: protectedProcedure.query(() => db.getAllNiveisAcesso()),
    
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getNivelAcessoById(input.id)),
    
    create: protectedProcedure
      .input(z.object({
        nivel: z.number(),
        nome: z.string().min(1),
        descricao: z.string().optional(),
        podeEditarCadastros: z.boolean().default(false),
        podeVerTodasMarcas: z.boolean().default(false),
        podeGerenciarUsuarios: z.boolean().default(false),
      }))
      .mutation(({ input }) => db.createNivelAcesso(input)),
    
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        nivel: z.number().optional(),
        nome: z.string().optional(),
        descricao: z.string().optional(),
        podeEditarCadastros: z.boolean().optional(),
        podeVerTodasMarcas: z.boolean().optional(),
        podeGerenciarUsuarios: z.boolean().optional(),
      }))
      .mutation(({ input }) => {
        const { id, ...data } = input;
        return db.updateNivelAcesso(id, data);
      }),
    
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => db.deleteNivelAcesso(input.id)),
    
    initPadrao: protectedProcedure.mutation(() => db.initNiveisAcessoPadrao()),
  }),

  // ==================== GERENCIAMENTO DE USUÁRIOS ====================
  usuarios: router({
    list: protectedProcedure.query(() => db.getAllUsers()),
    
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getUserById(input.id)),
    
    updateNivelAcesso: protectedProcedure
      .input(z.object({
        userId: z.number(),
        nivelAcesso: z.number(),
        ativo: z.boolean().optional(),
      }))
      .mutation(({ input }) => db.updateUserNivelAcesso(input.userId, input.nivelAcesso, input.ativo ?? true)),
    
    updateAtivo: protectedProcedure
      .input(z.object({
        userId: z.number(),
        ativo: z.boolean(),
      }))
      .mutation(({ input }) => db.updateUserAtivo(input.userId, input.ativo)),
    
    getMarcas: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .query(({ input }) => db.getUsuarioMarcas(input.userId)),
    
    setMarcas: protectedProcedure
      .input(z.object({
        userId: z.number(),
        marcaIds: z.array(z.number()),
      }))
      .mutation(({ input }) => db.setUsuarioMarcas(input.userId, input.marcaIds)),
    
    addMarca: protectedProcedure
      .input(z.object({
        userId: z.number(),
        marcaId: z.number(),
      }))
      .mutation(({ input }) => db.addUsuarioMarca(input.userId, input.marcaId)),
    
    removeMarca: protectedProcedure
      .input(z.object({
        userId: z.number(),
        marcaId: z.number(),
      }))
      .mutation(({ input }) => db.removeUsuarioMarca(input.userId, input.marcaId)),
    
    getMarcasPermitidas: protectedProcedure
      .input(z.object({
        userId: z.number(),
        nivelAcesso: z.number(),
      }))
      .query(({ input }) => db.getMarcasPermitidas(input.userId, input.nivelAcesso)),
    
    // Retorna as marcas permitidas para o usuário logado
    minhasMarcas: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user) return [];
      const nivelAcesso = (ctx.user as any).nivelAcesso || 1;
      return db.getMarcasPermitidas(ctx.user.id, nivelAcesso);
    }),
    
    // Criar novo usuário
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1, "Nome é obrigatório"),
        email: z.string().email("Email inválido"),
        nivelAcesso: z.number().min(1).max(3).default(1),
      }))
      .mutation(({ input }) => db.createUser(input)),
    
    // Excluir usuário
    delete: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(({ input }) => db.deleteUser(input.userId)),
    
    // Atualizar dados do usuário (nome e email)
    updateData: protectedProcedure
      .input(z.object({
        userId: z.number(),
        name: z.string().min(1).optional(),
        email: z.string().email().optional(),
      }))
      .mutation(({ input }) => {
        const { userId, ...data } = input;
        return db.updateUserData(userId, data);
      }),
  }),

  // ==================== TURNOS ====================
  turnos: router({
    list: protectedProcedure.query(() => db.listTurnos()),
    create: protectedProcedure
      .input(z.object({ 
        turnoHora: z.string().min(1), 
        horasTrabalho: z.string().default("00:00"), 
        horasRefeicao: z.string().optional().default("01:00"),
        horasTrabalhadas: z.string().optional().default("07:00"),
        diasTrabalhados: z.string().default("segunda - sexta"),
        horaExtra: z.boolean().default(false),
        ativo: z.boolean().default(true) 
      }))
      .mutation(({ input }) => db.createTurno(input)),
    update: protectedProcedure
      .input(z.object({ 
        id: z.number(), 
        turnoHora: z.string().optional(), 
        horasTrabalho: z.string().optional(), 
        horasRefeicao: z.string().optional(),
        horasTrabalhadas: z.string().optional(),
        diasTrabalhados: z.string().optional(),
        horaExtra: z.boolean().optional(),
        ativo: z.boolean().optional() 
      }))
      .mutation(({ input }) => { const { id, ...data } = input; return db.updateTurno(id, data); }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteTurno(input.id)),
  }),

  // ==================== RECURSOS MENSAIS ====================
  recursosMensais: router({
    listByRecurso: protectedProcedure
      .input(z.object({ recursoId: z.number(), ano: z.number() }))
      .query(({ input }) => db.listRecursosMensaisByRecurso(input.recursoId, input.ano)),
    saveConfig: protectedProcedure
      .input(z.object({ recursoId: z.number(), ano: z.number(), mes: z.number(), turnoId: z.number(), horasManutencao: z.number().optional(), horasExtras: z.number().optional(), velocidadeLiquida: z.number().optional() }))
      .mutation(({ input }) => db.saveRecursoMensal(input)),
    clearConfig: protectedProcedure
      .input(z.object({ recursoId: z.number(), ano: z.number() }))
      .mutation(({ input }) => db.clearRecursosMensais(input.recursoId, input.ano)),
  }),

  // ==================== FLUXOS ====================
  fluxos: router({
    list: protectedProcedure.query(() => db.listFluxos()),
    listComRecursos: protectedProcedure.query(() => db.getFluxosComRecursos()),
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getFluxoById(input.id)),
    create: protectedProcedure
      .input(z.object({ nome: z.string().min(1), descricao: z.string().optional(), ativo: z.boolean().default(true) }))
      .mutation(({ input }) => db.createFluxo(input)),
    update: protectedProcedure
      .input(z.object({ id: z.number(), nome: z.string().optional(), descricao: z.string().optional(), ativo: z.boolean().optional() }))
      .mutation(({ input }) => { const { id, ...data } = input; return db.updateFluxo(id, data); }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteFluxo(input.id)),
    setRecursos: protectedProcedure
      .input(z.object({ fluxoId: z.number(), recursoIds: z.array(z.number()) }))
      .mutation(({ input }) => db.setFluxoRecursos(input.fluxoId, input.recursoIds)),
    getRecursos: protectedProcedure
      .input(z.object({ fluxoId: z.number() }))
      .query(({ input }) => db.listFluxoRecursos(input.fluxoId)),
  }),

  // ==================== IMPORTACAO BASE CADASTROS ====================
  cadastrosSistema: router({
    importFromFolder: protectedProcedure
      .input(
        z
          .object({
            dirPath: z.string().optional(),
            dryRun: z.boolean().default(true),
            only: z.array(z.string()).optional(),
          })
          .optional()
      )
      .mutation(async ({ input }) => {
        const summary = await importSystemCadastros({
          dirPath: resolveDadosSistemaDir(input?.dirPath),
          dryRun: input?.dryRun ?? true,
          only: input?.only,
        });

        return summary;
      }),

    /** Carga operacional: CSVs mestres + marcas/gestores/vínculos + sazonalidade uniforme. */
    seedOperacional: protectedProcedure
      .input(
        z
          .object({
            dirPath: z.string().optional(),
            dryRun: z.boolean().default(false),
          })
          .optional()
      )
      .mutation(async ({ input }) => {
        const dirPath = resolveDadosSistemaDir(input?.dirPath);
        if (!fs.existsSync(dirPath)) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `Pasta de cadastros não encontrada: ${dirPath}. Inclua "dados-sistema" no deploy.`,
          });
        }
        return seedDadosMestresOperacionais({
          dirPath,
          dryRun: input?.dryRun ?? false,
        });
      }),
  }),

  // ==================== DASHBOARD ====================
  dashboard: router({
    demanda: protectedProcedure.query(() => db.getDashboardDemanda()),
    
    vendasPorMes: protectedProcedure
      .input(z.object({ ano: z.number() }))
      .query(({ input }) => db.getVendasPorMes(input.ano)),
    
    vendasPorMesConsolidadas: protectedProcedure
      .input(z.object({ ano: z.number() }))
      .query(({ input }) => db.getVendasPorMesConsolidadas(input.ano)),
    
    vendasConsolidadasPorProduto: protectedProcedure
      .input(z.object({ ano: z.number() }))
      .query(({ input }) => db.getVendasConsolidadasPorProduto(input.ano)),
    
    vendasPorMarca: protectedProcedure
      .input(z.object({ ano: z.number() }))
      .query(({ input }) => db.getVendasPorMarca(input.ano)),
    
    vendasPorLinha: protectedProcedure
      .input(z.object({ ano: z.number() }))
      .query(({ input }) => db.getVendasPorLinha(input.ano)),
    
    vendasPorUF: protectedProcedure
      .input(z.object({ ano: z.number() }))
      .query(({ input }) => db.getVendasPorUF(input.ano)),

    acuracidade: protectedProcedure
      .input(z.object({ ano: z.number().optional() }).optional())
      .query(({ input }) => db.getIndicadoresAcuracidade(input?.ano)),
  }),

  // ==================== CÁLCULO DE CAPACIDADE ====================
  capacidade: router({
    calcular: protectedProcedure
      .input(z.object({ ano: z.number() }))
      .query(async ({ input }) => {
        // Buscar todos os dados necessários
        const recursos = await db.listRecursos();
        const recursosMensais = await db.listRecursosMensais(input.ano);
        const diasUteis = await db.listDiasUteis(input.ano);
        const turnos = await db.listTurnos();
        
        // Função para mapear diasTrabalhados do turno para tipoDias
        const getTipoDias = (diasTrabalhados: string): string => {
          if (diasTrabalhados.toLowerCase().includes('domingo')) {
            return '7-dias'; // Domingo - Domingo = 7 dias
          } else if (diasTrabalhados.toLowerCase().includes('sábado')) {
            return 'seg-sab'; // segunda - sábado = 6 dias
          } else {
            return 'seg-sex'; // segunda - sexta = 5 dias
          }
        };
        
        // Criar mapa de dias úteis por mês e tipo
        const diasUteisPorMesTipo: Record<string, number> = {};
        const diasUteisPorMes: Record<number, number> = {}; // Para exibição (usar seg-sex como padrão)
        diasUteis.forEach((d: any) => {
          const tipoDias = d.tipoDias || 'seg-sex';
          const key = `${d.mes}-${tipoDias}`;
          diasUteisPorMesTipo[key] = d.diasUteis;
          // Para exibição no header, usar seg-sex como referência
          if (tipoDias === 'seg-sex') {
            diasUteisPorMes[d.mes] = d.diasUteis;
          }
        });
        
        // Criar mapa de turnos por id
        const turnosPorId: Record<number, any> = {};
        turnos.forEach((t: any) => {
          turnosPorId[t.id] = t;
        });
        
        // Criar mapa de configurações mensais por recursoId e mês
        const configPorRecursoMes: Record<string, any> = {};
        recursosMensais.forEach((rm: any) => {
          const key = `${rm.recursoId}-${rm.mes}`;
          configPorRecursoMes[key] = rm;
        });
        
        // Calcular capacidade para cada recurso e mês
        const resultado = recursos.map((recurso: any) => {
          const capacidadeMensal: Record<number, number | null> = {};
          let capacidadeTotal = 0;
          
          for (let mes = 1; mes <= 12; mes++) {
            const key = `${recurso.id}-${mes}`;
            const config = configPorRecursoMes[key];
            
            if (config && config.turnoId) {
              const turno = turnosPorId[config.turnoId];
              if (turno) {
                // Determinar o tipo de dias baseado no turno
                const tipoDias = getTipoDias(turno.diasTrabalhados || 'segunda - sexta');
                const keyDias = `${mes}-${tipoDias}`;
                const diasUteisDoMes = diasUteisPorMesTipo[keyDias] || diasUteisPorMes[mes] || 0;
                
                // Converter horasTrabalhadas de "HH:MM" para número de horas
                const horasTrabalhadas = turno.horasTrabalhadas || "00:00";
                const [horas, minutos] = horasTrabalhadas.split(":").map(Number);
                const horasPorTurno = horas + (minutos || 0) / 60;
                
                // Extrair número de turnos do nome (ex: 2/10 = 2 turnos, 3/8 = 3 turnos)
                const turnoMatch = (turno.turnoHora || '').match(/^(\d+)\//);
                const numTurnos = turnoMatch ? parseInt(turnoMatch[1]) : 1;
                
                // Horas úteis = horas por turno × número de turnos
                const horasUteis = horasPorTurno * numTurnos;
                
                // Horas de manutenção
                const horasManutencao = parseFloat(config.horasManutencao || "0");
                
                // Horas extras
                const horasExtras = parseFloat(config.horasExtras || "0");
                
                // Velocidade líquida (do mês ou do recurso)
                const velocidadeLiquida = parseFloat(config.velocidadeLiquida || recurso.velocidadeLiquida || "0");
                
                // Cálculo: (Dias úteis × Horas úteis + Horas Extras - Horas Manutenção) × Velocidade Líquida
                const horasTotais = diasUteisDoMes * horasUteis + horasExtras;
                const horasDisponiveis = Math.max(0, horasTotais - horasManutencao);
                const capacidade = horasDisponiveis * velocidadeLiquida;
                
                capacidadeMensal[mes] = Math.round(capacidade);
                capacidadeTotal += capacidade;
              } else {
                capacidadeMensal[mes] = null;
              }
            } else {
              capacidadeMensal[mes] = null;
            }
          }
          
          return {
            recursoId: recurso.id,
            recursoNome: recurso.nome,
            linhaProducao: recurso.linhaProducao,
            linhaProduto: recurso.linhaProduto,
            tipoAcabamento: recurso.tipoAcabamento,
            grupoTrabalho: recurso.grupoTrabalho,
            tipo: recurso.tipo,
            velocidadeLiquida: parseFloat(recurso.velocidadeLiquida || "0"),
            capacidadeMensal,
            capacidadeTotal: Math.round(capacidadeTotal),
          };
        });
        
        return {
          ano: input.ano,
          diasUteisPorMes,
          recursos: resultado,
        };
      }),
  }),
  // ==================== PESQUISA GLOBAL ====================
  pesquisa: router({
    buscarRecursos: protectedProcedure
      .input(z.object({ termo: z.string().min(1) }))
      .query(async ({ input }) => {
        const recursos = await db.listRecursos();
        const termoLower = input.termo.toLowerCase();
        
        // Filtrar recursos pelo termo de busca
        const recursosFiltrados = recursos.filter((r: any) => 
          r.nome.toLowerCase().includes(termoLower)
        ).slice(0, 10); // Limitar a 10 resultados
        
        // Buscar configurações mensais para cada recurso encontrado
        const ano = new Date().getFullYear();
        const resultados = await Promise.all(
          recursosFiltrados.map(async (recurso: any) => {
            const configMensais = await db.listRecursosMensaisByRecurso(recurso.id, ano);
            const turnos = await db.listTurnos();
            const turnosPorId: Record<number, any> = {};
            turnos.forEach((t: any) => { turnosPorId[t.id] = t; });
            
            // Mapear configurações mensais com nome do turno
            const configComTurno = configMensais.map((cm: any) => ({
              ...cm,
              turnoNome: cm.turnoId ? turnosPorId[cm.turnoId]?.nome : null,
            }));
            
            return {
              id: recurso.id,
              nome: recurso.nome,
              tipo: recurso.tipo,
              tipoExecucao: recurso.tipoExecucao,
              tipoAcabamento: recurso.tipoAcabamento,
              linhaProducao: recurso.linhaProducao,
              linhaProduto: recurso.linhaProduto,
              grupoTrabalho: recurso.grupoTrabalho,
              velocidadeLiquida: parseFloat(recurso.velocidadeLiquida || "0"),
              ativo: recurso.ativo,
              configuracoesMensais: configComTurno,
            };
          })
        );
        
        return resultados;
      }),
  }),
});

export type AppRouter = typeof appRouter;
