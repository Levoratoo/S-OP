import { describe, expect, it } from "vitest";
import {
  escolherCicloDoMes,
  colunasGradeMts,
  faixaPvVsRe,
  mesEhExcecao,
  mesesFuturosGrade,
  skuEhExcecao,
  mesesPassadosGrade,
  periodoAnoContraAno,
  pvVsRe,
  somaPeriodo,
  variacaoAno,
} from "@shared/grade-colab";

describe("grade MTS", () => {
  it("compara janeiro até o mês do ciclo, no ano do ciclo e no anterior", () => {
    const periodo = periodoAnoContraAno(2026, 11);
    expect(periodo.rotuloAtual).toBe("jan–nov/26");
    expect(periodo.rotuloAnterior).toBe("jan–nov/25");
    expect(variacaoAno(45200, 40210).tipo).toBe("valor");
    if (variacaoAno(45200, 40210).tipo === "valor") {
      expect(variacaoAno(45200, 40210)).toMatchObject({ tipo: "valor" });
      const pct = (variacaoAno(45200, 40210) as { pct: number }).pct;
      expect(pct).toBeCloseTo((45200 / 40210 - 1) * 100, 4);
      expect(pct).toBeGreaterThan(0);
    }
    const queda = variacaoAno(80, 100);
    expect(queda.tipo).toBe("valor");
    if (queda.tipo === "valor") expect(queda.pct).toBeCloseTo(-20, 6);
    expect(variacaoAno(10, 0)).toEqual({ tipo: "novo" });
    expect(variacaoAno(0, 0)).toEqual({ tipo: "vazio" });
    expect(somaPeriodo([10, 20, 30, 99], 3)).toBe(60);
  });

  it("PV vs RE usa a foto quando existe e não inventa previsto", () => {
    expect(pvVsRe(80, 100)).toBe(80);
    expect(pvVsRe(0, null)).toBeNull();
    expect(pvVsRe(10, 0)).toBeNull();
    expect(faixaPvVsRe(100)).toBe("verde");
    expect(faixaPvVsRe(80)).toBe("amarelo");
    expect(faixaPvVsRe(40)).toBe("vermelho");
    expect(faixaPvVsRe(null)).toBe("neutro");

    const ciclo = { id: 4, anoInicio: 2026, mesInicio: 8 };
    const cobrindo = escolherCicloDoMes({ ano: 2026, mes: 11 }, [ciclo, { id: 2, anoInicio: 2025, mesInicio: 11 }]);
    expect(cobrindo?.id).toBe(4);
    expect(cobrindo?.indice).toBe(2);
    expect(escolherCicloDoMes({ ano: 2024, mes: 1 }, [ciclo])).toBeNull();
  });

  it("ordena SKU, descrição, YoY, passados e futuros", () => {
    const ids = colunasGradeMts(2026, 11).map(coluna => coluna.id);
    expect(ids.slice(0, 3)).toEqual(["sku", "descricao", "yoy"]);
    expect(ids[3]).toBe("2026-1-realizado");
    expect(ids[4]).toBe("2026-1-previsto");
    expect(ids[5]).toBe("2026-1-aderencia");
    expect(mesesPassadosGrade(2026, 11)).toHaveLength(11);
    expect(mesesFuturosGrade(2026, 11)[0]).toEqual({ ano: 2026, mes: 12 });
    const futuro = ids.filter(id => id.startsWith("2026-12-"));
    expect(futuro).toEqual(["2026-12-aa", "2026-12-prev", "2026-12-colab"]);
    expect(ids.at(-1)).toBe("total");
    expect(colunasGradeMts(2026, 12).some(coluna => coluna.grupo === "futuro" && coluna.id.startsWith("2027-1-"))).toBe(
      true
    );
  });

  it("marca exceção pela faixa e trata previsto zero", () => {
    const estoura = { realizado: 125, previstoCongelado: 100, estatistica: null };
    expect(mesEhExcecao(estoura, 20)).toBe(true);
    expect(mesEhExcecao(estoura, 30)).toBe(false);
    expect(mesEhExcecao(estoura, 50)).toBe(false);
    expect(mesEhExcecao({ realizado: 5, previstoCongelado: 0, estatistica: 999 }, 30)).toBe(true);
    expect(mesEhExcecao({ realizado: 0, previstoCongelado: 0, estatistica: 999 }, 30)).toBe(false);
    expect(mesEhExcecao({ realizado: 10, previstoCongelado: null, estatistica: 8 }, 20)).toBe(true);
    expect(mesEhExcecao({ realizado: 10, previstoCongelado: null, estatistica: null }, 30)).toBe(false);
    expect(
      skuEhExcecao(
        [
          { realizado: 0, previstoCongelado: 0, estatistica: null },
          { realizado: 80, previstoCongelado: 100, estatistica: null },
        ],
        30
      )
    ).toBe(false);
    expect(
      skuEhExcecao(
        [
          { realizado: 0, previstoCongelado: 0, estatistica: null },
          { realizado: 80, previstoCongelado: 100, estatistica: null },
        ],
        15
      )
    ).toBe(true);
  });
});
