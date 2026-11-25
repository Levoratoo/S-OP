import { describe, expect, it } from "vitest";
import {
  CONSOLIDADO_EXCEL_HEADERS,
  consolidadoQtd,
  consolidadoTipoComercial,
  consolidadoTipoLinha,
  consolidadoTp,
  consolidadoValorTotal,
  resolveConsolidadoRelatorio,
} from "@shared/consolidado-arquivo";

describe("arquivo Consolidado — mapeamento por origem", () => {
  it("resolve relatório MTS / MTO PV / CRM (sem JITO)", () => {
    expect(resolveConsolidadoRelatorio("MTS")).toBe("MTS");
    expect(resolveConsolidadoRelatorio("JITO")).toBe("MTS");
    expect(resolveConsolidadoRelatorio("PV_MTO")).toBe("MTO PV");
    expect(resolveConsolidadoRelatorio("CRM")).toBe("CRM");
  });

  it("Tipo Comercial: MTS JIT; ATD no cadastro; PV/CRM PRG", () => {
    expect(consolidadoTipoComercial("MTS", "JIT")).toBe("JIT");
    expect(consolidadoTipoComercial("MTS", "ATD")).toBe("ATD");
    expect(consolidadoTipoComercial("MTO PV", "ATD")).toBe("PRG");
    expect(consolidadoTipoComercial("CRM", null)).toBe("PRG");
  });

  it("Tp: JIT padrão MTS; ATD → PRG", () => {
    expect(consolidadoTp("MTS", "JIT")).toBe("JIT");
    expect(consolidadoTp("MTS", "ATD")).toBe("PRG");
    expect(consolidadoTp("MTO PV", null)).toBe("PRG");
    expect(consolidadoTp("CRM", null)).toBe("PRG");
  });

  it("Tipo linha — Aposta só no CRM", () => {
    expect(consolidadoTipoLinha("MTS", null)).toBe("Colaboração");
    expect(consolidadoTipoLinha("CRM", "COLABORACAO")).toBe("Colaboração");
    expect(consolidadoTipoLinha("CRM", "APOSTA")).toBe("Aposta");
  });

  it("Valor Total = round(Qtd × Venda)", () => {
    expect(consolidadoValorTotal(29952, 0.14)).toBe(4193);
    expect(consolidadoValorTotal(4000, 1.7)).toBe(6800);
    expect(consolidadoValorTotal(20000, 6.17)).toBe(123400);
  });

  it("Qtd inteira", () => {
    expect(consolidadoQtd(7219.2)).toBe(7219);
    expect(consolidadoQtd(0.4)).toBe(0);
  });

  it("cabeçalhos Excel na ordem do modelo", () => {
    expect(CONSOLIDADO_EXCEL_HEADERS).toHaveLength(15);
    expect(CONSOLIDADO_EXCEL_HEADERS[0]).toBe("sku/marca");
    expect(CONSOLIDADO_EXCEL_HEADERS[14]).toBe("Familia");
  });
});
