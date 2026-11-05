import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createAuthContext(role: "user" | "admin" = "user"): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "manus",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

describe("carteiraPedidos mutations", () => {
  it("create/update/delete desativados", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await expect(
      caller.carteiraPedidos.create({
        codigo: "X",
        competencia: "2026-01-01",
        quantidade: "1",
        receitaBruta: "1",
        produtoId: 1,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller.carteiraPedidos.update({ id: 1, quantidade: "2" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.carteiraPedidos.delete({ id: 1 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
