import { describe, expect, it } from "vitest";
import { inferFamiliaFromDescricao, resolveProdutoFamilia } from "@shared/produto-familia";
import { normalizeTipoNegocioComercial } from "@shared/tipo-negocio";
import { resolveGestorPorMarca } from "@shared/gestor-marca-resolve";
import { resolvePlanoColab } from "@shared/plano-colab";

describe("tipo comercial", () => {
  it("aceita JIT/ATD/PRG/VAR e rejeita nomes de marca", () => {
    expect(normalizeTipoNegocioComercial("ATD")).toBe("ATD");
    expect(normalizeTipoNegocioComercial("klabin")).toBeNull();
    expect(normalizeTipoNegocioComercial("Aramis")).toBeNull();
  });
});

describe("família do produto", () => {
  it("usa modelo depois descrição", () => {
    expect(resolveProdutoFamilia({ modelo: "Sacola", descricao: "X" })).toBe("Sacola");
    expect(inferFamiliaFromDescricao("Sacola P - Marca")).toBe("Sacola");
    expect(inferFamiliaFromDescricao("Apara P - Adidas")).toBe("Adicionais");
    expect(resolveProdutoFamilia({ descricao: "Envelope P Act" })).toBe("Envelope");
  });
});

describe("plano colaboração", () => {
  it("ATD MTO vai para MTS", () => {
    expect(resolvePlanoColab("MTO", "ATD")).toBe("MTS");
    expect(resolvePlanoColab("MTO", "PRG")).toBe("PV_MTO");
    expect(resolvePlanoColab("MTS", "VAR")).toBe("MTS");
  });
});

describe("gestor por marca", () => {
  it("casa submarca com marca cadastrada", () => {
    const map = new Map([["malwee", "Francine Sapelli Custódio"]]);
    expect(resolveGestorPorMarca("Malwee Enfim", map)).toBe("Francine Sapelli Custódio");
    expect(resolveGestorPorMarca("Malwee", map)).toBe("Francine Sapelli Custódio");
  });
});
