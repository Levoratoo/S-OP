/**
 * Cores e formatação iguais às do script Python (openpyxl) do relatório oficial.
 * Fonte: previsao_demanda_final_v5_2_COMPLETO.py
 */

export const EXCEL_HEADER_BG = "#4472C4";
export const EXCEL_HEADER_FG = "#FFFFFF";
export const EXCEL_FONT_FAMILY = "Calibri, 'Segoe UI', Arial, sans-serif";

export type ExcelCellStyle = {
  bg?: string;
  fg?: string;
  bold?: boolean;
};

const FILL = {
  quedaCritica: "#8B0000",
  quedaAlta: "#CD5C5C",
  quedaModerada: "#F08080",
  crescimentoModerado: "#90EE90",
  crescimentoAlto: "#32CD32",
  crescimentoCritico: "#006400",
  excelente: "#00FF00",
  bom: "#90EE90",
  aceitavel: "#FFFF00",
  ruim: "#FFA500",
  muitoRuim: "#FF0000",
  semDados: "#C0C0C0",
  superestima: "#FFA500",
  subestima: "#4472C4",
  equilibrado: "#92D050",
  cinza: "#D9D9D9",
  consistente: "#00B050",
  moderado: "#FFC000",
  instavel: "#FF6347",
  alta: "#00B050",
  media: "#FFC000",
  baixa: "#FF6347",
  preto: "#000000",
} as const;

function normalizeLabel(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function whiteOn(bg: string): ExcelCellStyle {
  return { bg, fg: "#FFFFFF", bold: true };
}

function blackOn(bg: string): ExcelCellStyle {
  return { bg, fg: "#000000", bold: true };
}

/** Estilo por valor de Classificacao Ajuste / status de variação */
export function styleForClassificacaoAjuste(raw: string): ExcelCellStyle | null {
  const v = normalizeLabel(raw);
  if (!v) return null;
  if (v.includes("QUEDA CRITICA")) return whiteOn(FILL.quedaCritica);
  if (v.includes("QUEDA ALTA")) return whiteOn(FILL.quedaAlta);
  if (v.includes("QUEDA MODERADA")) return whiteOn(FILL.quedaModerada);
  if (v.includes("CRESCIMENTO CRITICO")) return whiteOn(FILL.crescimentoCritico);
  if (v.includes("CRESCIMENTO ALTO")) return whiteOn(FILL.crescimentoAlto);
  if (v.includes("CRESCIMENTO MODERADO")) return blackOn(FILL.crescimentoModerado);
  if (v === "ESTAVEL" || v.includes("ESTAVEL")) return null;
  return null;
}

export function styleForAcuracidade(raw: string): ExcelCellStyle | null {
  const v = normalizeLabel(raw);
  if (v === "EXCELENTE") return blackOn(FILL.excelente);
  if (v === "BOM") return blackOn(FILL.bom);
  if (v === "ACEITAVEL" || v === "ACEITÁVEL") return blackOn(FILL.aceitavel);
  if (v === "RUIM") return whiteOn(FILL.ruim);
  if (v === "MUITO RUIM") return whiteOn(FILL.muitoRuim);
  if (v === "SEM DADOS") return blackOn(FILL.semDados);
  return null;
}

export function styleForBias(raw: string): ExcelCellStyle | null {
  const v = normalizeLabel(raw);
  if (v === "SUPERESTIMA") return blackOn(FILL.superestima);
  if (v === "SUBESTIMA") return whiteOn(FILL.subestima);
  if (v === "EQUILIBRADO") return blackOn(FILL.equilibrado);
  if (v === "SEM DADOS") return blackOn(FILL.cinza);
  return null;
}

export function styleForConsistencia(raw: string): ExcelCellStyle | null {
  const v = normalizeLabel(raw);
  if (v === "CONSISTENTE") return whiteOn(FILL.consistente);
  if (v === "MODERADO") return blackOn(FILL.moderado);
  if (v === "INSTAVEL" || v === "INSTÁVEL") return whiteOn(FILL.instavel);
  if (v === "INSUFICIENTE" || v === "SEM DADOS") return blackOn(FILL.cinza);
  return null;
}

export function styleForNivelConfianca(raw: string): ExcelCellStyle | null {
  const v = normalizeLabel(raw);
  if (v === "ALTA") return whiteOn(FILL.alta);
  if (v === "MEDIA" || v === "MÉDIA") return blackOn(FILL.media);
  if (v === "BAIXA") return whiteOn(FILL.baixa);
  return null;
}

export function styleForPercentSuggestion(raw: string): ExcelCellStyle | null {
  const cleaned = String(raw).replace("%", "").trim();
  if (!cleaned) return null;

  // Não remover pontos de decimais JS (-0.07). Só normalizar vírgula pt-BR.
  let n = Number(cleaned.replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(n)) return null;

  // Se vier como pontos percentuais (ex.: -7.4), converte para fração.
  const ratio = Math.abs(n) <= 2 ? n : n / 100;
  return styleForClassificacaoAjuste(classificacaoFromPct(ratio));
}

function classificacaoFromPct(pct: number): string {
  if (pct <= -0.3) return "QUEDA CRÍTICA";
  if (pct <= -0.15) return "QUEDA ALTA";
  if (pct < -0.05) return "QUEDA MODERADA";
  if (pct >= 0.3) return "CRESCIMENTO CRÍTICO";
  if (pct >= 0.15) return "CRESCIMENTO ALTO";
  if (pct > 0.05) return "CRESCIMENTO MODERADO";
  return "ESTAVEL";
}

export function excelStyleForCell(column: string, value: string): ExcelCellStyle | null {
  const col = normalizeLabel(column);
  if (!value || value === "—" || value === "-") return null;

  if (col.includes("CLASSIFICACAO") && col.includes("AJUSTE")) {
    return styleForClassificacaoAjuste(value);
  }
  if (col.includes("SUGESTAO") && col.includes("AJUSTE") && col.includes("%")) {
    return styleForPercentSuggestion(value);
  }
  if (col.includes("ACURAC") || col === "STATUS_12M" || col.includes("STATUS 12")) {
    return styleForAcuracidade(value);
  }
  if (col.includes("BIAS") || col.includes("DIRECAO")) {
    return styleForBias(value);
  }
  if (col.includes("CONSISTENCIA")) {
    return styleForConsistencia(value);
  }
  if (col.includes("CONFIANCA") && (col.includes("NIVEL") || col.includes("NÍVEL"))) {
    return styleForNivelConfianca(value);
  }
  if (col.includes("TENDENCIA") || col.includes("RECORRENCIA")) {
    // Clientes_Analise colors — approximate
    const v = normalizeLabel(value);
    if (v.includes("QUEDA") || v.includes("RISCO")) return whiteOn(FILL.quedaAlta);
    if (v.includes("ALTA") || v.includes("CRESC")) return blackOn(FILL.crescimentoModerado);
    return null;
  }
  return null;
}
