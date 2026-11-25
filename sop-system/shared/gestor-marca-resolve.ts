import { textMatchesSearch } from "./text-search";

function normMarca(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/**
 * Resolve gestor pelo vínculo Gestor×Marca, tolerando grafias próximas
 * (ex.: "Malwee Enfim" ↔ cadastro "Malwee").
 */
export function resolveGestorPorMarca(
  marca: string | null | undefined,
  gestorByMarcaNome: Map<string, string>
): string {
  const raw = (marca || "").trim();
  if (!raw) return "";
  const key = normMarca(raw);
  const direct = gestorByMarcaNome.get(key);
  if (direct) return direct;

  const entries = Array.from(gestorByMarcaNome.entries());
  for (const [cadastro, gestor] of entries) {
    if (key.startsWith(cadastro) || cadastro.startsWith(key)) return gestor;
    if (key.includes(cadastro) || cadastro.includes(key)) return gestor;
  }

  for (const [cadastro, gestor] of entries) {
    if (textMatchesSearch(cadastro, raw) || textMatchesSearch(raw, cadastro)) return gestor;
  }

  return "";
}
