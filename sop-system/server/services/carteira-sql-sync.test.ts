import { describe, expect, it } from "vitest";
import { CARTEIRA_ERP_SOURCE } from "./erp-mssql";

describe("carteira ERP source", () => {
  it("defaults to View_Usr_PedidoVenda_SEOP1", () => {
    expect(CARTEIRA_ERP_SOURCE).toContain("PedidoVenda_SEOP1");
  });
});
