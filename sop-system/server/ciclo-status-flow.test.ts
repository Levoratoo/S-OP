import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { assertCicloStatusTransition } from "./services/ciclo-status-flow";

function expectForbidden(fn: () => void) {
  try {
    fn();
    expect.fail("expected TRPCError");
  } catch (err) {
    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe("FORBIDDEN");
  }
}

describe("cicloComercial status flow", () => {
  it("bloqueia FECHADO e CONSOLIDADO via updateStatus", () => {
    expectForbidden(() => assertCicloStatusTransition("ABERTO", "FECHADO", false));
    expectForbidden(() => assertCicloStatusTransition("EM_COLABORACAO", "CONSOLIDADO", true));
  });

  it("permite ABERTO <-> EM_COLABORACAO", () => {
    expect(() => assertCicloStatusTransition("ABERTO", "EM_COLABORACAO", false)).not.toThrow();
    expect(() => assertCicloStatusTransition("EM_COLABORACAO", "ABERTO", false)).not.toThrow();
  });

  it("reabrir FECHADO exige admin", () => {
    expectForbidden(() => assertCicloStatusTransition("FECHADO", "ABERTO", false));
    expect(() => assertCicloStatusTransition("FECHADO", "ABERTO", true)).not.toThrow();
  });
});
