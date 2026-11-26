import { cicloHorizonCalendar } from "@shared/ciclo-horizon";
import { isCicloStatus, type CicloStatus } from "@shared/ciclo-status";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export type MesCalendario = { ano: number; mes: number };

export type ColunaGrade =
  | { id: "sku"; grupo: "fixa" }
  | { id: "descricao"; grupo: "fixa" }
  | { id: "yoy"; grupo: "fixa" }
  | { id: string; grupo: "passado"; ano: number; mes: number; papel: "realizado" | "previsto" | "aderencia" }
  | { id: string; grupo: "futuro"; ano: number; mes: number; papel: "anoAnterior" | "prev" | "colab" }
  | { id: "total"; grupo: "total" };

/** Mês do processo do ciclo = último mês fechado da comparação ano contra ano. */
export function periodoAnoContraAno(anoInicio: number, mesInicio: number) {
  const mesFim = mesInicio;
  const anoAtual = anoInicio;
  const anoAnterior = anoInicio - 1;
  const nome = MESES[mesFim - 1] ?? String(mesFim);
  return {
    anoAtual,
    anoAnterior,
    mesFim,
    rotuloAtual: `jan–${nome}/${String(anoAtual).slice(-2)}`,
    rotuloAnterior: `jan–${nome}/${String(anoAnterior).slice(-2)}`,
  };
}

export function variacaoAno(atual: number, anterior: number):
  | { tipo: "vazio" }
  | { tipo: "novo" }
  | { tipo: "valor"; pct: number } {
  if (anterior === 0 && atual === 0) return { tipo: "vazio" };
  if (anterior === 0) return { tipo: "novo" };
  return { tipo: "valor", pct: (atual / anterior - 1) * 100 };
}

export function somaPeriodo(
  meses: number[] | undefined,
  mesFim: number
): number {
  if (!meses) return 0;
  let total = 0;
  for (let i = 0; i < mesFim && i < 12; i++) total += Number(meses[i] || 0);
  return total;
}

/** Jan … mês de referência do ciclo (inclusive). */
export function mesesPassadosGrade(anoInicio: number, mesInicio: number): MesCalendario[] {
  const saida: MesCalendario[] = [];
  for (let mes = 1; mes <= mesInicio; mes++) saida.push({ ano: anoInicio, mes });
  return saida;
}

/** Horizonte m1…m12, o mês seguinte ao processo. */
export function mesesFuturosGrade(anoInicio: number, mesInicio: number): MesCalendario[] {
  return Array.from({ length: 12 }, (_, index) => {
    const calendario = cicloHorizonCalendar(anoInicio, mesInicio, index);
    return { ano: calendario.year, mes: calendario.month };
  });
}

export function rotuloMesCurto(ano: number, mes: number): string {
  const nome = (MESES[mes - 1] ?? String(mes)).toUpperCase();
  return `${nome}/${String(ano).slice(-2)}`;
}

/**
 * Aderência no sentido pedido para a grade: realizado ÷ previsto × 100.
 * A tela de Acuracidade mostra WMAPE do snapshot, não este percentual por célula.
 * Sem base, ou com base 0, não há percentual.
 */
export function pvVsRe(realizado: number, previsto: number | null): number | null {
  if (previsto == null || previsto === 0) return null;
  return (realizado / previsto) * 100;
}

/** Perto de 100% verde; até 25 pontos amarelo; além disso vermelho. */
export type MesExcecao = {
  realizado: number;
  /** null quando nenhuma fonte tem base para o mês. 0 é base real. */
  base: number | null;
};

export function baseExcecao(mes: MesExcecao): number | null {
  return mes.base;
}

export type OrigemPrevisto =
  | { tipo: "foto"; cicloId: number }
  | { tipo: "ciclo"; cicloId: number; status: string }
  | { tipo: "job"; jobId: number };

export type CelulaPrevisto = {
  valor: number;
  origem: OrigemPrevisto["tipo"];
  rotulo: string;
};

function detalheCicloNaoFoto(status: CicloStatus): string {
  switch (status) {
    case "APROVADO":
      return "aprovado, sem foto";
    case "CONGELADO":
      return "congelado, sem foto";
    case "ABERTO":
    case "EM_COLABORACAO":
    case "CONSENSO":
      return "não congelado";
    default: {
      const nunca: never = status;
      return nunca;
    }
  }
}

export function rotuloOrigemPrevisto(origem: OrigemPrevisto): string {
  switch (origem.tipo) {
    case "foto":
      return `Foto congelada do ciclo #${origem.cicloId}`;
    case "ciclo":
      return `Previsão do ciclo #${origem.cicloId} (${isCicloStatus(origem.status) ? detalheCicloNaoFoto(origem.status) : "não congelado"})`;
    case "job":
      return `Estatística job #${origem.jobId}`;
    default: {
      const nunca: never = origem;
      return nunca;
    }
  }
}

/**
 * Prioridade da base: foto do ciclo aprovado/congelado, depois o ciclo mais
 * recente que gravou o SKU naquele mês, depois o job mais recente que gerou
 * valor para o SKU naquele mês. Zero gravado não cai para a fonte seguinte.
 * Na foto, SKU ausente vale 0. Nas outras, ausência não é base.
 */
export function resolverPrevistoMes(input: {
  sku: string;
  foto: { cicloId: number; porSku: Record<string, number> } | null;
  ciclo: { cicloId: number; status: string; porSku: Record<string, number> } | null;
  jobs: Array<{ jobId: number; porSku: Record<string, number> }>;
}): CelulaPrevisto | null {
  if (input.foto) {
    const origem: OrigemPrevisto = { tipo: "foto", cicloId: input.foto.cicloId };
    return { valor: input.foto.porSku[input.sku] ?? 0, origem: "foto", rotulo: rotuloOrigemPrevisto(origem) };
  }
  if (input.ciclo && Object.prototype.hasOwnProperty.call(input.ciclo.porSku, input.sku)) {
    const origem: OrigemPrevisto = { tipo: "ciclo", cicloId: input.ciclo.cicloId, status: input.ciclo.status };
    return { valor: input.ciclo.porSku[input.sku] ?? 0, origem: "ciclo", rotulo: rotuloOrigemPrevisto(origem) };
  }
  for (const job of input.jobs) {
    if (!Object.prototype.hasOwnProperty.call(job.porSku, input.sku)) continue;
    const origem: OrigemPrevisto = { tipo: "job", jobId: job.jobId };
    return { valor: job.porSku[input.sku] ?? 0, origem: "job", rotulo: rotuloOrigemPrevisto(origem) };
  }
  return null;
}

const MESES_PROJECAO = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Coluna do Detalhado: jan/2026_HOLT_WINTERS ou jan-26_MEDIA_SIMPLES. */
export function interpretarColunaProjecao(coluna: string): { ano: number; mes: number; metodo: string } | null {
  const match = coluna.trim().match(/^(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[/-](\d{2}|\d{4})_(.+)$/i);
  if (!match) return null;
  const mes = MESES_PROJECAO.indexOf(match[1]!.toLowerCase()) + 1;
  const anoRaw = Number(match[2]);
  const ano = match[2]!.length === 2 ? 2000 + anoRaw : anoRaw;
  const metodo = match[3]!.trim().toUpperCase();
  if (!mes || !Number.isFinite(ano) || !metodo) return null;
  return { ano, mes, metodo };
}

/** Código do job no formato SKU ou SKU-marca. Grupo MTS-Marca-Linha fica de fora. */
export function skuDaPrevisaoJob(codigo: string): string | null {
  const texto = codigo.trim();
  if (!/^\d/.test(texto)) return null;
  const match = texto.match(/^([\d.]+[A-Za-z0-9]*)/);
  const sku = (match?.[1] ?? texto).trim().toUpperCase();
  return sku || null;
}

/** Melhor modelo de cada linha do Detalhado, só onde o código é um SKU. */
export function serieEstatisticaDeLinhas(linhas: Array<Record<string, unknown>>): Record<string, Record<string, number>> {
  const saida: Record<string, Record<string, number>> = {};
  for (const linha of linhas) {
    const sku = skuDaPrevisaoJob(String(linha.Codigo ?? linha.codigo ?? ""));
    const metodo = String(linha.MELHOR_CENARIO ?? "").trim().toUpperCase();
    if (!sku || !metodo) continue;
    for (const [coluna, bruto] of Object.entries(linha)) {
      const projecao = interpretarColunaProjecao(coluna);
      if (!projecao || projecao.metodo !== metodo || bruto == null || String(bruto).trim() === "") continue;
      const valor = typeof bruto === "number" ? bruto : Number(String(bruto).trim().replace(",", "."));
      if (!Number.isFinite(valor)) continue;
      const chave = chaveMes(projecao.ano, projecao.mes);
      const meses = saida[sku] ?? {};
      meses[chave] = (meses[chave] ?? 0) + valor;
      saida[sku] = meses;
    }
  }
  return saida;
}

/** |realizado / base − 1| > faixa. Base 0 com realizado > 0 é exceção. Os dois em 0 não são. */
export function mesEhExcecao(mes: MesExcecao, faixaPct: number): boolean {
  const base = baseExcecao(mes);
  if (base == null) return false;
  if (base === 0 && mes.realizado === 0) return false;
  if (base === 0 && mes.realizado > 0) return true;
  return Math.abs(mes.realizado / base - 1) > faixaPct / 100;
}

/** O SKU é exceção se algum mês passado da grade estourar a faixa. */
export function skuEhExcecao(meses: MesExcecao[], faixaPct: number): boolean {
  return meses.some(mes => mesEhExcecao(mes, faixaPct));
}

export function faixaPvVsRe(pct: number | null): "neutro" | "verde" | "amarelo" | "vermelho" {
  if (pct == null || !Number.isFinite(pct)) return "neutro";
  const distancia = Math.abs(pct - 100);
  if (distancia <= 10) return "verde";
  if (distancia <= 25) return "amarelo";
  return "vermelho";
}

export function chaveMes(ano: number, mes: number): string {
  return `${ano}-${mes}`;
}

export type CicloCobertura = { id: number; anoInicio: number; mesInicio: number };

/** Ciclo congelado/aprovado cuja janela inclui o mês. Empate: horizonte que começa mais tarde. */
export function escolherCicloDoMes(mes: MesCalendario, ciclos: CicloCobertura[]): (CicloCobertura & { indice: number }) | null {
  const alvo = mes.ano * 12 + (mes.mes - 1);
  let melhor: (CicloCobertura & { indice: number; inicio: number }) | null = null;
  for (const ciclo of ciclos) {
    const inicio = cicloHorizonCalendar(ciclo.anoInicio, ciclo.mesInicio, 0);
    const absInicio = inicio.year * 12 + (inicio.month - 1);
    const indice = alvo - absInicio;
    if (indice < 0 || indice > 11) continue;
    if (!melhor || absInicio > melhor.inicio || (absInicio === melhor.inicio && ciclo.id > melhor.id)) {
      melhor = { ...ciclo, indice, inicio: absInicio };
    }
  }
  if (!melhor) return null;
  return { id: melhor.id, anoInicio: melhor.anoInicio, mesInicio: melhor.mesInicio, indice: melhor.indice };
}

/** Ciclo mais recente, de qualquer status, cujo horizonte inclui o mês. O ciclo atual fica de fora. */
export function escolherCicloRecenteDoMes(
  mes: MesCalendario,
  ciclos: CicloCobertura[],
  excluirId: number
): (CicloCobertura & { indice: number }) | null {
  const alvo = mes.ano * 12 + (mes.mes - 1);
  let melhor: (CicloCobertura & { indice: number }) | null = null;
  for (const ciclo of ciclos) {
    if (ciclo.id === excluirId) continue;
    const inicio = cicloHorizonCalendar(ciclo.anoInicio, ciclo.mesInicio, 0);
    const absInicio = inicio.year * 12 + (inicio.month - 1);
    const indice = alvo - absInicio;
    if (indice < 0 || indice > 11) continue;
    if (!melhor || ciclo.id > melhor.id) melhor = { ...ciclo, indice };
  }
  return melhor;
}

export function colunasGradeMts(anoInicio: number, mesInicio: number): ColunaGrade[] {
  const colunas: ColunaGrade[] = [
    { id: "sku", grupo: "fixa" },
    { id: "descricao", grupo: "fixa" },
    { id: "yoy", grupo: "fixa" },
  ];
  for (const mes of mesesPassadosGrade(anoInicio, mesInicio)) {
    const base = chaveMes(mes.ano, mes.mes);
    colunas.push(
      { id: `${base}-realizado`, grupo: "passado", ...mes, papel: "realizado" },
      { id: `${base}-previsto`, grupo: "passado", ...mes, papel: "previsto" },
      { id: `${base}-aderencia`, grupo: "passado", ...mes, papel: "aderencia" }
    );
  }
  for (const mes of mesesFuturosGrade(anoInicio, mesInicio)) {
    const base = chaveMes(mes.ano, mes.mes);
    colunas.push(
      { id: `${base}-aa`, grupo: "futuro", ...mes, papel: "anoAnterior" },
      { id: `${base}-prev`, grupo: "futuro", ...mes, papel: "prev" },
      { id: `${base}-colab`, grupo: "futuro", ...mes, papel: "colab" }
    );
  }
  colunas.push({ id: "total", grupo: "total" });
  return colunas;
}

export function anosDaGrade(anoInicio: number, mesInicio: number): number[] {
  const anos = new Set<number>([anoInicio, anoInicio - 1]);
  for (const mes of mesesFuturosGrade(anoInicio, mesInicio)) anos.add(mes.ano - 1);
  for (const mes of mesesPassadosGrade(anoInicio, mesInicio)) anos.add(mes.ano);
  return [...anos].sort((a, b) => a - b);
}
