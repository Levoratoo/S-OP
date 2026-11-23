import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  CRM_EXCEL_HEADERS,
  CrmExcelLayoutError,
  parseCrmExcel,
  skuFromProdutoCrm,
  validateCrmExcelHeaders,
} from "@shared/crm-excel-parse";

function buildCrmBuffer(headers: string[], rows: unknown[][]) {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "CRM");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

const HEADERS_PEDRO = [...CRM_EXCEL_HEADERS];

describe("parseCrmExcel layout Pedro", () => {
  it("aceita cabeçalho oficial com coluna Tp", () => {
    expect(() => validateCrmExcelHeaders([...HEADERS_PEDRO])).not.toThrow();
    const withTemperatura = [...HEADERS_PEDRO];
    withTemperatura[14] = "Temperatura";
    expect(() => validateCrmExcelHeaders(withTemperatura)).not.toThrow();
  });

  it("rejeita número de colunas errado", () => {
    expect(() => validateCrmExcelHeaders(HEADERS_PEDRO.slice(0, 10))).toThrow(CrmExcelLayoutError);
  });

  it("extrai SKU na primeira ocorrência e descrição", () => {
    expect(skuFromProdutoCrm("80.04.000125 : 80.04.000125 - Sacola M Nova").sku).toBe(
      "80.04.000125"
    );
    expect(skuFromProdutoCrm("80.02.000876-Sacola M - The Cosmetics").sku).toBe("80.02.000876");
  });

  it("mapeia linhas de exemplo do CRM", () => {
    const buffer = buildCrmBuffer(HEADERS_PEDRO, [
      [
        "Cosmetics Company",
        "Anelysie",
        "80.02.000876-Sacola M - The Cosmetics Company Store FSC misto",
        3.23,
        10000,
        32300,
        58010,
        1,
        10000,
        32300,
        new Date(2027, 7, 6),
        "RECOMPRA/REATIVAÇÃO (podemos perder o pedido)",
        "PRG",
        "Colaboração",
        "Frio",
      ],
      [
        "American Crime",
        "Anna Carini",
        "80.06.001473-SKU GENÉRICO - SACOLA AUTOMÁTICA - P",
        1.1,
        10000,
        11000,
        63028,
        1,
        10000,
        11000,
        new Date(2027, 0, 11),
        "RECOMPRA/REATIVAÇÃO (podemos perder o pedido)",
        "PRG",
        "Aposta",
        "Quente",
      ],
      [
        "Karsten",
        "Anna Carini",
        "80.06.001507-Sacola G - Karsten FSC Misto",
        2.67,
        10000,
        26700,
        "",
        1,
        10000,
        26700,
        new Date(2027, 10, 10),
        "RECOMPRA/REATIVAÇÃO (podemos perder o pedido)",
        "PRG",
        "Colaboração",
        "",
      ],
    ]);
    const { rows } = parseCrmExcel(buffer);
    expect(rows).toHaveLength(3);
    expect(rows[0]?.sku).toBe("80.02.000876");
    expect(rows[0]?.tipo).toBe("Colaboração");
    expect(rows[0]?.tipoNegocio).toBe("PRG");
    expect(rows[0]?.temperatura).toBe("Frio");
    expect(rows[0]?.dataFaturamento).toBe("2027-08-06");
    expect(rows[0]?.qtdMes).toBe(10000);
    expect(rows[1]?.tipo).toBe("Aposta");
    expect(rows[2]?.temperatura).toBe("");
    expect(rows[2]?.orcamento).toBe(0);
  });
});