import { describe, expect, it } from "vitest";
import { assertCicloStatusTransition } from "./services/ciclo-status-flow";
import { TRPCError } from "@trpc/server";

function expectForbidden(fn: () => void) {
  expect(fn).toThrow(TRPCError);
}

describe("ciclo status", () => {
  it("avança um passo", () => {
    expect(() =>
      assertCicloStatusTransition("ABERTO", "EM_COLABORACAO", { isAdmin: false })
    ).not.toThrow();
  });

  it("não volta de APROVADO", () => {
    expectForbidden(() =>
      assertCicloStatusTransition("APROVADO", "CONSENSO", { isAdmin: true, motivo: "x" })
    );
  });

  it("reabrir exige admin e motivo", () => {
    expectForbidden(() =>
      assertCicloStatusTransition("EM_COLABORACAO", "ABERTO", { isAdmin: false, motivo: "x" })
    );
    expectForbidden(() =>
      assertCicloStatusTransition("EM_COLABORACAO", "ABERTO", { isAdmin: true })
    );
    expect(() =>
      assertCicloStatusTransition("EM_COLABORACAO", "ABERTO", { isAdmin: true, motivo: "ajuste" })
    ).not.toThrow();
  });

  it("fecharCiclo pode ir a APROVADO a partir da colaboração", () => {
    expect(() =>
      assertCicloStatusTransition("EM_COLABORACAO", "APROVADO", { isAdmin: false, viaFechar: true })
    ).not.toThrow();
  });
});
