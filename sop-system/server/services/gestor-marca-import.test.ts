import { describe, expect, it } from "vitest";
import {
  dedupeGestorMarcaRows,
  planGestorMarcaImportMerge,
  type GestorMarcaMergeContext,
} from "./gestor-marca-import";

const ctx: GestorMarcaMergeContext = {
  marcas: [
    { id: 1, nome: "Alpha" },
    { id: 2, nome: "Beta" },
  ],
  gestores: [
    { id: 10, nome: "João Silva" },
    { id: 20, nome: "Maria Souza" },
  ],
  links: [{ id: 100, marcaId: 1, gestorId: 10 }],
};

describe("planGestorMarcaImportMerge", () => {
  it("preserva vínculo quando gestor vem vazio no arquivo", () => {
    const plan = planGestorMarcaImportMerge([{ marca: "Alpha", gestor: "" }], ctx);
    expect(plan.items).toEqual([{ kind: "preserve_link", marcaNome: "Alpha" }]);
    expect(plan.stats.preserved).toBe(1);
    expect(plan.stats.linksUpdated).toBe(0);
  });

  it("atualiza vínculo quando gestor no arquivo difere do cadastro", () => {
    const plan = planGestorMarcaImportMerge([{ marca: "Alpha", gestor: "Maria Souza" }], ctx);
    expect(plan.items[0]).toMatchObject({
      kind: "update_link",
      linkId: 100,
      gestorId: 20,
    });
    expect(plan.stats.linksUpdated).toBe(1);
  });

  it("cria vínculo para marca cadastrada sem gestor", () => {
    const plan = planGestorMarcaImportMerge([{ marca: "Beta", gestor: "João Silva" }], ctx);
    expect(plan.items[0]).toMatchObject({
      kind: "create_link",
      marcaId: 2,
      gestorId: 10,
    });
  });

  it("marca nova com gestor: armazena pendência sem criar marca", () => {
    const plan = planGestorMarcaImportMerge([{ marca: "Gamma", gestor: "João Silva" }], ctx);
    expect(plan.items[0]).toEqual({
      kind: "store_pending_gestor",
      marcaNome: "Gamma",
      gestorNome: "João Silva",
    });
    expect(plan.stats.pendingGestorStored).toBe(1);
  });

  it("marca nova sem gestor: ignora", () => {
    const plan = planGestorMarcaImportMerge([{ marca: "Delta", gestor: "" }], ctx);
    expect(plan.items).toHaveLength(0);
  });

  it("dedupe: última linha vence para mesma marca", () => {
    const rows = dedupeGestorMarcaRows([
      { marca: "Alpha", gestor: "João Silva" },
      { marca: "alpha", gestor: "Maria Souza" },
    ]);
    expect(rows).toEqual([{ marca: "alpha", gestor: "Maria Souza" }]);
    const plan = planGestorMarcaImportMerge(rows, ctx);
    expect(plan.stats.linksUpdated).toBe(1);
  });

  it("gestor desconhecido não altera vínculo", () => {
    const plan = planGestorMarcaImportMerge([{ marca: "Beta", gestor: "Inexistente" }], ctx);
    expect(plan.items[0]?.kind).toBe("unknown_gestor");
    expect(plan.stats.unknownGestor).toBe(1);
  });
});
