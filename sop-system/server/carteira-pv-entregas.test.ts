import { describe, expect, it } from "vitest";
import { buildCarteiraPvEntregasInserts } from "./services/carteira-pv-entregas";

describe("carteira_pv_entregas agregação", () => {
  it("soma duplicatas na chave codigo×sku×preco×mês antes do insert", () => {
    const map = new Map<string, string>();
    const rows = buildCarteiraPvEntregasInserts(
      [
        {
          codigo: "P1",
          sku: "80.01.000001",
          precoUnitario: 1.5,
          anoEnt: 2026,
          mesEnt: 12,
          quantidade: 100,
          receitaBruta: 150,
        },
        {
          codigo: "P1",
          sku: "80.01.000001",
          precoUnitario: 1.5,
          anoEnt: 2026,
          mesEnt: 12,
          quantidade: 50,
          receitaBruta: 75,
        },
      ],
      map
    );
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.quantidade)).toBe(150);
    expect(Number(rows[0]!.receitaBruta)).toBe(225);
  });
});