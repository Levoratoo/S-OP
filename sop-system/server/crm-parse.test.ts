import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  CRM_EXCEL_HEADERS,
  CrmExcelLayoutError,
  parseCrmExcel,
  validateCrmExcelHeaders,
} from "../client/src/pages/demanda/parse-crm-excel";

function buildCrmBuffer(headers: string[], rows: unknown[][]) {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "CRM");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

describe("parseCrmExcel layout TI", () => {
  it("aceita exatamente as 15 colunas na ordem oficial", () => {
    expect(() => validateCrmExcelHeaders([...CRM_EXCEL_HEADERS])).not.toThrow();
  });

  it("rejeita ordem ou nomes diferentes", () => {
    const swapped = [...CRM_EXCEL_HEADERS];
    const tmp = swapped[0]!;
    swapped[0] = swapped[1]!;
    swapped[1] = tmp;
    expect(() => validateCrmExcelHeaders(swapped)).toThrow(CrmExcelLayoutError);
    expect(() => validateCrmExcelHeaders(CRM_EXCEL_HEADERS.slice(0, 10))).toThrow(
      CrmExcelLayoutError
    );
  });

  it("mapeia Produto, classificação e Qtd Mês", () => {
    const buffer = buildCrmBuffer([...CRM_EXCEL_HEADERS], [
      [
        "Adidas",
        "Gestor A",
        "80.03.002154-Sacola",
        10,
        100,
        1000,
        "OR-123",
        2,
        50,
        500,
        "15/03/2026",
        "PRG",
        "JIT",
        "Colaboração",
        "Quente",
      ],
    ]);
    const rows = parseCrmExcel(buffer);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.sku).toBe("80.03.002154");
    expect(rows[0]?.gestor).toBe("Gestor A");
    expect(rows[0]?.tipo).toBe("Colaboração");
    expect(rows[0]?.qtdMes).toBe(50);
    expect(rows[0]?.dataFaturamento).toBe("2026-03-15");
    expect(rows[0]?.modalidade).toBe("PRG");
    expect(rows[0]?.tipoNegocio).toBe("JIT");
  });
});
