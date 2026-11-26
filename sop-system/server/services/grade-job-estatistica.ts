import fs from "node:fs/promises";
import path from "node:path";
import * as XLSX from "xlsx";
import { serieEstatisticaDeLinhas } from "@shared/grade-colab";

const JOBS_ROOT = path.resolve(process.cwd(), ".previsao-python-jobs");

const cache = new Map<string, { mtimeMs: number; size: number; serie: Record<string, Record<string, number>> }>();

function dentroDaPastaDeJobs(arquivo: string): boolean {
  const raiz = path.resolve(JOBS_ROOT);
  const alvo = path.resolve(arquivo);
  return alvo === raiz || alvo.startsWith(raiz + path.sep);
}

function arquivoNaPasta(pasta: string, nome: string): string | null {
  const base = path.resolve(pasta);
  const alvo = path.resolve(base, nome);
  if (alvo !== path.join(base, nome)) return null;
  return alvo;
}

export function caminhosDoJob(job: { id: number; workdir: string | null; outputFileName: string | null }): string[] {
  const nome = path.basename(job.outputFileName || `relatorio_previsao_demanda_job_${job.id}.xlsx`);
  if (!nome.toLowerCase().endsWith(".xlsx")) return [];
  const candidatos = [
    job.workdir ? arquivoNaPasta(job.workdir, nome) : null,
    arquivoNaPasta(path.join(JOBS_ROOT, `job-${job.id}`), nome),
    arquivoNaPasta(path.join(JOBS_ROOT, `job-${job.id}`), `relatorio_previsao_demanda_job_${job.id}.xlsx`),
  ].filter((arquivo): arquivo is string => Boolean(arquivo));
  return [...new Set(candidatos)].filter(arquivo => {
    if (dentroDaPastaDeJobs(arquivo)) return true;
    const pasta = job.workdir ? path.resolve(job.workdir) : "";
    return pasta.includes(`${path.sep}.previsao-python-jobs${path.sep}`) && arquivo.startsWith(pasta + path.sep);
  });
}

export async function lerEstatisticaArquivoJob(arquivo: string): Promise<Record<string, Record<string, number>>> {
  const stat = await fs.stat(arquivo);
  const guardado = cache.get(arquivo);
  if (guardado && guardado.mtimeMs === stat.mtimeMs && guardado.size === stat.size) return guardado.serie;
  const livro = XLSX.readFile(arquivo, { sheets: ["Detalhado"] });
  const nome = livro.SheetNames.find(aba => aba.trim().toLowerCase() === "detalhado") ?? livro.SheetNames[0];
  const aba = nome ? livro.Sheets[nome] : undefined;
  const linhas = aba ? XLSX.utils.sheet_to_json<Record<string, unknown>>(aba, { defval: null }) : [];
  const serie = serieEstatisticaDeLinhas(linhas);
  cache.set(arquivo, { mtimeMs: stat.mtimeMs, size: stat.size, serie });
  return serie;
}

/** Uma leitura por job, com cache pelo arquivo. Falha de um job não derruba a grade. */
export async function lerEstatisticaJobs(
  jobs: Array<{ id: number; workdir: string | null; outputFileName: string | null }>
): Promise<Map<number, Record<string, Record<string, number>>>> {
  const saida = new Map<number, Record<string, Record<string, number>>>();
  await Promise.all(
    jobs.map(async job => {
      for (const arquivo of caminhosDoJob(job)) {
        try {
          await fs.access(arquivo);
          saida.set(job.id, await lerEstatisticaArquivoJob(arquivo));
          return;
        } catch {
          continue;
        }
      }
    })
  );
  return saida;
}
