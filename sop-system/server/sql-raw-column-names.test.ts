import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { SQL_PHYSICAL } from "@shared/sql-physical-columns";

const SERVER_DIR = join(import.meta.dirname, "services");

describe("SQL cru — nomes físicos MariaDB", () => {
  it("de-para-enriched usa lookup por IN (sem JOIN OR em produtos)", () => {
    const text = readFileSync(join(SERVER_DIR, "de-para-enriched.ts"), "utf8");
    expect(text).not.toMatch(/de_para_codigos/);
    expect(text).not.toMatch(/LEFT JOIN produtos.*OR/i);
    expect(text).toMatch(/WHERE codMaterial IN/);
    expect(text).toMatch(/inArray\(produtos\.codItem/);
    expect(text).toMatch(/inArray\(produtos\.codigo/);
  });

  it("documenta colunas snake de de_para_codigos", () => {
    expect(SQL_PHYSICAL.de_para_codigos.sku_antigo).toBe("sku_antigo");
    expect(SQL_PHYSICAL.de_para_codigos.sku_novo).toBe("sku_novo");
  });
});