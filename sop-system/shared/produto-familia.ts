/**
 * Família exibida no Consolidado (modelo Victor): Sacola, Envelope, Adicionais, etc.
 * Ordem: `produtos.modelo` (CSV cadastro) → `produtos.grupo` (ERP usr_grupo) → heurística na descrição.
 */

const FAMILIA_HEURISTICS: Array<{ pattern: RegExp; familia: string }> = [
  { pattern: /\bapara\b|\baparas\b|\blona\b|\betiqueta\b|\bsolapa\b|\bcanudo\b/i, familia: "Adicionais" },
  { pattern: /\bsacola\b|\bsaco\b/i, familia: "Sacola" },
  { pattern: /\benvelope\b|\benvalope\b/i, familia: "Envelope" },
  { pattern: /\bcaixa\b/i, familia: "Caixa" },
  { pattern: /\bservi[cç]o\b/i, familia: "Serviço" },
];

export function inferFamiliaFromDescricao(descricao: string | null | undefined): string | null {
  const d = String(descricao ?? "").trim();
  if (!d) return null;
  for (const { pattern, familia } of FAMILIA_HEURISTICS) {
    if (pattern.test(d)) return familia;
  }
  const first = d.split(/\s+/)[0]?.replace(/[^A-Za-zÀ-ú]/g, "");
  if (first && first.length >= 3) return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
  return null;
}

export function resolveProdutoFamilia(prod: {
  modelo?: string | null;
  grupo?: string | null;
  descricao?: string | null;
  nome?: string | null;
}): string {
  const modelo = (prod.modelo || "").trim();
  if (modelo) return modelo;

  const grupo = (prod.grupo || "").trim();
  if (grupo && !/^(JIT|ATD|PRG|VAR)$/i.test(grupo)) return grupo;

  return inferFamiliaFromDescricao(prod.descricao || prod.nome) ?? "";
}
