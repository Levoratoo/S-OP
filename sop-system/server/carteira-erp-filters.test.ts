import { describe, expect, it } from "vitest";
import { buildCarteiraPedidosAbertoQuery } from "./services/erp-mssql";

describe("Carteira ERP — filtros Liberado + PRG", () => {
  it("query restringe status e tipo PRG", () => {
    const sql = buildCarteiraPedidosAbertoQuery();
    expect(sql).toMatch(/Liberado/i);
    expect(sql).toMatch(/PRG/i);
  });
});
