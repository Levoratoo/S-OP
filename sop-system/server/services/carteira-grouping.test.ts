import { describe, expect, it } from "vitest";
import { aggregateCarteiraPedidosPorPedidoSku } from "./erp-mssql";

describe("aggregateCarteiraPedidosPorPedidoSku", () => {
  it("consolida entregas do mesmo pedido+SKU em uma linha", () => {
    const rows = aggregateCarteiraPedidosPorPedidoSku([
      {
        codigo: "PV-100",
        sku: "80.01.000001",
        anoEnt: 2026,
        mesEnt: 3,
        quantidade: 100,
        receitaBruta: 1000,
      },
      {
        codigo: "PV-100",
        sku: "80.01.000001",
        anoEnt: 2026,
        mesEnt: 4,
        quantidade: 50,
        receitaBruta: 500,
      },
      {
        codigo: "PV-100",
        sku: "80.01.000002",
        anoEnt: 2026,
        mesEnt: 3,
        quantidade: 10,
        receitaBruta: 100,
      },
    ]);

    expect(rows).toHaveLength(2);
    const sku1 = rows.find(r => r.sku === "80.01.000001");
    expect(sku1?.quantidade).toBe(150);
    expect(sku1?.receitaBruta).toBe(1500);
    expect(sku1?.competencia).toBe("2026-03-01");
    expect(sku1?.sequencia).toBe(1);
    expect(rows.find(r => r.sku === "80.01.000002")?.sequencia).toBe(2);
  });
});
