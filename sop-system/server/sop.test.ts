import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("S&OP System Routes", () => {
  describe("auth.me", () => {
    it("returns the current user when authenticated", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      
      const result = await caller.auth.me();
      
      expect(result).toBeDefined();
      expect(result?.name).toBe("Test User");
      expect(result?.email).toBe("test@example.com");
    });
  });

  describe("familias router", () => {
    it("has list procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("familias.list");
    });

    it("has create procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("familias.create");
    });

    it("has update procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("familias.update");
    });

    it("has delete procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("familias.delete");
    });
  });

  describe("produtos router", () => {
    it("has list procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("produtos.list");
    });

    it("has create procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("produtos.create");
    });

    it("has getById procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("produtos.getById");
    });

    it("has update procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("produtos.update");
    });

    it("has delete procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("produtos.delete");
    });

    it("has importBatch procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("produtos.importBatch");
    });
  });

  describe("clientes router", () => {
    it("has list procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("clientes.list");
    });

    it("has create procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("clientes.create");
    });
  });

  describe("recursos router", () => {
    it("has list procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("recursos.list");
    });

    it("has create procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("recursos.create");
    });
  });

  describe("hierarquias router", () => {
    it("has list procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("hierarquias.list");
    });

    it("has create procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("hierarquias.create");
    });
  });

  describe("membros router", () => {
    it("has list procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("membros.list");
    });

    it("has create procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("membros.create");
    });
  });

  describe("tabelas auxiliares routers", () => {
    it("has statusCadastro.list procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("statusCadastro.list");
    });

    it("has tiposNegocio.list procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("tiposNegocio.list");
    });

    it("has tiposEstoque.list procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("tiposEstoque.list");
    });

    it("has linhas.list procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("linhas.list");
    });

    it("has modelos.list procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("modelos.list");
    });

    it("has statusCadastro.importBatch procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("statusCadastro.importBatch");
    });

    it("has linhas.importBatch procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("linhas.importBatch");
    });

    it("has modelos.importBatch procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("modelos.importBatch");
    });

    it("has tamanhos.list procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("tamanhos.list");
    });

    it("has tamanhos.create procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("tamanhos.create");
    });

    it("has tamanhos.importBatch procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("tamanhos.importBatch");
    });
  });

  describe("vendas router", () => {
    it("has list procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("vendas.list");
    });

    it("has create procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("vendas.create");
    });

    it("has importBatch procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("vendas.importBatch");
    });
  });

  describe("dashboard router", () => {
    it("has demanda procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("dashboard.demanda");
    });

    it("has vendasPorMes procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("dashboard.vendasPorMes");
    });
  });

  describe("roteiros router", () => {
    it("has list procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("roteiros.list");
    });

    it("has create procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("roteiros.create");
    });
  });

  describe("paradas router", () => {
    it("has list procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("paradas.list");
    });

    it("has create procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("paradas.create");
    });
  });

  describe("diasUteis router", () => {
    it("has list procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("diasUteis.list");
    });

    it("has create procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("diasUteis.create");
    });
  });

  describe("faturamento router", () => {
    it("has list procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("faturamento.list");
    });

    it("has stats procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("faturamento.stats");
    });

    it("has importBatch procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("faturamento.importBatch");
    });

    it("has porMes procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("faturamento.porMes");
    });

    it("has clear procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("faturamento.clear");
    });
  });

  describe("marcas router", () => {
    it("has list procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("marcas.list");
    });

    it("has create procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("marcas.create");
    });

    it("has update procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("marcas.update");
    });

    it("has delete procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("marcas.delete");
    });

    it("has importBatch procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("marcas.importBatch");
    });
  });

  describe("gestores router", () => {
    it("has list procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("gestores.list");
    });

    it("has create procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("gestores.create");
    });

    it("has update procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("gestores.update");
    });

    it("has delete procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("gestores.delete");
    });
  });

  describe("gestorMarca router", () => {
    it("has list procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("gestorMarca.list");
    });

    it("has create procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("gestorMarca.create");
    });

    it("has update procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("gestorMarca.update");
    });

    it("has delete procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("gestorMarca.delete");
    });
  });

  describe("deParaCodigos router", () => {
    it("has list procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("deParaCodigos.list");
    });

    it("has create procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("deParaCodigos.create");
    });

    it("has update procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("deParaCodigos.update");
    });

    it("has delete procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("deParaCodigos.delete");
    });

    it("has importBatch procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("deParaCodigos.importBatch");
    });

    it("has getCodigoAtual procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("deParaCodigos.getCodigoAtual");
    });
  });

  describe("sharepoint router", () => {
    it("has getConfig procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("sharepoint.getConfig");
    });

    it("has saveConfig procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("sharepoint.saveConfig");
    });

    it("has testarConexao procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("sharepoint.testarConexao");
    });

    it("has sincronizar procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("sharepoint.sincronizar");
    });

    it("has getLogs procedure defined", () => {
      expect(appRouter._def.procedures).toHaveProperty("sharepoint.getLogs");
    });
  });
});
