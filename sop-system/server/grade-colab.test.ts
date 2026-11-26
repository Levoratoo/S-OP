import { describe, expect, it } from "vitest";
import {
  escolherCicloDoMes,
  escolherCicloRecenteDoMes,
  colunasGradeMts,
  faixaPvVsRe,
  interpretarColunaProjecao,
  mesEhExcecao,
  mesesFuturosGrade,
  skuEhExcecao,
  mesesPassadosGrade,
  periodoAnoContraAno,
  pvVsRe,
  resolverPrevistoMes,
  serieEstatisticaDeLinhas,
  skuDaPrevisaoJob,
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
    const estoura = { realizado: 125, base: 100 };
    expect(mesEhExcecao(estoura, 20)).toBe(true);
    expect(mesEhExcecao(estoura, 30)).toBe(false);
    expect(mesEhExcecao(estoura, 50)).toBe(false);
    expect(mesEhExcecao({ realizado: 5, base: 0 }, 30)).toBe(true);
    expect(mesEhExcecao({ realizado: 0, base: 0 }, 30)).toBe(false);
    expect(mesEhExcecao({ realizado: 10, base: 8 }, 20)).toBe(true);
    expect(mesEhExcecao({ realizado: 10, base: null }, 30)).toBe(false);
    expect(
      skuEhExcecao(
        [
          { realizado: 0, base: 0 },
          { realizado: 80, base: 100 },
        ],
        30
      )
    ).toBe(false);
    expect(
      skuEhExcecao(
        [
          { realizado: 0, base: 0 },
          { realizado: 80, base: 100 },
        ],
        15
      )
    ).toBe(true);
  });

  it("escolhe a base na ordem foto, ciclo e job", () => {
    const foto = { cicloId: 4, porSku: { A: 10 } };
    const ciclo = { cicloId: 13, status: "EM_COLABORACAO", porSku: { A: 20, B: 0 } };
    const jobs = [
      { jobId: 20, porSku: { A: 30, C: 7 } },
      { jobId: 18, porSku: { A: 40, D: 5 } },
    ];
    expect(resolverPrevistoMes({ sku: "A", foto, ciclo, jobs })).toMatchObject({
      valor: 10,
      origem: "foto",
      rotulo: "Foto congelada do ciclo #4",
    });
    expect(resolverPrevistoMes({ sku: "Z", foto, ciclo, jobs })).toMatchObject({ valor: 0, origem: "foto" });
    const semFoto = resolverPrevistoMes({ sku: "A", foto: null, ciclo, jobs });
    expect(semFoto).toMatchObject({
      valor: 20,
      origem: "ciclo",
      rotulo: "Previsão do ciclo #13 (não congelado)",
    });
    expect(resolverPrevistoMes({ sku: "B", foto: null, ciclo, jobs })).toMatchObject({ valor: 0, origem: "ciclo" });
    expect(resolverPrevistoMes({ sku: "C", foto: null, ciclo, jobs })).toMatchObject({
      valor: 7,
      origem: "job",
      rotulo: "Estatística job #20",
    });
    expect(resolverPrevistoMes({ sku: "D", foto: null, ciclo: null, jobs })).toMatchObject({
      valor: 5,
      origem: "job",
      rotulo: "Estatística job #18",
    });
    expect(resolverPrevistoMes({ sku: "E", foto: null, ciclo: null, jobs })).toBeNull();
    expect(resolverPrevistoMes({ sku: "A", foto: null, ciclo: { ...ciclo, status: "APROVADO" }, jobs })?.rotulo).toBe(
      "Previsão do ciclo #13 (aprovado, sem foto)"
    );
  });

  it("o ciclo da base é o mais recente que cobre o mês, nunca o ciclo atual", () => {
    const ciclos = [
      { id: 3, anoInicio: 2025, mesInicio: 12 },
      { id: 4, anoInicio: 2025, mesInicio: 11 },
      { id: 10, anoInicio: 2026, mesInicio: 1 },
      { id: 15, anoInicio: 2026, mesInicio: 11 },
    ];
    const janeiro = escolherCicloRecenteDoMes({ ano: 2026, mes: 1 }, ciclos, 15);
    expect(janeiro?.id).toBe(4);
    expect(janeiro?.indice).toBe(1);
    expect(escolherCicloRecenteDoMes({ ano: 2026, mes: 1 }, ciclos, 4)?.id).toBe(3);
    expect(escolherCicloRecenteDoMes({ ano: 2024, mes: 1 }, ciclos, 15)).toBeNull();
  });

  it("lê a estatística do melhor modelo do job e ignora código que não é SKU", () => {
    expect(interpretarColunaProjecao("jan/2026_HOLT_WINTERS")).toEqual({ ano: 2026, mes: 1, metodo: "HOLT_WINTERS" });
    expect(interpretarColunaProjecao("jan-26_MEDIA_SIMPLES")?.ano).toBe(2026);
    expect(skuDaPrevisaoJob("80.01.000001-ADIDAS")).toBe("80.01.000001");
    expect(skuDaPrevisaoJob("MTS-Adidas-Automatica")).toBeNull();
    const serie = serieEstatisticaDeLinhas([
      {
        Codigo: "80.01.000001-ADIDAS",
        MELHOR_CENARIO: "Holt_Winters",
        "jan/2026_HOLT_WINTERS": 12,
        "jan/2026_MEDIA_SIMPLES": 99,
        "fev/2026_HOLT_WINTERS": 0,
      },
      {
        Codigo: "MTS-Adidas-Automatica",
        MELHOR_CENARIO: "ENSEMBLE",
        "jan/2026_ENSEMBLE": 500,
      },
    ]);
    expect(serie["80.01.000001"]).toEqual({ "2026-1": 12, "2026-2": 0 });
    expect(serie["MTS-ADIDAS-AUTOMATICA"]).toBeUndefined();
  });
});
