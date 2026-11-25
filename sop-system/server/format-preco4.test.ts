import { describe, expect, it } from "vitest";
import { formatPreco4, rotuloOrigemPrecoCadastro } from "@shared/pv-preco-round";

describe("formatPreco4", () => {
  it("mostra sempre 4 casas", () => {
    expect(formatPreco4(0.675)).toBe("0,6750");
    expect(formatPreco4(0.858)).toBe("0,8580");
    expect(formatPreco4(1)).toBe("1,0000");
  });

  it("rotula a origem do cadastro", () => {
    expect(rotuloOrigemPrecoCadastro("manual")).toBe("Manual");
    expect(rotuloOrigemPrecoCadastro("legado_cadastro")).toBe("Cadastro legado");
    expect(rotuloOrigemPrecoCadastro("erp_pedido")).toBe("Pedido ERP");
    expect(rotuloOrigemPrecoCadastro("faturamento_12m")).toBe("Faturamento 12m");
  });
});
