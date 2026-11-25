import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { SQL_PHYSICAL } from "@shared/sql-physical-columns";

const SERVER_DIR = join(import.meta.dirname, "services");

const RAW_SQL_FILES: Array<{ file: string; forbidden: RegExp[] }> = [
  {
    file: "de-para-enriched.ts",
    forbidden: [/\bd\.skuAntigo\b/, /\bd\.skuNovo\b/],
  },
];

describe("SQL cru — nomes físicos MariaDB", () => {
  it("de-para-enriched não usa camelCase nas colunas de_de_para", () => {
    const text = readFileSync(join(SERVER_DIR, "de-para-enriched.ts"), "utf8");
    for (const re of RAW_SQL_FILES[0]!.forbidden) {
      expect(text, re.source).not.toMatch(re);
    }
    expect(text).toContain("d.sku_antigo");
    expect(text).toContain("d.sku_novo");
  });

  it("documenta colunas snake de de_para_codigos", () => {
    expect(SQL_PHYSICAL.de_para_codigos.sku_antigo).toBe("sku_antigo");
    expect(SQL_PHYSICAL.de_para_codigos.sku_novo).toBe("sku_novo");
  });
});