/**
 * Normalização de linha de produto para matching demanda × capacidade.
 * Ex.: "SACOLA ELEGANCE" / "Terc. Sacola Elegance" / "Elegance" → "elegance"
 */
export function normalizeText(value: string | null | undefined): string {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function canonicalizeLinha(value: string | null | undefined): string {
  let s = normalizeText(value);
  if (!s) return "";

  s = s.replace(/^terc\.?\s*/i, "");
  s = s.replace(/^terceirizad[oa]\s*/i, "");
  // Prefixo comum no faturamento/ciclo
  s = s.replace(/^sacola\s+/i, "");
  s = s.replace(/\s+/g, " ").trim();

  // Aliases / consolidação para matching com recursos
  const aliases: Record<string, string> = {
    automatica: "automatica",
    "auto matica": "automatica",
    classic: "classic",
    elegance: "elegance",
    evolution: "evolution",
    "evolution plus": "evolution",
    "fundo q": "fundo q",
    "fundo v": "fundo v",
    "saco fundo quadrado": "fundo q",
    "saco fundo q": "fundo q",
    "saco fundo v": "fundo v",
    guardanapo: "guardanapo",
    "papel seda": "papel seda",
    adicionais: "adicionais",
    "corte vinco": "corte vinco",
    guilhotina: "guilhotina",
    // Linhas comerciais sem recurso dedicado → agrupadores próximos
    presente: "classic",
    "rev. presente": "classic",
    "rev presente": "classic",
    papelaria: "classic",
    "rev. papelaria": "classic",
    "rev papelaria": "classic",
    "sacoleira flexo": "automatica",
    "itens de maquinas": "adicionais",
    "itens de maquina": "adicionais",
    "itens reutilizaveis": "adicionais",
    "itens de imobilizado": "adicionais",
    "remessa industrializacao": "adicionais",
    "remessa de outros itens": "adicionais",
    "insumos de terceiros": "adicionais",
    "filme plastico": "adicionais",
    "apara formato": "adicionais",
    "alca dalva (und)": "adicionais",
    "alca dalva": "adicionais",
    "alca gorgurao (und)": "adicionais",
    "alca gorgurao": "adicionais",
    caixa: "elegance",
    "caixa tampa e fundo": "elegance",
    "alca papel torcido": "adicionais",
    "alca papel": "adicionais",
    "guardanapo sachet": "guardanapo",
  };

  return aliases[s] || s;
}
