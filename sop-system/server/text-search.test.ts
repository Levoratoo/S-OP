import { describe, expect, it } from "vitest";
import { normalizeForSearch, textMatchesSearch } from "@shared/text-search";

describe("text-search (busca sem acento/caixa)", () => {
  it("normaliza acentos e caixa", () => {
    expect(normalizeForSearch("São Paulo")).toBe("sao paulo");
    expect(normalizeForSearch("  MARCA  ")).toBe("marca");
  });

  it("textMatchesSearch ignora acentos e maiúsculas", () => {
    expect(textMatchesSearch("Ambev — Cerveja", "ambev")).toBe(true);
    expect(textMatchesSearch("Gestor João", "joao")).toBe(true);
    expect(textMatchesSearch("XYZ", "abc")).toBe(false);
  });

  it("needle vazio não restringe", () => {
    expect(textMatchesSearch("qualquer", "")).toBe(true);
    expect(textMatchesSearch("qualquer", "   ")).toBe(true);
  });
});
