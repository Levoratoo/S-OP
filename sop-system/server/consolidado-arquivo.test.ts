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
  it("resolve relatório MTS / JITO / MTO PV / CRM", () => {
    expect(resolveConsolidadoRelatorio("MTS", "JIT")).toBe("MTS");
    expect(resolveConsolidadoRelatorio("MTS", "ATD")).toBe("JITO");
    expect(resolveConsolidadoRelatorio("JITO", null)).toBe("JITO");
    expect(resolveConsolidadoRelatorio("PV_MTO", "PRG")).toBe("MTO PV");
    expect(resolveConsolidadoRelatorio("CRM", null)).toBe("CRM");
  });

  it("Tipo Comercial conforme modelo", () => {
    expect(consolidadoTipoComercial("MTS")).toBe("JIT");
    expect(consolidadoTipoComercial("JITO")).toBe("ATD");
    expect(consolidadoTipoComercial("MTO PV")).toBe("PRG");
    expect(consolidadoTipoComercial("CRM")).toBe("PRG");
  });

  it("Tp conforme modelo", () => {
    expect(consolidadoTp("MTS")).toBe("JIT");
    expect(consolidadoTp("JITO")).toBe("PRG");
    expect(consolidadoTp("MTO PV")).toBe("PRG");
    expect(consolidadoTp("CRM")).toBe("PRG");
  });

  it("Tipo linha — Aposta só no CRM", () => {
    expect(consolidadoTipoLinha("MTS", null)).toBe("Colaboração");
    expect(consolidadoTipoLinha("JITO", null)).toBe("Colaboração");
    expect(consolidadoTipoLinha("CRM", "COLABORACAO")).toBe("Colaboração");
    expect(consolidadoTipoLinha("CRM", "APOSTA")).toBe("Aposta");
    expect(consolidadoTipoLinha("CRM", "Oportunidade")).toBe("Colaboração");
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
