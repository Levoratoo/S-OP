import { describe, expect, it } from "vitest";
import { assertCrmExcelHeaders, assertCrmImportRows } from "./services/crm-import-validate";
import { CRM_EXCEL_HEADERS } from "@shared/crm-excel-layout";

describe("assertCrmExcelHeaders (server)", () => {
  it("aceita layout oficial", () => {
    expect(() => assertCrmExcelHeaders([...CRM_EXCEL_HEADERS])).not.toThrow();
  });

  it("rejeita colunas a mais", () => {
    expect(() => assertCrmExcelHeaders([...CRM_EXCEL_HEADERS, "Extra"])).toThrow(/15 colunas/);
  });
});

describe("assertCrmImportRows", () => {
  it("exige SKU em cada linha", () => {
    expect(() => assertCrmImportRows([{ sku: "80.01.000001" }])).not.toThrow();
    expect(() => assertCrmImportRows([{ sku: "" }])).toThrow(/SKU vazia/);
  });
});
