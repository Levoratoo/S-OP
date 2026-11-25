import { describe, expect, it } from "vitest";
import {
  CRM_SKU_PATTERN,
  crmTipoExcelParaEstoque,
  crmTipoExcelParaNegocio,
  isCrmSkuCodigoValido,
} from "@shared/crm-import-helpers";

describe("crm-import-helpers", () => {
  it("valida padrão NN.NN.NNNNNN", () => {
    expect(CRM_SKU_PATTERN.test("80.02.000951")).toBe(true);
    expect(isCrmSkuCodigoValido(" 80.06.001774 ")).toBe(true);
    expect(isCrmSkuCodigoValido("SKU GENERICO SACOLA")).toBe(false);
    expect(isCrmSkuCodigoValido("SAT49")).toBe(false);
  });

  it("mapeia Tipo Excel para estoque", () => {
    expect(crmTipoExcelParaEstoque("PRG")).toBe("MTS");
    expect(crmTipoExcelParaEstoque("JIT (MTO)")).toBe("MTO");
    expect(crmTipoExcelParaEstoque("MTO")).toBe("MTO");
  });

  it("mapeia Tipo Excel para tipoNegocio", () => {
    expect(crmTipoExcelParaNegocio("JIT (MTO)")).toBe("JIT");
    expect(crmTipoExcelParaNegocio("PRG")).toBe("PRG");
  });
});