import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import XLSX from "xlsx";
import {
  alignCycleMonths,
  calculateRateio,
  getClosedWindowBounds,
  getSeasonalityIndex,
  netSalesQuantity,
} from "./services/desagregacao";

const fixtureDir = path.resolve(process.cwd(), "fixtures/paridade-word");
const goldenPath = path.join(fixtureDir, "job4_visao_executiva.golden.json");
const workbookPath = path.join(fixtureDir, "job4_relatorio_previsao.xlsx");

type Golden = {
  jobId: number;
  sheetNames: string[];
  visaoExecutiva: {
    rowCount: number;
    sumPrevisaoFinalSugerida: number;
    sumHistorico12M: number;
    sampleGrupos: Array<{
      codigo: string;
      previsaoFinalSugerida: number;
      historico12M: number;
    }>;
  };
  reportsExpected: string[];
  tolerance: { absolute: number; relative: number };
};

function withinTolerance(actual: number, expected: number, absolute: number, relative: number) {
  const delta = Math.abs(actual - expected);
  return delta <= Math.max(absolute, Math.abs(expected) * relative);
}

describe("golden dataset congelado (job #4)", () => {
  it("mantém o manifesto e o Excel de referência no repositório", () => {
    expect(existsSync(goldenPath)).toBe(true);
    expect(existsSync(workbookPath)).toBe(true);
  });

  it("reconcilia Visao_Executiva do Excel com o golden", () => {
    const golden = JSON.parse(readFileSync(goldenPath, "utf8")) as Golden;
    const workbook = XLSX.readFile(workbookPath, { cellDates: false });
    expect(workbook.SheetNames).toEqual(golden.sheetNames);

    const sheet = workbook.Sheets.Visao_Executiva;
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: null,
    });
    expect(rows.length).toBe(golden.visaoExecutiva.rowCount);

    const sumFinal = rows.reduce(
      (total, row) => total + Number(row["Previsão Final Sugerida"] ?? 0),
      0
    );
    const sumHist = rows.reduce(
      (total, row) => total + Number(row["Historico 12M"] ?? 0),
      0
    );

    expect(
      withinTolerance(
        sumFinal,
        golden.visaoExecutiva.sumPrevisaoFinalSugerida,
        golden.tolerance.absolute,
        golden.tolerance.relative
      )
    ).toBe(true);
    expect(
      withinTolerance(
        sumHist,
        golden.visaoExecutiva.sumHistorico12M,
        golden.tolerance.absolute,
        golden.tolerance.relative
      )
    ).toBe(true);

    for (const sample of golden.visaoExecutiva.sampleGrupos) {
      const row = rows.find(item => String(item.Codigo) === sample.codigo);
      expect(row).toBeTruthy();
      expect(
        withinTolerance(
          Number(row?.["Previsão Final Sugerida"] ?? 0),
          sample.previsaoFinalSugerida,
          golden.tolerance.absolute,
          golden.tolerance.relative
        )
      ).toBe(true);
    }
  });

  it("declara os sete relatórios comerciais exigidos pelo Word", () => {
    const golden = JSON.parse(readFileSync(goldenPath, "utf8")) as Golden;
    expect(golden.reportsExpected).toEqual([
      "1-Consolidado",
      "2-Resumo R$",
      "3-PVxCRM",
      "4-Resumo PROD",
      "5-Base Ciclo",
      "6-MTO Variação",
      "7-RFS",
    ]);
  });
});

describe("fórmulas que sustentam a paridade do ciclo", () => {
  it("usa janela fechada 6/12 e desloca sazonalidade pelo início do ciclo", () => {
    const bounds = getClosedWindowBounds(new Date(2026, 8, 17));
    expect(bounds.endExclusive).toEqual(new Date(2026, 8, 1));
    expect(getSeasonalityIndex(9, 0)).toBe(8);
    expect(getSeasonalityIndex(9, 4)).toBe(0);
  });

  it("liquida devoluções e aplica fallback de rateio sem inventar participação", () => {
    expect(netSalesQuantity("DEVOLUCAO", 40)).toBe(-40);
    expect(calculateRateio(25, 100)).toBe(0.25);
    expect(calculateRateio(0, 0, 0.33)).toBe(0.33);
  });

  it("alinha colaboração anterior por competência cruzando o ano", () => {
    const aligned = alignCycleMonths(2025, 12, 2026, 1, {
      m1: "10",
      m2: "20",
      m3: "30",
      m4: "0",
      m5: "0",
      m6: "0",
      m7: "0",
      m8: "0",
      m9: "0",
      m10: "0",
      m11: "0",
      m12: "120",
    });
    expect(aligned.m1).toBe("20");
    expect(aligned.m2).toBe("30");
    expect(aligned.m12).toBe("0");
  });
});
