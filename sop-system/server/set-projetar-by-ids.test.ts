import { describe, expect, it } from "vitest";

describe("setProjetarByProductIds (contrato)", () => {
  it("deduplica IDs e ignora inválidos", () => {
    const raw = [1, 2, 2, 0, -1, 1.5 as unknown as number];
    const ids = Array.from(
      new Set(raw.filter(id => Number.isInteger(id) && id > 0))
    );
    expect(ids).toEqual([1, 2]);
  });
});
