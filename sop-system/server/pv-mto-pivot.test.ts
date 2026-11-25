import { describe, expect, it } from "vitest";
import {
  aggregatePvMtoPivotBySkuMes,
  buildPvMtoPivotLinesFromEntregas,
  buildPvPivotLinesFromEntregas,
  computeEntregaMonthColumns,
  pvMtoPivotLineKey,
  sumPvMtoPivotMonthTotals,
} from "@shared/pv-mto-pivot";

describe("buildPvMtoPivotLinesFromEntregas", () => {
  const anoInicio = 2026;
  const mesInicio = 11; // ciclo nov/26 → m1 = dez/26

  it("agrupa por pedido × SKU × preço e soma entregas no mesmo mês", () => {
    const lines = buildPvMtoPivotLinesFromEntregas(
      [
        {
          codigo: "PV-1",
          sku: "80.06.001730",
          precoUnitario: 1.7,
          anoEnt: 2026,
          mesEnt: 12,
          quantidade: 4000,
          receitaBruta: 6800,
        },
        {
          codigo: "PV-1",
          sku: "80.06.001730",
          precoUnitario: 1.7,
          anoEnt: 2026,
          mesEnt: 12,
          quantidade: 2000,
          receitaBruta: 3400,
        },
      ],
      anoInicio,
      mesInicio
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]!.meses[0]).toBe(6000);
    expect(lines[0]!.quantidadeTotal).toBe(6000);
  });

  it("separa meses diferentes em colunas distintas do horizonto", () => {
    const lines = buildPvMtoPivotLinesFromEntregas(
      [
        {
          codigo: "PV-2",
          sku: "80.02.000951",
          precoUnitario: 2,
          anoEnt: 2027,
          mesEnt: 1,
          quantidade: 100,
        },
        {
          codigo: "PV-2",
          sku: "80.02.000951",
          precoUnitario: 2,
          anoEnt: 2027,
          mesEnt: 3,
          quantidade: 50,
        },
      ],
      anoInicio,
      mesInicio
    );
    expect(lines[0]!.meses[1]).toBe(100); // jan/27 = m2
    expect(lines[0]!.meses[3]).toBe(50); // mar/27 = m4
    expect(lines[0]!.quantidadeTotal).toBe(150);
  });

  it("ignora entregas fora do horizonto do ciclo", () => {
    const lines = buildPvMtoPivotLinesFromEntregas(
      [
        {
          codigo: "PV-3",
          sku: "80.01.000001",
          precoUnitario: 1,
          anoEnt: 2025,
          mesEnt: 6,
          quantidade: 999,
        },
        {
          codigo: "PV-3",
          sku: "80.01.000001",
          precoUnitario: 1,
          anoEnt: 2026,
          mesEnt: 12,
          quantidade: 10,
        },
      ],
      anoInicio,
      mesInicio
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]!.quantidadeTotal).toBe(10);
  });

  it("mantém linhas distintas para o mesmo SKU em pedidos diferentes", () => {
    const lines = buildPvMtoPivotLinesFromEntregas(
      [
        {
          codigo: "A",
          sku: "80.06.001730",
          precoUnitario: 1.7,
          anoEnt: 2026,
          mesEnt: 12,
          quantidade: 100,
        },
        {
          codigo: "B",
          sku: "80.06.001730",
          precoUnitario: 1.7,
          anoEnt: 2026,
          mesEnt: 12,
          quantidade: 200,
        },
      ],
      anoInicio,
      mesInicio
    );
    expect(lines).toHaveLength(2);
    expect(pvMtoPivotLineKey("A", "80.06.001730", 1.7)).not.toBe(
      pvMtoPivotLineKey("B", "80.06.001730", 1.7)
    );
  });

  it("monta colunas dinâmicas da carteira", () => {
    const cols = computeEntregaMonthColumns([
      { codigo: "1", sku: "80.01.000001", precoUnitario: 1, anoEnt: 2026, mesEnt: 12, quantidade: 1 },
      { codigo: "1", sku: "80.01.000001", precoUnitario: 1, anoEnt: 2027, mesEnt: 2, quantidade: 2 },
    ]);
    expect(cols).toHaveLength(2);
    const lines = buildPvPivotLinesFromEntregas(
      [
        {
          codigo: "1",
          sku: "80.01.000001",
          precoUnitario: 1,
          anoEnt: 2026,
          mesEnt: 12,
          quantidade: 10,
        },
        {
          codigo: "1",
          sku: "80.01.000001",
          precoUnitario: 1,
          anoEnt: 2027,
          mesEnt: 2,
          quantidade: 5,
        },
      ],
      cols
    );
    expect(lines[0]?.meses[0]).toBe(10);
    expect(lines[0]?.meses[1]).toBe(5);
  });

  it("agrega por SKU×mês para conferência com consolidado", () => {
    const lines = buildPvMtoPivotLinesFromEntregas(
      [
        {
          codigo: "P1",
          sku: "80.01.000001",
          precoUnitario: 1,
          anoEnt: 2026,
          mesEnt: 12,
          quantidade: 30,
        },
        {
          codigo: "P2",
          sku: "80.01.000001",
          precoUnitario: 2,
          anoEnt: 2027,
          mesEnt: 1,
          quantidade: 20,
        },
      ],
      anoInicio,
      mesInicio
    );
    const bySku = aggregatePvMtoPivotBySkuMes(lines);
    expect(bySku.get("80.01.000001")?.[0]).toBe(30);
    expect(bySku.get("80.01.000001")?.[1]).toBe(20);
    const totals = sumPvMtoPivotMonthTotals(lines);
    expect(totals[0]).toBe(30);
    expect(totals[1]).toBe(20);
  });
});