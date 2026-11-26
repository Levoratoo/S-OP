import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  janelaCompraPapel,
  mensagemPendenciasCompraPapel,
  montarLinhasCompraPapel,
  pendenciasCompraPapel,
  tipoCompraPapel,
  validarImportacaoCompraPapel,
} from "@shared/compra-papel";

describe("compra de papel", () => {
  it("abre a janela de 3 meses e vira o ano", () => {
    expect(janelaCompraPapel(2026, 11)).toEqual([
      { ano: 2026, mes: 12 },
      { ano: 2027, mes: 1 },
      { ano: 2027, mes: 2 },
    ]);
    expect(janelaCompraPapel(2026, 12)).toEqual([
      { ano: 2027, mes: 1 },
      { ano: 2027, mes: 2 },
      { ano: 2027, mes: 3 },
    ]);
  });

  it("separa Recompra e Cliente novo e só soma a janela", () => {
    expect(tipoCompraPapel("Aposta")).toBe("Cliente novo");
    expect(tipoCompraPapel("Colaboração")).toBe("Recompra");
    const linhas = montarLinhasCompraPapel(
      [
        parcela(1, "Aposta", 2026, 12, 10, 1.5),
        parcela(1, "Aposta", 2027, 3, 99, 1.5),
        parcela(2, "Colaboração", 2027, 1, 4, 2),
      ],
      janelaCompraPapel(2026, 11)
    );
    expect(linhas).toHaveLength(2);
    expect(linhas.find(linha => linha.dealId === 1)?.tipo).toBe("Cliente novo");
    expect(linhas.find(linha => linha.dealId === 1)?.quantidade).toBe(10);
    expect(linhas.find(linha => linha.dealId === 2)?.tipo).toBe("Recompra");
  });

  it("bloqueia a aprovação enquanto houver pendência e valida a importação", () => {
    expect(mensagemPendenciasCompraPapel(12)).toMatch(/Faltam 12 decisões de compra de papel/);
    expect(pendenciasCompraPapel([{ comprar: "PENDENTE" }, { comprar: "SIM" }])).toBe(1);
    expect(mensagemPendenciasCompraPapel(0)).toBeNull();
    const previa = validarImportacaoCompraPapel({
      linhas: [
        { linhaId: "d1-80.01.000001", papel: "KRAFT", risco: "Alto", comprar: "Sim", quantidade: "10", observacao: "" },
        { linhaId: "nao-existe", papel: "FANTASMA", risco: "Grave", comprar: "Talvez", quantidade: "-1", observacao: "" },
      ],
      idsValidos: ["d1-80.01.000001"],
      papeis: [{ codigo: "KRAFT", ativo: true }],
    });
    expect(previa[0]?.erros).toEqual([]);
    expect(previa[0]?.risco).toBe("ALTO");
    expect(previa[0]?.comprar).toBe("SIM");
    expect(previa[0]?.quantidade).toBe(10);
    expect(previa[1]?.erros.length).toBeGreaterThan(0);
    const quantidades = validarImportacaoCompraPapel({
      linhas: [
        { linhaId: "d1-80.01.000001", papel: "", risco: "", comprar: "", quantidade: "1.500,25", observacao: "" },
        { linhaId: "d1-80.01.000001", papel: "", risco: "", comprar: "", quantidade: "10.5", observacao: "" },
      ],
      idsValidos: ["d1-80.01.000001"],
      papeis: [],
    });
    expect(quantidades.map(linha => linha.quantidade)).toEqual([1500.25, 10.5]);
  });

  it("a migração congela a foto contra update e delete", () => {
    const sql = readFileSync(new URL("../drizzle/0022_compra_papel.sql", import.meta.url), "utf8");
    expect(sql).toMatch(/BEFORE UPDATE ON `compra_papel_snapshot`/);
    expect(sql).toMatch(/BEFORE DELETE ON `compra_papel_snapshot`/);
    expect(sql).toMatch(/BEFORE UPDATE ON `compra_papel_snapshot_linhas`/);
    expect(sql).toMatch(/BEFORE DELETE ON `compra_papel_snapshot_linhas`/);
    expect(sql).toMatch(/é imutável/);
  });
});

function parcela(dealId: number, tipo: string, ano: number, mes: number, quantidade: number, preco: number) {
  return {
    dealId,
    titulo: `Negócio ${dealId}`,
    proprietario: "Ana",
    proprietarioEmail: "ana@printbag.local",
    marca: "Aurora",
    temperatura: "Quente",
    sku: "80.01.000001",
    descricao: "Sacola",
    tipo,
    ano,
    mes,
    quantidade,
    preco,
  };
}
