import { createWriteStream } from "fs";
import { promises as fs } from "fs";
import { createHash } from "node:crypto";
import path from "path";
import { spawn } from "child_process";
import XLSX from "xlsx";
import type { WorkBook, WorkSheet } from "xlsx";
import * as db from "./db";

type UploadedFileInput = {
  fileName: string;
  contentBase64: string;
};

type CreatePrevisaoJobInput = {
  createdBy?: string | null;
  origin?: "SYSTEM" | "UPLOAD";
  sourceMetadata?: unknown;
  vendas: UploadedFileInput;
  previsto?: UploadedFileInput | null;
  clientes?: UploadedFileInput | null;
};

type CreateCiclo13UploadJobInput = {
  createdBy?: string | null;
  workbook: UploadedFileInput;
};

const SCRIPT_NAME = "previsao_demanda_final_v5_2_COMPLETO.py";
const SCRIPT_HELPER_NAME = "previsao_meses.py";
const CICLO_13_SCRIPT_VERSION = "ciclo13-upload";
const INPUT_VENDAS_NAME = "1- Base de Dados Vendas.xlsx";
const INPUT_PREVISTO_NAME = "1-BasedeDadosPrevisto.xlsx";
const INPUT_CLIENTES_NAME = "1-BasedeDadosClientes.xlsx";
const JOBS_ROOT = path.resolve(process.cwd(), ".previsao-python-jobs");
const MONTH_INDEX: Record<string, number> = {
  jan: 1,
  fev: 2,
  mar: 3,
  abr: 4,
  mai: 5,
  jun: 6,
  jul: 7,
  ago: 8,
  set: 9,
  out: 10,
  nov: 11,
  dez: 12,
};

type AnalyticsPoint = {
  label: string;
  count: number;
};

type AnalyticsMonthlyPoint = {
  label: string;
  year: number;
  month: number;
  total: number;
  skuWithSales: number;
};

type AnalyticsSkuMape = {
  codigo: string;
  mapeTotal: number | null;
  classificacao: string;
  bias: string;
  sugestaoAjustePct: number | null;
};

type AnalyticsModel = {
  modelo: string;
  skuCount: number;
  avgMape: number | null;
};

type AnalyticsScenario = {
  codigo: string;
  tipoProduto: string;
  melhorOpcao: string;
  variacaoPct: number | null;
  valorMelhorOpcao: number | null;
};

export type PrevisaoJobAnalytics = {
  generatedAt: string;
  sheetNames: string[];
  summary: {
    skuCount: number;
    avgMapeTotal: number | null;
    medianMapeTotal: number | null;
    acuracidadeMedia: number | null;
    avgSugestaoAjustePct: number | null;
    modelCount: number;
  };
  monthlySeries: AnalyticsMonthlyPoint[];
  acuracidadeDistribution: AnalyticsPoint[];
  biasDistribution: AnalyticsPoint[];
  status12mDistribution: AnalyticsPoint[];
  statusAtividadeDistribution: AnalyticsPoint[];
  modelRanking: AnalyticsModel[];
  topErros: AnalyticsSkuMape[];
  topAcertos: AnalyticsSkuMape[];
  topOportunidades: AnalyticsScenario[];
  topRiscos: AnalyticsScenario[];
};

type ExplainabilityImpact = "POSITIVO" | "NEGATIVO" | "NEUTRO";

type PrevisaoExplainabilityFactor = {
  titulo: string;
  impacto: ExplainabilityImpact;
  evidencia: string;
  detalhe: string;
};

export type PrevisaoExplainabilityItem = {
  codigo: string;
  direcao: "SUBIU" | "CAIU" | "ESTAVEL";
  variacaoPct: number | null;
  mapeTotal: number | null;
  bias: string;
  status12m: string;
  statusAtividade: string;
  melhorOpcao: string;
  fatores: PrevisaoExplainabilityFactor[];
  explicacao: string;
  melhorias: string[];
};

export type PrevisaoJobExplainability = {
  generatedAt: string;
  totalSku: number;
  skuComVariacaoRelevante: number;
  itens: PrevisaoExplainabilityItem[];
  recomendacoesGerais: string[];
};

export type PrevisaoScenarioSnapshotSummary = {
  skuCount: number;
  oportunidades: number;
  riscos: number;
  neutros: number;
  variacaoMediaPct: number | null;
  valorOportunidades: number | null;
  valorRiscos: number | null;
};

export type PrevisaoScenarioSnapshotItem = {
  codigo: string;
  tipoProduto: string;
  melhorOpcao: string;
  variacaoPct: number | null;
  valorMelhorOpcao: number | null;
};

export type PrevisaoScenarioSnapshotView = {
  id: number;
  jobId: number;
  cicloRef: string;
  horizonteRef: string | null;
  titulo: string | null;
  observacoes: string | null;
  createdBy: string | null;
  createdAt: string;
  summary: PrevisaoScenarioSnapshotSummary;
  items: PrevisaoScenarioSnapshotItem[];
};

export type PrevisaoScenarioSnapshotListItem = Omit<PrevisaoScenarioSnapshotView, "items">;

export type PrevisaoScenarioComparisonItem = {
  codigo: string;
  variacaoBasePct: number | null;
  variacaoTargetPct: number | null;
  deltaVariacaoPct: number | null;
  melhorOpcaoBase: string;
  melhorOpcaoTarget: string;
  mudouOpcao: boolean;
};

export type PrevisaoScenarioComparison = {
  baseSnapshotId: number;
  targetSnapshotId: number;
  skuComparados: number;
  skuMudouOpcao: number;
  deltaVariacaoMediaPct: number | null;
  principaisMudancas: PrevisaoScenarioComparisonItem[];
};

export type PrevisaoCycleSummary = {
  generatedAt: string;
  titulo: string;
  contexto: string;
  kpis: Array<{ label: string; valor: string; destaque: "NEUTRO" | "ATENCAO" | "POSITIVO" }>;
  riscos: string[];
  decisoesPendentes: string[];
  planoAcao: string[];
  recomendacaoExecutiva: string;
  snapshotAtual: PrevisaoScenarioSnapshotListItem | null;
  comparativoSnapshots: PrevisaoScenarioComparison | null;
};

export type PrevisaoExecutiveItem = {
  codigo: string;
  tipoProduto: string;
  classificacaoAjuste: string;
  melhorOpcao: string;
  valorMelhorOpcao: number | null;
  variacaoMelhorOpcaoPct: number | null;
  sugestaoAjustePct: number | null;
  premissaAjuste: string;
};

export type PrevisaoExecutiveAnalytics = {
  generatedAt: string;
  summary: {
    skuCount: number;
    avgSugestaoAjustePct: number | null;
    medianSugestaoAjustePct: number | null;
    classificacaoDominante: string;
    valorTotalMelhorOpcao: number | null;
    oportunidades: number;
    riscos: number;
  };
  classificacaoAjusteDistribution: AnalyticsPoint[];
  topValor: PrevisaoExecutiveItem[];
  topVariacao: PrevisaoExecutiveItem[];
  recomendacoes: string[];
};

export type PrevisaoCustomerSkuSummary = {
  codigo: string;
  totalClientesUnicos: number | null;
  clientesAtivos12m: number | null;
  clientesEmRisco: number | null;
  tempoMedioEntreComprasMeses: number | null;
};

export type PrevisaoCustomerClientItem = {
  codigo: string;
  codCliente: string;
  comportamento: string;
  fidelidade: string;
  totalUnidades: number | null;
  mesesComCompras: number | null;
  ultimoMes: string;
};

export type PrevisaoCustomerRuleItem = {
  criterio: string;
  definicao: string;
  formula: string;
  observacoes: string;
};

export type PrevisaoCustomerAnalytics = {
  generatedAt: string;
  summary: {
    skuCount: number;
    totalClientesUnicos: number;
    mediaClientesAtivos12m: number | null;
    mediaClientesEmRisco: number | null;
    tempoMedioEntreComprasMeses: number | null;
  };
  comportamentoDistribution: AnalyticsPoint[];
  fidelidadeDistribution: AnalyticsPoint[];
  concentracaoMarcas: Array<{
    marca: string;
    skuCount: number;
    totalClientesUnicos: number;
  }>;
  topSkuRisco: PrevisaoCustomerSkuSummary[];
  topClientes: PrevisaoCustomerClientItem[];
  regrasClassificacao: PrevisaoCustomerRuleItem[];
};

type AnalyticsCacheEntry = {
  outputPath: string;
  mtimeMs: number;
  data: PrevisaoJobAnalytics;
};

const analyticsCache = new Map<number, AnalyticsCacheEntry>();

type ExplainabilityCacheEntry = {
  outputPath: string;
  mtimeMs: number;
  data: PrevisaoJobExplainability;
};

const explainabilityCache = new Map<number, ExplainabilityCacheEntry>();

type SheetFilterInput = {
  column: string;
  value: string;
};

type WorkbookSheetData = {
  sheetName: string;
  columns: string[];
  rows: string[][];
};

type WorkbookViewCacheEntry = {
  outputPath: string;
  mtimeMs: number;
  lastAccessAt: number;
  sheetNames: string[];
  fileBuffer: Buffer | null;
  sheets: Map<string, WorkbookSheetData>;
  normalizedSheetNameMap: Map<string, string>;
  warmingPromise: Promise<void> | null;
};

type SheetDataQueryResult = {
  sheetName: string;
  columns: string[];
  rows: string[][];
  totalRows: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type SheetDataQueryCacheEntry = {
  key: string;
  createdAt: number;
  data: SheetDataQueryResult;
};

const WORKBOOK_CACHE_MAX_ITEMS = 8;
const WORKBOOK_CACHE_TTL_MS = 30 * 60 * 1000;
const workbookViewCache = new Map<number, WorkbookViewCacheEntry>();
const SHEET_DATA_QUERY_CACHE_TTL_MS = 5 * 60_000;
const SHEET_DATA_QUERY_CACHE_MAX_ITEMS = 200;
const sheetDataQueryCache = new Map<string, SheetDataQueryCacheEntry>();

let running = false;
const queue: number[] = [];
const queued = new Set<number>();
let recoveryCompleted = false;
let recoveryInProgress = false;
const RECOVERY_BATCH_LIMIT = 500;

function decodeBase64(contentBase64: string): Buffer {
  const payload = contentBase64.includes(",")
    ? contentBase64.split(",")[1]
    : contentBase64;
  return Buffer.from(payload, "base64");
}

function sha256(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function inspectWorkbookInput(fileName: string, buffer: Buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheetName = workbook.SheetNames[0] ?? "";
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet) throw new Error(`Planilha sem abas: ${fileName}`);
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
  });
  const headers = (rows[0] ?? []).map(value => String(value ?? "").trim());
  const monthHeaders = headers.filter(header =>
    /^(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)-\d{2}$/i.test(header)
  );
  const monthIndexes = headers
    .map((header, index) => ({ header, index }))
    .filter(({ header }) =>
      /^(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)-\d{2}$/i.test(header)
    )
    .map(({ index }) => index);
  const totalCompetencias = rows.slice(1).reduce(
    (total, row) =>
      total +
      monthIndexes.reduce((rowTotal, index) => {
        const value = Number(row[index]);
        return rowTotal + (Number.isFinite(value) ? value : 0);
      }, 0),
    0
  );
  return {
    fileName,
    sha256: sha256(buffer),
    sizeBytes: buffer.length,
    sheetName,
    rowCount: Math.max(0, rows.length - 1),
    columnCount: headers.length,
    firstCompetence: monthHeaders[0] ?? null,
    lastCompetence: monthHeaders.at(-1) ?? null,
    totalCompetencias: Math.round(totalCompetencias * 100) / 100,
  };
}

function sanitizeWorkbookFileName(fileName: string, fallback: string) {
  const trimmed = String(fileName || "").trim();
  if (!trimmed) return fallback;
  const baseName = path.basename(trimmed).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_");
  return baseName || fallback;
}

function getOutputFileName(jobId: number) {
  return `relatorio_previsao_demanda_job_${jobId}.xlsx`;
}

const JOB_DIR_PATTERN = /^job-(\d+)$/;
let reconcileJobsPromise: Promise<void> | null = null;

function isDuplicateKeyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Duplicate") || message.includes("ER_DUP_ENTRY");
}

async function findRecoverableOutputFileName(jobDir: string, jobId: number) {
  const preferred = getOutputFileName(jobId);
  const preferredPath = path.join(jobDir, preferred);
  const preferredExists = await fs
    .access(preferredPath)
    .then(() => true)
    .catch(() => false);
  if (preferredExists) return preferred;

  const names = await fs.readdir(jobDir).catch(() => [] as string[]);
  const workbooks = names.filter(
    name => name.toLowerCase().endsWith(".xlsx") && !name.startsWith("~$")
  );
  return (
    workbooks.find(name => name.toLowerCase().includes("relatorio")) ||
    workbooks[0] ||
    null
  );
}

async function recoverJobDirectory(jobId: number, jobDir: string) {
  const outputFileName = await findRecoverableOutputFileName(jobDir, jobId);
  if (!outputFileName) return;

  const logPath = path.join(jobDir, "run.log");
  const logExists = await fs
    .access(logPath)
    .then(() => true)
    .catch(() => false);

  try {
    await db.recoverPrevisaoPythonJobRow({
      id: jobId,
      status: "SUCCESS",
      scriptVersion: "v5.2-COMPLETO",
      vendasFileName: INPUT_VENDAS_NAME,
      outputFileName,
      workdir: jobDir,
      logPath: logExists ? logPath : null,
      message: "Job recuperado a partir do arquivo Excel no disco.",
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) return;
    const existing = await db.getPrevisaoPythonJobById(jobId);
    if (existing) return;
    throw error;
  }
}

async function reconcilePrevisaoJobsFromDiskOnce() {
  const entries = await fs.readdir(JOBS_ROOT).catch(() => [] as string[]);
  for (const entry of entries) {
    const match = JOB_DIR_PATTERN.exec(entry);
    if (!match) continue;
    const jobId = Number(match[1]);
    if (!Number.isInteger(jobId) || jobId <= 0) continue;
    const existing = await db.getPrevisaoPythonJobById(jobId);
    if (existing) continue;
    await recoverJobDirectory(jobId, path.join(JOBS_ROOT, entry));
  }
}

function reconcilePrevisaoJobsFromDisk() {
  if (!reconcileJobsPromise) {
    reconcileJobsPromise = reconcilePrevisaoJobsFromDiskOnce().catch(error => {
      reconcileJobsPromise = null;
      throw error;
    });
  }
  return reconcileJobsPromise;
}

export async function getPrevisaoJobById(jobId: number) {
  const existing = await db.getPrevisaoPythonJobById(jobId);
  if (existing) {
    void reconcilePrevisaoJobsFromDisk();
    return existing;
  }
  await reconcilePrevisaoJobsFromDisk();
  return db.getPrevisaoPythonJobById(jobId);
}

export async function listPrevisaoJobs(limit = 20) {
  const jobs = await db.listPrevisaoPythonJobs(limit);
  if (jobs.length > 0) {
    void reconcilePrevisaoJobsFromDisk();
    return jobs;
  }
  await reconcilePrevisaoJobsFromDisk();
  return db.listPrevisaoPythonJobs(limit);
}

async function ensureJobsRoot() {
  await fs.mkdir(JOBS_ROOT, { recursive: true });
}

async function findScriptPath() {
  const candidates = [
    path.resolve(process.cwd(), "scripts-previsao", SCRIPT_NAME),
    path.resolve(
      process.cwd(),
      "..",
      "OneDrive_2026-07-30",
      "1-Módulo Previsão Demanda",
      "MAIS ATUAL previsao_demanda_final_v5_2_COMPLETO.py"
    ),
    path.resolve(process.cwd(), "..", "3. Script Python Previsão Demanda", SCRIPT_NAME),
    path.resolve(process.cwd(), "3. Script Python Previsão Demanda", SCRIPT_NAME),
  ];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // continue searching
    }
  }

  throw new Error(
    `Script Python não encontrado. Esperado em: ${candidates.join(" | ")}`
  );
}

function appendQueue(jobId: number) {
  if (queued.has(jobId)) return;
  queue.push(jobId);
  queued.add(jobId);
  void processQueue().catch(error => {
    console.error(`[previsao-python] Falha ao processar fila (job ${jobId}):`, error);
  });
}

async function processQueue() {
  if (running) return;
  const nextJobId = queue.shift();
  if (!nextJobId) return;
  queued.delete(nextJobId);

  running = true;
  try {
    await runJob(nextJobId);
  } finally {
    running = false;
    if (queue.length > 0) {
      await processQueue();
    }
  }
}

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

async function appendLineToLog(logPath: string | null, line: string) {
  if (!logPath) return;

  const resolved = path.resolve(logPath);
  if (!resolved.startsWith(JOBS_ROOT)) return;

  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.appendFile(resolved, line.endsWith("\n") ? line : `${line}\n`, "utf8");
}

async function recoverStaleJobsOnBoot() {
  if (recoveryCompleted || recoveryInProgress) return;
  recoveryInProgress = true;

  try {
    await ensureJobsRoot();

    const runningJobs = await db.listPrevisaoPythonJobsByStatus("RUNNING", RECOVERY_BATCH_LIMIT);
    for (const job of runningJobs) {
      await db.updatePrevisaoPythonJob(job.id, {
        status: "ERROR",
        finishedAt: new Date(),
        exitCode: job.exitCode ?? 137,
        message:
          "Job interrompido por reinicio do servidor. Reexecute para processar novamente.",
      });
      await appendLineToLog(
        job.logPath,
        `[job ${job.id}] Servidor reiniciado durante execucao anterior. Marcado como ERROR.`
      );
    }

    const pendingJobs = await db.listPrevisaoPythonJobsByStatus("PENDING", RECOVERY_BATCH_LIMIT);
    for (const job of pendingJobs) {
      appendQueue(job.id);
    }

    recoveryCompleted = true;
  } catch (error) {
    console.error("[previsao-python] Falha ao recuperar jobs na inicializacao:", error);
  } finally {
    recoveryInProgress = false;
  }
}

void recoverStaleJobsOnBoot();

async function runJob(jobId: number) {
  const job = await db.getPrevisaoPythonJobById(jobId);
  if (!job) return;

  if (!job.workdir || !job.logPath) {
    await db.updatePrevisaoPythonJob(jobId, {
      status: "ERROR",
      message: "Workdir/logPath ausentes para execucao.",
      finishedAt: new Date(),
    });
    return;
  }

  const claimed = await db.claimPrevisaoPythonJob(jobId, "Iniciando execucao do script Python...");
  if (!claimed) return;

  const logDir = path.dirname(job.logPath);
  await fs.mkdir(logDir, { recursive: true });
  const logStream = createWriteStream(job.logPath, { flags: "a", encoding: "utf8" });

  const writeLog = (line: string) => {
    logStream.write(line.endsWith("\n") ? line : `${line}\n`);
  };

  try {
    const latestJob = await db.getPrevisaoPythonJobById(jobId);
    const effectiveWorkdir = latestJob?.workdir || job.workdir;
    const outputName = latestJob?.outputFileName || job.outputFileName || getOutputFileName(jobId);

    const scriptPath = await findScriptPath();
    const scriptBuffer = await fs.readFile(scriptPath);
    const scriptHash = sha256(scriptBuffer);
    const localScriptPath = path.join(effectiveWorkdir, SCRIPT_NAME);
    await fs.writeFile(localScriptPath, scriptBuffer);

    const helperSourcePath = path.join(path.dirname(scriptPath), SCRIPT_HELPER_NAME);
    try {
      const helperBuffer = await fs.readFile(helperSourcePath);
      await fs.writeFile(path.join(effectiveWorkdir, SCRIPT_HELPER_NAME), helperBuffer);
      writeLog(`[job ${jobId}] Helper copiado: ${SCRIPT_HELPER_NAME}`);
    } catch {
      writeLog(
        `[job ${jobId}] Aviso: helper ${SCRIPT_HELPER_NAME} nao encontrado em ${helperSourcePath}`
      );
    }

    await db.updatePrevisaoPythonJob(jobId, { scriptHash });

    const pythonCommand = process.env.PREVISAO_PYTHON_CMD || "python";
    const args = [SCRIPT_NAME, "--arquivo", INPUT_VENDAS_NAME, "--saida", outputName];
    const timeoutMinutesRaw = Number(process.env.PREVISAO_PYTHON_TIMEOUT_MIN || "35");
    const timeoutMinutes =
      Number.isFinite(timeoutMinutesRaw) && timeoutMinutesRaw > 0 ? timeoutMinutesRaw : 35;
    const timeoutMs = timeoutMinutes * 60 * 1000;
    const heartbeatSecondsRaw = Number(process.env.PREVISAO_PYTHON_HEARTBEAT_SEC || "15");
    const heartbeatSeconds =
      Number.isFinite(heartbeatSecondsRaw) && heartbeatSecondsRaw > 0 ? heartbeatSecondsRaw : 15;
    const heartbeatMs = heartbeatSeconds * 1000;
    const workerThreadsRaw = Number(process.env.PREVISAO_PYTHON_THREADS || "2");
    const workerThreads =
      Number.isFinite(workerThreadsRaw) && workerThreadsRaw > 0
        ? String(Math.max(1, Math.floor(workerThreadsRaw)))
        : "2";

    writeLog(`[job ${jobId}] Script: ${scriptPath}`);
    writeLog(`[job ${jobId}] SHA-256 do script: ${scriptHash}`);
    writeLog(`[job ${jobId}] Comando: ${pythonCommand} ${args.join(" ")}`);
    writeLog(`[job ${jobId}] Timeout configurado: ${timeoutMinutes} min`);
    writeLog(`[job ${jobId}] Heartbeat a cada ${heartbeatSeconds}s`);

    let timedOut = false;
    const startedAtMs = Date.now();
    let lastOutputAtMs = Date.now();
    let lastMessageUpdateAtMs = 0;
    const exitCode = await new Promise<number>((resolve, reject) => {
      const child = spawn(pythonCommand, args, {
        cwd: effectiveWorkdir,
        shell: false,
        env: {
          ...process.env,
          PYTHONUTF8: "1",
          PYTHONIOENCODING: "utf-8",
          OMP_NUM_THREADS: workerThreads,
          OPENBLAS_NUM_THREADS: workerThreads,
          MKL_NUM_THREADS: workerThreads,
          NUMEXPR_NUM_THREADS: workerThreads,
        },
      });
      let forcedKillTimer: NodeJS.Timeout | null = null;
      const heartbeatHandle = setInterval(() => {
        const now = Date.now();
        const elapsed = formatDuration(now - startedAtMs);
        const silentFor = formatDuration(now - lastOutputAtMs);
        writeLog(`[job ${jobId}] Em execucao ha ${elapsed}. Sem nova saida ha ${silentFor}.`);

        if (now - lastMessageUpdateAtMs >= 60_000) {
          lastMessageUpdateAtMs = now;
          void db.updatePrevisaoPythonJob(jobId, {
            message: `Executando ha ${elapsed} (sem nova saida ha ${silentFor}).`,
          });
        }
      }, heartbeatMs);

      const timeoutHandle = setTimeout(() => {
        timedOut = true;
        writeLog(
          `[job ${jobId}] Timeout de ${timeoutMinutes} min atingido. Encerrando processo Python.`
        );
        child.kill("SIGTERM");
        forcedKillTimer = setTimeout(() => child.kill("SIGKILL"), 5000);
      }, timeoutMs);

      child.stdout.on("data", chunk => {
        lastOutputAtMs = Date.now();
        writeLog(String(chunk));
      });
      child.stderr.on("data", chunk => {
        lastOutputAtMs = Date.now();
        writeLog(String(chunk));
      });

      child.on("error", error => {
        clearTimeout(timeoutHandle);
        clearInterval(heartbeatHandle);
        if (forcedKillTimer) clearTimeout(forcedKillTimer);
        reject(error);
      });
      child.on("close", code => {
        clearTimeout(timeoutHandle);
        clearInterval(heartbeatHandle);
        if (forcedKillTimer) clearTimeout(forcedKillTimer);
        resolve(timedOut ? 124 : code ?? 1);
      });
    });

    const outputPath = path.join(effectiveWorkdir, outputName);
    const outputExists = await fs
      .access(outputPath)
      .then(() => true)
      .catch(() => false);

    if (!timedOut && exitCode === 0 && outputExists) {
      await db.updatePrevisaoPythonJob(jobId, {
        status: "SUCCESS",
        finishedAt: new Date(),
        exitCode,
        outputFileName: outputName,
        message: "Execucao concluida com sucesso.",
      });
      writeLog(`[job ${jobId}] Finalizado com sucesso.`);
    } else {
      const message = timedOut
        ? `Processo excedeu ${timeoutMinutes} min e foi encerrado.`
        : outputExists
          ? `Processo terminou com codigo ${exitCode}.`
          : `Saida nao encontrada (${outputName}). Codigo: ${exitCode}.`;
      await db.updatePrevisaoPythonJob(jobId, {
        status: "ERROR",
        finishedAt: new Date(),
        exitCode,
        outputFileName: outputExists ? outputName : null,
        message,
      });
      writeLog(`[job ${jobId}] Falha: ${message}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.updatePrevisaoPythonJob(jobId, {
      status: "ERROR",
      finishedAt: new Date(),
      message,
    });
    writeLog(`[job ${jobId}] Erro critico: ${message}`);
  } finally {
    logStream.end();
  }
}

export async function createAndQueuePrevisaoJob(input: CreatePrevisaoJobInput) {
  await recoverStaleJobsOnBoot();
  await ensureJobsRoot();

  const vendasBuffer = decodeBase64(input.vendas.contentBase64);
  const previstoBuffer = input.previsto?.contentBase64
    ? decodeBase64(input.previsto.contentBase64)
    : null;
  const clientesBuffer = input.clientes?.contentBase64
    ? decodeBase64(input.clientes.contentBase64)
    : null;
  const inputMetadata = {
    generatedAt: new Date().toISOString(),
    origin: input.origin ?? "UPLOAD",
    sourceMetadata: input.sourceMetadata ?? null,
    vendas: inspectWorkbookInput(input.vendas.fileName, vendasBuffer),
    previsto: previstoBuffer
      ? inspectWorkbookInput(input.previsto?.fileName || INPUT_PREVISTO_NAME, previstoBuffer)
      : null,
    clientes: clientesBuffer
      ? inspectWorkbookInput(input.clientes?.fileName || INPUT_CLIENTES_NAME, clientesBuffer)
      : null,
  };

  const created = await db.createPrevisaoPythonJob({
    status: "PENDING",
    scriptVersion: "v5.2-COMPLETO",
    inputMetadataJson: JSON.stringify(inputMetadata),
    createdBy: input.createdBy ?? null,
    vendasFileName: input.vendas.fileName || INPUT_VENDAS_NAME,
    previstoFileName: input.previsto?.fileName || null,
    clientesFileName: input.clientes?.fileName || null,
    message: "Job criado e aguardando processamento.",
  });

  const jobId = created.id;
  const workdir = path.join(JOBS_ROOT, `job-${jobId}`);
  const logPath = path.join(workdir, "run.log");
  const outputFileName = getOutputFileName(jobId);

  await fs.mkdir(workdir, { recursive: true });

  await fs.writeFile(path.join(workdir, INPUT_VENDAS_NAME), vendasBuffer);
  if (previstoBuffer) {
    await fs.writeFile(
      path.join(workdir, INPUT_PREVISTO_NAME),
      previstoBuffer
    );
  }
  if (clientesBuffer) {
    await fs.writeFile(
      path.join(workdir, INPUT_CLIENTES_NAME),
      clientesBuffer
    );
  }

  await db.updatePrevisaoPythonJob(jobId, {
    workdir,
    logPath,
    outputFileName,
  });

  appendQueue(jobId);
  return db.getPrevisaoPythonJobById(jobId);
}

export async function createCiclo13UploadJob(input: CreateCiclo13UploadJobInput) {
  await ensureJobsRoot();

  const workbookBuffer = decodeBase64(input.workbook.contentBase64);
  let workbook: WorkBook;
  try {
    workbook = XLSX.read(workbookBuffer, { type: "buffer", cellDates: true });
  } catch {
    throw new Error("Arquivo invalido. Envie uma planilha Excel (.xlsx/.xls).");
  }

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error("Planilha sem abas. Verifique o arquivo enviado.");
  }

  const created = await db.createPrevisaoPythonJob({
    status: "SUCCESS",
    scriptVersion: CICLO_13_SCRIPT_VERSION,
    createdBy: input.createdBy ?? null,
    vendasFileName: input.workbook.fileName || "Ciclo13.xlsx",
    previstoFileName: null,
    clientesFileName: null,
    message: "Workbook Ciclo 13 importado para visualizacao.",
    startedAt: new Date(),
    finishedAt: new Date(),
    exitCode: 0,
  });

  const jobId = created.id;
  const workdir = path.join(JOBS_ROOT, `job-${jobId}`);
  const logPath = path.join(workdir, "run.log");
  const outputFileName = sanitizeWorkbookFileName(
    input.workbook.fileName,
    `ciclo13_job_${jobId}.xlsx`
  );
  const outputPath = path.join(workdir, outputFileName);

  await fs.mkdir(workdir, { recursive: true });
  await fs.writeFile(outputPath, workbookBuffer);
  await fs.writeFile(
    logPath,
    [
      `[job ${jobId}] Upload Ciclo 13 recebido.`,
      `[job ${jobId}] Arquivo salvo: ${outputFileName}.`,
      `[job ${jobId}] Abas detectadas: ${workbook.SheetNames.join(", ")}.`,
      `[job ${jobId}] Job marcado como SUCCESS para analise visual.`,
    ].join("\n")
  );

  await db.updatePrevisaoPythonJob(jobId, {
    workdir,
    logPath,
    outputFileName,
  });

  return db.getPrevisaoPythonJobById(jobId);
}

export async function getPrevisaoJobLog(jobId: number, maxChars = 40000) {
  const job = await getPrevisaoJobById(jobId);
  if (!job) throw new Error("Job não encontrado.");
  if (!job.logPath) return "";

  const logPath = path.resolve(job.logPath);
  if (!logPath.startsWith(JOBS_ROOT)) {
    throw new Error("Caminho de log inválido.");
  }

  const safeMaxChars = Math.max(1, Math.min(Math.floor(maxChars), 100_000));
  const file = await fs.open(logPath, "r").catch(() => null);
  if (!file) return "";

  try {
    const stat = await file.stat();
    const bytesToRead = Math.min(stat.size, safeMaxChars * 4);
    if (bytesToRead === 0) return "";

    const buffer = Buffer.allocUnsafe(bytesToRead);
    const { bytesRead } = await file.read(
      buffer,
      0,
      bytesToRead,
      stat.size - bytesToRead
    );
    return buffer.subarray(0, bytesRead).toString("utf8").slice(-safeMaxChars);
  } finally {
    await file.close();
  }
}

export async function getPrevisaoJobOutputAsBase64(jobId: number) {
  const file = await getPrevisaoJobOutputFile(jobId);
  const fileBuffer = await fs.readFile(file.filePath);
  return {
    fileName: file.fileName,
    contentBase64: fileBuffer.toString("base64"),
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
}

export async function getPrevisaoJobOutputFile(jobId: number) {
  const job = await getPrevisaoJobById(jobId);
  if (!job) throw new Error("Job não encontrado.");
  if (!job.workdir || !job.outputFileName) throw new Error("Arquivo de saída não disponível.");

  const outputPath = path.resolve(path.join(job.workdir, job.outputFileName));
  if (!outputPath.startsWith(JOBS_ROOT)) {
    throw new Error("Caminho de saída inválido.");
  }

  const outputExists = await fs
    .access(outputPath)
    .then(() => true)
    .catch(() => false);
  if (!outputExists) {
    throw new Error("Arquivo de saida nao disponivel.");
  }

  return {
    filePath: outputPath,
    fileName: job.outputFileName,
  };
}

async function getOutputPathFromJob(jobId: number) {
  const job = await getPrevisaoJobById(jobId);
  if (!job) throw new Error("Job não encontrado.");
  if (!job.workdir || !job.outputFileName) throw new Error("Arquivo de saída não disponível.");

  const outputPath = path.resolve(path.join(job.workdir, job.outputFileName));
  if (!outputPath.startsWith(JOBS_ROOT)) {
    throw new Error("Caminho de saída inválido.");
  }
  return outputPath;
}

async function getVisualizableOutputPathFromJob(jobId: number) {
  const job = await getPrevisaoJobById(jobId);
  if (!job) throw new Error("Job nao encontrado.");
  if (!job.workdir || !job.outputFileName) {
    throw new Error("Arquivo de saida nao disponivel.");
  }

  const outputPath = path.resolve(path.join(job.workdir, job.outputFileName));
  if (!outputPath.startsWith(JOBS_ROOT)) {
    throw new Error("Caminho de saida invalido.");
  }

  const outputExists = await fs
    .access(outputPath)
    .then(() => true)
    .catch(() => false);
  if (!outputExists) {
    throw new Error("Arquivo de saida nao disponivel.");
  }

  return outputPath;
}

function cleanupWorkbookViewCache(now = Date.now()) {
  for (const [jobId, entry] of Array.from(workbookViewCache.entries())) {
    if (now - entry.lastAccessAt > WORKBOOK_CACHE_TTL_MS) {
      workbookViewCache.delete(jobId);
    }
  }

  if (workbookViewCache.size <= WORKBOOK_CACHE_MAX_ITEMS) return;

  const sortedByOldestAccess = Array.from(workbookViewCache.entries())
    .sort((a, b) => a[1].lastAccessAt - b[1].lastAccessAt);

  while (workbookViewCache.size > WORKBOOK_CACHE_MAX_ITEMS) {
    const oldest = sortedByOldestAccess.shift();
    if (!oldest) break;
    workbookViewCache.delete(oldest[0]);
  }
}

function cleanupSheetDataQueryCache(now = Date.now()) {
  for (const [key, entry] of Array.from(sheetDataQueryCache.entries())) {
    if (now - entry.createdAt > SHEET_DATA_QUERY_CACHE_TTL_MS) {
      sheetDataQueryCache.delete(key);
    }
  }

  while (sheetDataQueryCache.size > SHEET_DATA_QUERY_CACHE_MAX_ITEMS) {
    const oldestKey = sheetDataQueryCache.keys().next().value;
    if (!oldestKey) break;
    sheetDataQueryCache.delete(oldestKey);
  }
}

function getSheetDataQueryCacheEntry(key: string) {
  const now = Date.now();
  const entry = sheetDataQueryCache.get(key);
  if (!entry) return null;
  if (now - entry.createdAt > SHEET_DATA_QUERY_CACHE_TTL_MS) {
    sheetDataQueryCache.delete(key);
    return null;
  }

  // Touch entry to keep LRU-ish order.
  sheetDataQueryCache.delete(key);
  sheetDataQueryCache.set(key, {
    ...entry,
    createdAt: now,
  });
  return entry.data;
}

function setSheetDataQueryCacheEntry(key: string, data: SheetDataQueryResult) {
  const now = Date.now();
  sheetDataQueryCache.delete(key);
  sheetDataQueryCache.set(key, {
    key,
    createdAt: now,
    data,
  });
  cleanupSheetDataQueryCache(now);
}

function normalizeSheetColumns(rawHeader: string[], targetLength: number) {
  const seen = new Map<string, number>();
  const columns: string[] = [];

  for (let index = 0; index < targetLength; index++) {
    const baseName = (rawHeader[index] || "").trim() || `Coluna ${index + 1}`;
    const count = seen.get(baseName) ?? 0;
    seen.set(baseName, count + 1);
    columns.push(count === 0 ? baseName : `${baseName} (${count + 1})`);
  }

  return columns;
}

function buildSheetData(sheetName: string, ws: WorkSheet): WorkbookSheetData {
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: null,
  });

  const maxColumns = rawRows.reduce((max, row) => Math.max(max, row.length), 0);
  if (maxColumns === 0) {
    return {
      sheetName,
      columns: [],
      rows: [],
    };
  }

  const rawHeader = (rawRows[0] || []).map(value => toText(value));
  const columns = normalizeSheetColumns(rawHeader, maxColumns);
  const rows = rawRows.slice(1).map(row =>
    Array.from({ length: maxColumns }, (_, index) => toText(row[index]))
  );

  return {
    sheetName,
    columns,
    rows,
  };
}

function touchWorkbookCacheEntry(jobId: number, entry: WorkbookViewCacheEntry) {
  entry.lastAccessAt = Date.now();
  workbookViewCache.delete(jobId);
  workbookViewCache.set(jobId, entry);
}

function resolveSheetNameFromEntry(entry: WorkbookViewCacheEntry, requestedSheetName: string) {
  if (entry.sheets.has(requestedSheetName) || entry.sheetNames.includes(requestedSheetName)) {
    return requestedSheetName;
  }

  const normalized = normalizeHeader(requestedSheetName);
  const mapped = entry.normalizedSheetNameMap.get(normalized);
  if (mapped) return mapped;

  const matched = entry.sheetNames.find(name => normalizeHeader(name) === normalized);
  return matched || null;
}

const PRIORITY_SHEETS_TO_WARM = [
  "Visao_Executiva",
  "Geral",
  "Detalhado",
  "Backtest",
  "Backtest_Sku",
  "Analise_Cenarios",
  "Acuracidade",
  "Acuracidade_Detalhada",
  "Clientes",
  "Clientes_Analise",
  "Modelos_Estatisticos",
  "Sazonalidade",
  "Metodologia",
];

async function ensureWorkbookSheetLoaded(
  entry: WorkbookViewCacheEntry,
  requestedSheetName: string
) {
  const sheetName = resolveSheetNameFromEntry(entry, requestedSheetName);
  if (!sheetName) {
    throw new Error(`Aba nao encontrada: ${requestedSheetName}`);
  }

  const cachedSheet = entry.sheets.get(sheetName);
  if (cachedSheet) return cachedSheet;

  if (!entry.fileBuffer) {
    entry.fileBuffer = await fs.readFile(entry.outputPath);
  }

  const wb = XLSX.read(entry.fileBuffer, {
    type: "buffer",
    cellDates: true,
    sheets: [sheetName],
  });
  const ws = wb.Sheets[sheetName];
  if (!ws) {
    throw new Error(`Aba nao encontrada: ${requestedSheetName}`);
  }

  const sheetData = buildSheetData(sheetName, ws);
  entry.sheets.set(sheetName, sheetData);
  entry.normalizedSheetNameMap.set(normalizeHeader(sheetName), sheetName);
  entry.lastAccessAt = Date.now();
  return sheetData;
}

function warmWorkbookSheetsInBackground(entry: WorkbookViewCacheEntry) {
  if (entry.warmingPromise) return entry.warmingPromise;

  const heavySheets = new Set(["Cliente_detalhado", "Clientes_Por_Marca"]);

  entry.warmingPromise = (async () => {
    const pending = PRIORITY_SHEETS_TO_WARM.filter(
      name =>
        entry.sheetNames.includes(name) &&
        !entry.sheets.has(name) &&
        !heavySheets.has(name)
    );

    for (const sheetName of pending) {
      try {
        await ensureWorkbookSheetLoaded(entry, sheetName);
        await new Promise<void>(resolve => setImmediate(resolve));
      } catch {
        // Aquecimento é best-effort; aba será carregada no clique.
      }
    }
  })().finally(() => {
    entry.warmingPromise = null;
  });

  return entry.warmingPromise;
}

async function getWorkbookViewCacheEntry(jobId: number) {
  const outputPath = await getVisualizableOutputPathFromJob(jobId);
  const stat = await fs.stat(outputPath);
  const now = Date.now();

  cleanupWorkbookViewCache(now);

  const cached = workbookViewCache.get(jobId);
  const reuseCache =
    cached &&
    cached.outputPath === outputPath &&
    cached.mtimeMs === stat.mtimeMs &&
    now - cached.lastAccessAt <= WORKBOOK_CACHE_TTL_MS;

  if (reuseCache && cached) {
    touchWorkbookCacheEntry(jobId, cached);
    return cached;
  }

  // Lê o arquivo uma vez em memória; abas são parseadas sob demanda / em warm-up.
  const fileBuffer = await fs.readFile(outputPath);
  const wb = XLSX.read(fileBuffer, { type: "buffer", bookSheets: true });
  const sheetNames = [...wb.SheetNames];
  const normalizedSheetNameMap = new Map<string, string>();
  for (const sheetName of sheetNames) {
    normalizedSheetNameMap.set(normalizeHeader(sheetName), sheetName);
  }

  const entry: WorkbookViewCacheEntry = {
    outputPath,
    mtimeMs: stat.mtimeMs,
    lastAccessAt: now,
    sheetNames,
    fileBuffer,
    sheets: new Map(),
    normalizedSheetNameMap,
    warmingPromise: null,
  };

  workbookViewCache.set(jobId, entry);
  cleanupWorkbookViewCache(now);
  return entry;
}

async function resolveSheetFromCache(entry: WorkbookViewCacheEntry, requestedSheetName: string) {
  return ensureWorkbookSheetLoaded(entry, requestedSheetName);
}

function resolveColumnIndex(columns: string[], requestedColumn: string) {
  const normalizedRequested = normalizeHeader(requestedColumn);
  if (!normalizedRequested) return -1;

  for (let index = 0; index < columns.length; index++) {
    if (normalizeHeader(columns[index]) === normalizedRequested) {
      return index;
    }
  }

  return -1;
}

function resolveColumnIndexByAliases(columns: string[], aliases: string[]) {
  for (const alias of aliases) {
    const index = resolveColumnIndex(columns, alias);
    if (index >= 0) return index;
  }
  return -1;
}

async function getOptionalSheetFromCache(
  entry: WorkbookViewCacheEntry,
  requestedSheetName: string
) {
  try {
    return await resolveSheetFromCache(entry, requestedSheetName);
  } catch {
    return null;
  }
}

function normalizeHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function resolveColumnName(rows: Record<string, unknown>[], aliases: string[]) {
  if (rows.length === 0) return null;

  const keys = Object.keys(rows[0]);
  const normalizedKeys = keys.map(key => ({
    key,
    normalized: normalizeHeader(key),
  }));

  const normalizedAliases = aliases.map(alias => normalizeHeader(alias));

  for (const alias of normalizedAliases) {
    const exact = normalizedKeys.find(item => item.normalized === alias);
    if (exact) return exact.key;
  }

  for (const alias of normalizedAliases) {
    const partial = normalizedKeys.find(
      item => item.normalized.includes(alias) || alias.includes(item.normalized)
    );
    if (partial) return partial.key;
  }

  return null;
}

function toText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const hasPercent = trimmed.includes("%");
  const cleanRaw = trimmed.replace(/[^\d,.\-]/g, "");
  if (!cleanRaw) return null;

  let normalized = cleanRaw;
  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (normalized.includes(",")) {
    normalized = normalized.replace(",", ".");
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;

  if (hasPercent && Math.abs(parsed) > 1) {
    return parsed / 100;
  }

  return parsed;
}

function safeMean(values: number[]) {
  if (values.length === 0) return null;
  const total = values.reduce((acc, value) => acc + value, 0);
  return total / values.length;
}

function safeMedian(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

function countByLabel(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) {
    const label = value || "SEM CLASSIFICACAO";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

function getSheetRows(wb: WorkBook, sheetName: string) {
  const foundName = wb.SheetNames.find(name => normalizeHeader(name) === normalizeHeader(sheetName));
  if (!foundName) return [] as Record<string, unknown>[];
  const ws = wb.Sheets[foundName];
  if (!ws) return [] as Record<string, unknown>[];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
}

function extractMonthlySeries(detalhadoRows: Record<string, unknown>[]) {
  if (detalhadoRows.length === 0) return [] as AnalyticsMonthlyPoint[];

  const firstRow = detalhadoRows[0];
  const monthColumns = Object.keys(firstRow)
    .map(key => {
      const match = key.trim().toLowerCase().match(/^(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[-_/ ]?(\d{2,4})$/);
      if (!match) return null;

      const month = MONTH_INDEX[match[1]];
      if (!month) return null;

      const yearRaw = Number(match[2]);
      if (!Number.isFinite(yearRaw)) return null;
      const year = match[2].length === 2 ? 2000 + yearRaw : yearRaw;

      return { key, month, year, label: `${match[1]}-${String(year).slice(-2)}` };
    })
    .filter((entry): entry is { key: string; month: number; year: number; label: string } => Boolean(entry))
    .sort((a, b) => (a.year - b.year) || (a.month - b.month));

  return monthColumns.map(column => {
    let total = 0;
    let skuWithSales = 0;

    for (const row of detalhadoRows) {
      const value = toNumber(row[column.key]);
      if (value !== null) {
        total += value;
        if (value > 0) skuWithSales++;
      }
    }

    return {
      label: column.label,
      year: column.year,
      month: column.month,
      total,
      skuWithSales,
    };
  });
}

function roundOrNull(value: number | null, digits = 4) {
  if (value === null || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function formatPercentText(value: number | null, digits = 1) {
  if (value === null || !Number.isFinite(value)) return "--";
  return `${(value * 100).toFixed(digits)}%`;
}

function sumOrZero(values: Array<number | null>) {
  return values.reduce<number>((acc, value) => acc + (value ?? 0), 0);
}

function extractBrandFromCodigo(codigo: string) {
  const parts = codigo.split("-").map(part => part.trim()).filter(Boolean);
  if (parts.length >= 3) return parts[1];
  if (parts.length >= 2) return parts[0];
  return codigo.trim() || "SEM MARCA";
}

async function buildExecutiveAnalyticsFromCache(
  cacheEntry: WorkbookViewCacheEntry
): Promise<PrevisaoExecutiveAnalytics> {
  const executiveSheet =
    (await getOptionalSheetFromCache(cacheEntry, "Visao_Executiva")) ||
    (await getOptionalSheetFromCache(cacheEntry, "Analise_Cenarios"));

  if (!executiveSheet) {
    return {
      generatedAt: new Date().toISOString(),
      summary: {
        skuCount: 0,
        avgSugestaoAjustePct: null,
        medianSugestaoAjustePct: null,
        classificacaoDominante: "SEM DADOS",
        valorTotalMelhorOpcao: null,
        oportunidades: 0,
        riscos: 0,
      },
      classificacaoAjusteDistribution: [],
      topValor: [],
      topVariacao: [],
      recomendacoes: ["Aba Visao_Executiva/Analise_Cenarios nao encontrada no arquivo de saida."],
    };
  }

  const codigoIndex = resolveColumnIndexByAliases(executiveSheet.columns, ["Codigo", "SKU"]);
  const tipoProdutoIndex = resolveColumnIndexByAliases(executiveSheet.columns, ["Tipo Produto"]);
  const classificacaoAjusteIndex = resolveColumnIndexByAliases(executiveSheet.columns, [
    "Classificacao Ajuste",
  ]);
  const melhorOpcaoIndex = resolveColumnIndexByAliases(executiveSheet.columns, ["Melhor Opcao"]);
  const valorMelhorOpcaoIndex = resolveColumnIndexByAliases(executiveSheet.columns, [
    "Valor Melhor Opcao",
  ]);
  const variacaoMelhorOpcaoPctIndex = resolveColumnIndexByAliases(executiveSheet.columns, [
    "Variacao % Melhor Opcao",
    "Variacao Melhor Opcao",
  ]);
  const sugestaoAjustePctIndex = resolveColumnIndexByAliases(executiveSheet.columns, [
    "% Sugestao Ajuste",
    "Sugestao Ajuste Pct",
    "SUGESTAO_AJUSTE_PCT",
  ]);
  const premissaAjusteIndex = resolveColumnIndexByAliases(executiveSheet.columns, [
    "Premissa Ajuste",
  ]);

  const items = executiveSheet.rows
    .map<PrevisaoExecutiveItem>(row => ({
      codigo: toText(row[codigoIndex]),
      tipoProduto: toText(row[tipoProdutoIndex]),
      classificacaoAjuste: toText(row[classificacaoAjusteIndex]),
      melhorOpcao: toText(row[melhorOpcaoIndex]),
      valorMelhorOpcao: toNumber(row[valorMelhorOpcaoIndex]),
      variacaoMelhorOpcaoPct: toNumber(row[variacaoMelhorOpcaoPctIndex]),
      sugestaoAjustePct: toNumber(row[sugestaoAjustePctIndex]),
      premissaAjuste: toText(row[premissaAjusteIndex]),
    }))
    .filter(item => item.codigo);

  const sugestoes = items
    .map(item => item.sugestaoAjustePct)
    .filter((value): value is number => value !== null);
  const distribution = countByLabel(items.map(item => item.classificacaoAjuste || "SEM CLASSIFICACAO"));

  const oportunidades = items.filter(item => (item.variacaoMelhorOpcaoPct ?? 0) > 0).length;
  const riscos = items.filter(item => (item.variacaoMelhorOpcaoPct ?? 0) < 0).length;
  const valorTotal = sumOrZero(items.map(item => item.valorMelhorOpcao));

  const topValor = [...items]
    .sort((a, b) => (b.valorMelhorOpcao ?? -Infinity) - (a.valorMelhorOpcao ?? -Infinity))
    .slice(0, 12)
    .map(item => ({
      ...item,
      valorMelhorOpcao: roundOrNull(item.valorMelhorOpcao, 2),
      variacaoMelhorOpcaoPct: roundOrNull(item.variacaoMelhorOpcaoPct),
      sugestaoAjustePct: roundOrNull(item.sugestaoAjustePct),
    }));

  const topVariacao = [...items]
    .filter(item => item.variacaoMelhorOpcaoPct !== null)
    .sort(
      (a, b) =>
        Math.abs(b.variacaoMelhorOpcaoPct ?? 0) - Math.abs(a.variacaoMelhorOpcaoPct ?? 0)
    )
    .slice(0, 12)
    .map(item => ({
      ...item,
      valorMelhorOpcao: roundOrNull(item.valorMelhorOpcao, 2),
      variacaoMelhorOpcaoPct: roundOrNull(item.variacaoMelhorOpcaoPct),
      sugestaoAjustePct: roundOrNull(item.sugestaoAjustePct),
    }));

  const dominantClassificacao = distribution[0]?.label || "SEM CLASSIFICACAO";
  const recomendacoes: string[] = [];
  if (riscos > oportunidades) {
    recomendacoes.push(
      "Riscos superam oportunidades no ciclo. Priorizar validacao comercial dos SKU com maior queda."
    );
  } else {
    recomendacoes.push(
      "Oportunidades superam riscos no ciclo. Validar capacidade e capturar ganho nos SKU de maior valor."
    );
  }

  if ((safeMean(sugestoes) ?? 0) > 0.2) {
    recomendacoes.push(
      "A sugestao media de ajuste esta elevada. Revisar premissas para reduzir ajustes manuais excessivos."
    );
  }

  recomendacoes.push(
    `Classificacao dominante do ciclo: ${dominantClassificacao}.`
  );

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      skuCount: items.length,
      avgSugestaoAjustePct: roundOrNull(safeMean(sugestoes)),
      medianSugestaoAjustePct: roundOrNull(safeMedian(sugestoes)),
      classificacaoDominante: dominantClassificacao,
      valorTotalMelhorOpcao: roundOrNull(valorTotal, 2),
      oportunidades,
      riscos,
    },
    classificacaoAjusteDistribution: distribution,
    topValor,
    topVariacao,
    recomendacoes,
  };
}

async function buildCustomerAnalyticsFromCache(
  cacheEntry: WorkbookViewCacheEntry
): Promise<PrevisaoCustomerAnalytics> {
  const customersSheet = await getOptionalSheetFromCache(cacheEntry, "Clientes");
  const customerDetailSheet = await getOptionalSheetFromCache(cacheEntry, "Cliente_detalhado");
  const rulesSheet = await getOptionalSheetFromCache(cacheEntry, "Clientes_Por_Marca");

  const skuRows: PrevisaoCustomerSkuSummary[] = [];

  if (customersSheet) {
    const codigoIndex = resolveColumnIndexByAliases(customersSheet.columns, ["Codigo", "SKU"]);
    const totalClientesUnicosIndex = resolveColumnIndexByAliases(customersSheet.columns, [
      "TOTAL_CLIENTES_UNICOS",
    ]);
    const clientesAtivos12mIndex = resolveColumnIndexByAliases(customersSheet.columns, [
      "CLIENTES_ATIVOS_12M",
    ]);
    const clientesEmRiscoIndex = resolveColumnIndexByAliases(customersSheet.columns, [
      "CLIENTES_EM_RISCO",
    ]);
    const tempoMedioEntreComprasIndex = resolveColumnIndexByAliases(customersSheet.columns, [
      "TEMPO_MEDIO_ENTRE_COMPRAS_MESES",
    ]);

    for (const row of customersSheet.rows) {
      const codigo = toText(row[codigoIndex]);
      if (!codigo) continue;
      skuRows.push({
        codigo,
        totalClientesUnicos: toNumber(row[totalClientesUnicosIndex]),
        clientesAtivos12m: toNumber(row[clientesAtivos12mIndex]),
        clientesEmRisco: toNumber(row[clientesEmRiscoIndex]),
        tempoMedioEntreComprasMeses: toNumber(row[tempoMedioEntreComprasIndex]),
      });
    }
  }

  const comportamentoValues: string[] = [];
  const fidelidadeValues: string[] = [];
  const topClientes: PrevisaoCustomerClientItem[] = [];

  if (customerDetailSheet) {
    const codigoIndex = resolveColumnIndexByAliases(customerDetailSheet.columns, ["Codigo", "SKU"]);
    const codClienteIndex = resolveColumnIndexByAliases(customerDetailSheet.columns, [
      "Cod_Cliente",
      "Cliente",
    ]);
    const comportamentoIndex = resolveColumnIndexByAliases(customerDetailSheet.columns, [
      "COMPORTAMENTO",
    ]);
    const fidelidadeIndex = resolveColumnIndexByAliases(customerDetailSheet.columns, [
      "FIDELIDADE",
    ]);
    const totalUnidadesIndex = resolveColumnIndexByAliases(customerDetailSheet.columns, [
      "TOTAL_UNIDADES",
    ]);
    const mesesComComprasIndex = resolveColumnIndexByAliases(customerDetailSheet.columns, [
      "MESES_COM_COMPRAS",
    ]);
    const ultimoMesIndex = resolveColumnIndexByAliases(customerDetailSheet.columns, [
      "ULTIMO_MES",
    ]);

    for (const row of customerDetailSheet.rows) {
      const comportamento = toText(row[comportamentoIndex]);
      const fidelidade = toText(row[fidelidadeIndex]);
      if (comportamento) comportamentoValues.push(comportamento);
      if (fidelidade) fidelidadeValues.push(fidelidade);

      const codigo = toText(row[codigoIndex]);
      if (!codigo) continue;
      topClientes.push({
        codigo,
        codCliente: toText(row[codClienteIndex]),
        comportamento,
        fidelidade,
        totalUnidades: toNumber(row[totalUnidadesIndex]),
        mesesComCompras: toNumber(row[mesesComComprasIndex]),
        ultimoMes: toText(row[ultimoMesIndex]),
      });
    }
  }

  const regrasClassificacao: PrevisaoCustomerRuleItem[] = [];
  if (rulesSheet) {
    const criterioIndex = resolveColumnIndexByAliases(rulesSheet.columns, ["CRITERIO"]);
    const definicaoIndex = resolveColumnIndexByAliases(rulesSheet.columns, ["DEFINICAO"]);
    const formulaIndex = resolveColumnIndexByAliases(rulesSheet.columns, ["FORMULA/REGRA"]);
    const observacoesIndex = resolveColumnIndexByAliases(rulesSheet.columns, ["OBSERVACOES"]);

    for (const row of rulesSheet.rows.slice(0, 30)) {
      const criterio = toText(row[criterioIndex]);
      if (!criterio || normalizeHeader(criterio) === "criterio") continue;
      regrasClassificacao.push({
        criterio,
        definicao: toText(row[definicaoIndex]),
        formula: toText(row[formulaIndex]),
        observacoes: toText(row[observacoesIndex]),
      });
    }
  }

  const totalClientesUnicos = Math.round(sumOrZero(skuRows.map(item => item.totalClientesUnicos)));
  const mediaClientesAtivos12m = roundOrNull(
    safeMean(
      skuRows
        .map(item => item.clientesAtivos12m)
        .filter((value): value is number => value !== null)
    ),
    2
  );
  const mediaClientesEmRisco = roundOrNull(
    safeMean(
      skuRows
        .map(item => item.clientesEmRisco)
        .filter((value): value is number => value !== null)
    ),
    2
  );
  const tempoMedioEntreComprasMeses = roundOrNull(
    safeMean(
      skuRows
        .map(item => item.tempoMedioEntreComprasMeses)
        .filter((value): value is number => value !== null)
    ),
    2
  );

  const topSkuRisco = [...skuRows]
    .sort((a, b) => (b.clientesEmRisco ?? -Infinity) - (a.clientesEmRisco ?? -Infinity))
    .slice(0, 15)
    .map(item => ({
      ...item,
      totalClientesUnicos: roundOrNull(item.totalClientesUnicos, 2),
      clientesAtivos12m: roundOrNull(item.clientesAtivos12m, 2),
      clientesEmRisco: roundOrNull(item.clientesEmRisco, 2),
      tempoMedioEntreComprasMeses: roundOrNull(item.tempoMedioEntreComprasMeses, 2),
    }));

  const topClientesFinal = [...topClientes]
    .sort((a, b) => (b.totalUnidades ?? -Infinity) - (a.totalUnidades ?? -Infinity))
    .slice(0, 20)
    .map(item => ({
      ...item,
      totalUnidades: roundOrNull(item.totalUnidades, 2),
      mesesComCompras: roundOrNull(item.mesesComCompras, 2),
    }));

  const marcasMap = new Map<string, { skuCount: number; totalClientesUnicos: number }>();
  for (const sku of skuRows) {
    const marca = extractBrandFromCodigo(sku.codigo);
    const current = marcasMap.get(marca) ?? { skuCount: 0, totalClientesUnicos: 0 };
    current.skuCount += 1;
    current.totalClientesUnicos += sku.totalClientesUnicos ?? 0;
    marcasMap.set(marca, current);
  }
  const concentracaoMarcas = Array.from(marcasMap.entries())
    .map(([marca, value]) => ({
      marca,
      skuCount: value.skuCount,
      totalClientesUnicos: Math.round(value.totalClientesUnicos),
    }))
    .sort((a, b) => b.totalClientesUnicos - a.totalClientesUnicos)
    .slice(0, 12);

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      skuCount: skuRows.length,
      totalClientesUnicos,
      mediaClientesAtivos12m,
      mediaClientesEmRisco,
      tempoMedioEntreComprasMeses,
    },
    comportamentoDistribution: countByLabel(comportamentoValues).slice(0, 12),
    fidelidadeDistribution: countByLabel(fidelidadeValues).slice(0, 12),
    concentracaoMarcas,
    topSkuRisco,
    topClientes: topClientesFinal,
    regrasClassificacao,
  };
}

function classifyDirection(variacaoPct: number | null): "SUBIU" | "CAIU" | "ESTAVEL" {
  if (variacaoPct === null) return "ESTAVEL";
  if (variacaoPct >= 0.03) return "SUBIU";
  if (variacaoPct <= -0.03) return "CAIU";
  return "ESTAVEL";
}

function normalizeBiasLabel(value: string) {
  return normalizeHeader(value).replace(/_/g, " ");
}

function extractScenarioRows(cenariosRows: Record<string, unknown>[]) {
  const codigoCenarioKey = resolveColumnName(cenariosRows, ["Codigo", "SKU", "Codigo SKU"]);
  const tipoProdutoKey = resolveColumnName(cenariosRows, ["Tipo Produto", "TIPO_PRODUTO"]);
  const melhorOpcaoKey = resolveColumnName(cenariosRows, ["Melhor Opcao", "Melhor Opcao"]);
  const valorMelhorOpcaoKey = resolveColumnName(cenariosRows, [
    "Valor Melhor Opcao",
    "Valor Melhor Opcao",
  ]);
  const variacaoMelhorOpcaoKey = resolveColumnName(cenariosRows, [
    "Variacao % Melhor Opcao",
    "Variacao Melhor Opcao",
  ]);

  return cenariosRows
    .map<PrevisaoScenarioSnapshotItem>(row => ({
      codigo: toText(codigoCenarioKey ? row[codigoCenarioKey] : null),
      tipoProduto: toText(tipoProdutoKey ? row[tipoProdutoKey] : null),
      melhorOpcao: toText(melhorOpcaoKey ? row[melhorOpcaoKey] : null),
      variacaoPct: toNumber(variacaoMelhorOpcaoKey ? row[variacaoMelhorOpcaoKey] : null),
      valorMelhorOpcao: toNumber(valorMelhorOpcaoKey ? row[valorMelhorOpcaoKey] : null),
    }))
    .filter(item => item.codigo);
}

function summarizeScenarioRows(items: PrevisaoScenarioSnapshotItem[]): PrevisaoScenarioSnapshotSummary {
  const opportunities = items.filter(item => (item.variacaoPct ?? 0) > 0).length;
  const risks = items.filter(item => (item.variacaoPct ?? 0) < 0).length;
  const neutros = Math.max(0, items.length - opportunities - risks);
  const variacoes = items
    .map(item => item.variacaoPct)
    .filter((value): value is number => value !== null);
  const valoresPositivos = items
    .filter(item => (item.variacaoPct ?? 0) > 0)
    .map(item => item.valorMelhorOpcao)
    .filter((value): value is number => value !== null);
  const valoresRiscos = items
    .filter(item => (item.variacaoPct ?? 0) < 0)
    .map(item => item.valorMelhorOpcao)
    .filter((value): value is number => value !== null);

  const sum = (values: number[]) => (values.length ? values.reduce((acc, value) => acc + value, 0) : null);

  return {
    skuCount: items.length,
    oportunidades: opportunities,
    riscos: risks,
    neutros,
    variacaoMediaPct: roundOrNull(safeMean(variacoes), 4),
    valorOportunidades: roundOrNull(sum(valoresPositivos), 2),
    valorRiscos: roundOrNull(sum(valoresRiscos), 2),
  };
}

function buildExplainabilityFromWorkbook(outputPath: string) {
  const wb = XLSX.readFile(outputPath, { cellDates: true });
  const geralRows = getSheetRows(wb, "Geral");
  const acuracidadeRows = getSheetRows(wb, "Acuracidade");
  const scenarioRows = extractScenarioRows(getSheetRows(wb, "Analise_Cenarios"));

  const geralCodigoKey = resolveColumnName(geralRows, ["Codigo", "SKU", "Codigo SKU", "Cod Item"]);
  const status12mKey = resolveColumnName(geralRows, ["STATUS_12M", "STATUS 12M"]);
  const statusAtividadeKey = resolveColumnName(geralRows, ["STATUS_ATIVIDADE", "STATUS ATIVIDADE"]);
  const totalAnteriorKey = resolveColumnName(geralRows, ["TOTAL_3M_ANTERIOR", "TOTAL 3M ANTERIOR"]);
  const totalAtualKey = resolveColumnName(geralRows, ["TOTAL_3M_ATUAL", "TOTAL 3M ATUAL"]);
  const variacao3mKey = resolveColumnName(geralRows, ["VAR_3M_PCT", "VAR 3M PCT"]);

  const acurCodigoKey = resolveColumnName(acuracidadeRows, ["Codigo", "SKU", "Codigo SKU"]);
  const mapeTotalKey = resolveColumnName(acuracidadeRows, ["MAPE_TOTAL", "MAPE TOTAL"]);
  const biasKey = resolveColumnName(acuracidadeRows, ["BIAS"]);
  const sugestaoAjusteKey = resolveColumnName(acuracidadeRows, [
    "SUGESTAO_AJUSTE_PCT",
    "% SUGESTAO AJUSTE",
  ]);

  const geralBySku = new Map<
    string,
    {
      status12m: string;
      statusAtividade: string;
      variacaoPct: number | null;
      totalAnterior: number | null;
      totalAtual: number | null;
    }
  >();

  for (const row of geralRows) {
    const codigo = toText(geralCodigoKey ? row[geralCodigoKey] : null);
    if (!codigo) continue;
    const totalAnterior = toNumber(totalAnteriorKey ? row[totalAnteriorKey] : null);
    const totalAtual = toNumber(totalAtualKey ? row[totalAtualKey] : null);
    const variacaoDaLinha = toNumber(variacao3mKey ? row[variacao3mKey] : null);
    let variacaoPct = variacaoDaLinha;
    if (variacaoPct === null && totalAnterior !== null && totalAtual !== null && totalAnterior !== 0) {
      variacaoPct = (totalAtual - totalAnterior) / totalAnterior;
    }
    geralBySku.set(codigo, {
      status12m: toText(status12mKey ? row[status12mKey] : null),
      statusAtividade: toText(statusAtividadeKey ? row[statusAtividadeKey] : null),
      variacaoPct,
      totalAnterior,
      totalAtual,
    });
  }

  const acurBySku = new Map<
    string,
    { mapeTotal: number | null; bias: string; sugestaoAjustePct: number | null }
  >();
  for (const row of acuracidadeRows) {
    const codigo = toText(acurCodigoKey ? row[acurCodigoKey] : null);
    if (!codigo) continue;
    acurBySku.set(codigo, {
      mapeTotal: toNumber(mapeTotalKey ? row[mapeTotalKey] : null),
      bias: toText(biasKey ? row[biasKey] : null),
      sugestaoAjustePct: toNumber(sugestaoAjusteKey ? row[sugestaoAjusteKey] : null),
    });
  }

  const scenarioBySku = new Map<string, PrevisaoScenarioSnapshotItem>();
  for (const row of scenarioRows) {
    if (!scenarioBySku.has(row.codigo)) {
      scenarioBySku.set(row.codigo, row);
    }
  }

  const allSkus = new Set<string>([
    ...Array.from(geralBySku.keys()),
    ...Array.from(acurBySku.keys()),
    ...Array.from(scenarioBySku.keys()),
  ]);

  const items = Array.from(allSkus).map<PrevisaoExplainabilityItem>(codigo => {
    const geral = geralBySku.get(codigo);
    const acur = acurBySku.get(codigo);
    const scenario = scenarioBySku.get(codigo);

    const variacaoPct = geral?.variacaoPct ?? scenario?.variacaoPct ?? null;
    const direction = classifyDirection(variacaoPct);
    const fatores: PrevisaoExplainabilityFactor[] = [];
    const melhorias: string[] = [];

    if (variacaoPct !== null) {
      if (variacaoPct >= 0.08) {
        fatores.push({
          titulo: "Tendencia recente de alta",
          impacto: "POSITIVO",
          evidencia: `Variacao 3M em ${formatPercentText(variacaoPct)}.`,
          detalhe: "A curva recente sugere ganho de tracao na demanda.",
        });
      } else if (variacaoPct <= -0.08) {
        fatores.push({
          titulo: "Queda recente de volume",
          impacto: "NEGATIVO",
          evidencia: `Variacao 3M em ${formatPercentText(variacaoPct)}.`,
          detalhe: "A serie recente indica desaceleracao acima do esperado.",
        });
        melhorias.push("Revisar premissas de demanda de curto prazo e ajustar mix de canal.");
      } else {
        fatores.push({
          titulo: "Oscilacao controlada",
          impacto: "NEUTRO",
          evidencia: `Variacao 3M em ${formatPercentText(variacaoPct)}.`,
          detalhe: "Movimento dentro de faixa aceitavel para operacao.",
        });
      }
    }

    const status12m = geral?.status12m || "";
    const status12mNorm = normalizeHeader(status12m);
    if (status12mNorm.includes("cres")) {
      fatores.push({
        titulo: "Sinal de crescimento estrutural",
        impacto: "POSITIVO",
        evidencia: `Status 12M = ${status12m}.`,
        detalhe: "Historico anual reforca potencial de expansao.",
      });
    } else if (status12mNorm.includes("queda") || status12mNorm.includes("declin")) {
      fatores.push({
        titulo: "Historico anual em retracao",
        impacto: "NEGATIVO",
        evidencia: `Status 12M = ${status12m}.`,
        detalhe: "Serie anual aponta perda de ritmo ao longo do ciclo.",
      });
      melhorias.push("Acionar plano comercial para recuperar demanda em SKUs em retracao.");
    }

    const mapeTotal = acur?.mapeTotal ?? null;
    if (mapeTotal !== null && mapeTotal >= 0.25) {
      fatores.push({
        titulo: "Erro de previsao elevado",
        impacto: "NEGATIVO",
        evidencia: `MAPE total em ${formatPercentText(mapeTotal)}.`,
        detalhe: "Nivel de erro indica baixo alinhamento entre modelo e demanda real.",
      });
      melhorias.push("Recalibrar modelo para o SKU e revisar outliers historicos.");
    } else if (mapeTotal !== null && mapeTotal <= 0.12) {
      fatores.push({
        titulo: "Boa aderencia historica",
        impacto: "POSITIVO",
        evidencia: `MAPE total em ${formatPercentText(mapeTotal)}.`,
        detalhe: "Modelo demonstra boa estabilidade para esse SKU.",
      });
    }

    const bias = acur?.bias || "";
    const biasNorm = normalizeHeader(bias);
    if (biasNorm.includes("super")) {
      fatores.push({
        titulo: "Vies de superestimacao",
        impacto: "NEGATIVO",
        evidencia: `Bias atual: ${bias}.`,
        detalhe: "A previsao tende a ficar acima da realizacao.",
      });
      melhorias.push("Aplicar ajuste de vies para reduzir excesso de previsao.");
    } else if (biasNorm.includes("sub")) {
      fatores.push({
        titulo: "Vies de subestimacao",
        impacto: "NEGATIVO",
        evidencia: `Bias atual: ${bias}.`,
        detalhe: "A previsao tende a ficar abaixo da realizacao.",
      });
      melhorias.push("Aumentar baseline em itens com ruptura recorrente.");
    }

    if (scenario && scenario.variacaoPct !== null) {
      if (scenario.variacaoPct > 0.05) {
        fatores.push({
          titulo: "Cenario com potencial de ganho",
          impacto: "POSITIVO",
          evidencia: `Melhor opcao ${scenario.melhorOpcao || "--"} com ${formatPercentText(scenario.variacaoPct)}.`,
          detalhe: "Comparativo de cenarios aponta espaco para aumento de resultado.",
        });
      } else if (scenario.variacaoPct < -0.05) {
        fatores.push({
          titulo: "Cenario aponta risco de perda",
          impacto: "NEGATIVO",
          evidencia: `Melhor opcao ${scenario.melhorOpcao || "--"} com ${formatPercentText(scenario.variacaoPct)}.`,
          detalhe: "Comparativo sugere deterioracao se nao houver acao de mitigacao.",
        });
        melhorias.push("Priorizar revisao do SKU no ciclo para reduzir risco projetado.");
      }
    }

    if (melhorias.length === 0) {
      melhorias.push("Manter monitoramento semanal e validar mudancas de padrao de venda.");
    }

    const fatorResumo = fatores.slice(0, 2).map(f => f.evidencia).join(" ");
    const explicacaoBase =
      direction === "SUBIU"
        ? "O SKU subiu puxado por sinais positivos recentes."
        : direction === "CAIU"
          ? "O SKU caiu por combinacao de risco operacional e historico recente."
          : "O SKU esta estavel, com variacoes dentro da faixa de controle.";

    return {
      codigo,
      direcao: direction,
      variacaoPct: roundOrNull(variacaoPct),
      mapeTotal: roundOrNull(mapeTotal),
      bias: normalizeBiasLabel(bias || "SEM BIAS"),
      status12m: status12m || "SEM STATUS",
      statusAtividade: geral?.statusAtividade || "SEM STATUS",
      melhorOpcao: scenario?.melhorOpcao || "--",
      fatores: fatores.slice(0, 4),
      explicacao: fatorResumo ? `${explicacaoBase} ${fatorResumo}` : explicacaoBase,
      melhorias: Array.from(new Set(melhorias)).slice(0, 3),
    };
  });

  const variacoesRelevantes = items.filter(item => {
    const variacaoAbs = Math.abs(item.variacaoPct ?? 0);
    return variacaoAbs >= 0.05;
  }).length;

  const mapeCritico = items.filter(item => (item.mapeTotal ?? 0) >= 0.25).length;
  const viesCritico = items.filter(item =>
    ["superestimacao", "subestimacao"].some(token => normalizeHeader(item.bias).includes(token))
  ).length;

  const recomendacoesGerais: string[] = [];
  if (mapeCritico > 0) {
    recomendacoesGerais.push(
      `${mapeCritico} SKU(s) com erro alto: priorizar recalibracao de modelo e tratamento de outliers.`
    );
  }
  if (viesCritico > 0) {
    recomendacoesGerais.push(
      `${viesCritico} SKU(s) com vies consistente: aplicar ajuste de vies antes do consenso.`
    );
  }
  if (variacoesRelevantes > 0) {
    recomendacoesGerais.push(
      `${variacoesRelevantes} SKU(s) com variacao 3M relevante: revisar premissas comerciais e estoque de seguranca.`
    );
  }
  if (recomendacoesGerais.length === 0) {
    recomendacoesGerais.push("Cenario estavel: manter rito de monitoramento e validacao de premissas.");
  }

  const sortedItems = [...items].sort((a, b) => {
    const variacaoA = Math.abs(a.variacaoPct ?? 0);
    const variacaoB = Math.abs(b.variacaoPct ?? 0);
    if (variacaoB !== variacaoA) return variacaoB - variacaoA;
    return (b.mapeTotal ?? -Infinity) - (a.mapeTotal ?? -Infinity);
  });

  return {
    generatedAt: new Date().toISOString(),
    totalSku: sortedItems.length,
    skuComVariacaoRelevante: variacoesRelevantes,
    itens: sortedItems,
    recomendacoesGerais,
  } satisfies PrevisaoJobExplainability;
}

function parseScenarioSnapshotSummary(value: string): PrevisaoScenarioSnapshotSummary {
  try {
    const parsed = JSON.parse(value) as Partial<PrevisaoScenarioSnapshotSummary>;
    return {
      skuCount: Number(parsed.skuCount ?? 0),
      oportunidades: Number(parsed.oportunidades ?? 0),
      riscos: Number(parsed.riscos ?? 0),
      neutros: Number(parsed.neutros ?? 0),
      variacaoMediaPct:
        typeof parsed.variacaoMediaPct === "number" ? parsed.variacaoMediaPct : null,
      valorOportunidades:
        typeof parsed.valorOportunidades === "number" ? parsed.valorOportunidades : null,
      valorRiscos: typeof parsed.valorRiscos === "number" ? parsed.valorRiscos : null,
    };
  } catch {
    return {
      skuCount: 0,
      oportunidades: 0,
      riscos: 0,
      neutros: 0,
      variacaoMediaPct: null,
      valorOportunidades: null,
      valorRiscos: null,
    };
  }
}

function parseScenarioSnapshotItems(value: string): PrevisaoScenarioSnapshotItem[] {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(item => ({
        codigo: toText(item?.codigo),
        tipoProduto: toText(item?.tipoProduto),
        melhorOpcao: toText(item?.melhorOpcao),
        variacaoPct:
          typeof item?.variacaoPct === "number" && Number.isFinite(item.variacaoPct)
            ? item.variacaoPct
            : null,
        valorMelhorOpcao:
          typeof item?.valorMelhorOpcao === "number" && Number.isFinite(item.valorMelhorOpcao)
            ? item.valorMelhorOpcao
            : null,
      }))
      .filter(item => item.codigo);
  } catch {
    return [];
  }
}

type ScenarioSnapshotRow = {
  id: number;
  jobId: number;
  cicloRef: string;
  horizonteRef: string | null;
  titulo: string | null;
  observacoes: string | null;
  summaryJson: string;
  dataJson: string;
  createdBy: string | null;
  createdAt: Date | string;
};

function mapScenarioSnapshotRow(row: ScenarioSnapshotRow): PrevisaoScenarioSnapshotView {
  return {
    id: row.id,
    jobId: row.jobId,
    cicloRef: row.cicloRef,
    horizonteRef: row.horizonteRef ?? null,
    titulo: row.titulo ?? null,
    observacoes: row.observacoes ?? null,
    createdBy: row.createdBy ?? null,
    createdAt: new Date(row.createdAt).toISOString(),
    summary: parseScenarioSnapshotSummary(row.summaryJson),
    items: parseScenarioSnapshotItems(row.dataJson),
  };
}

function mapScenarioSnapshotListItem(row: ScenarioSnapshotRow): PrevisaoScenarioSnapshotListItem {
  const { items, ...meta } = mapScenarioSnapshotRow(row);
  return meta;
}

function compareScenarioSnapshotViews(
  base: PrevisaoScenarioSnapshotView,
  target: PrevisaoScenarioSnapshotView
): PrevisaoScenarioComparison {
  const baseBySku = new Map(base.items.map(item => [item.codigo, item]));
  const targetBySku = new Map(target.items.map(item => [item.codigo, item]));
  const skuIntersection = Array.from(baseBySku.keys()).filter(codigo => targetBySku.has(codigo));

  const diffItems: PrevisaoScenarioComparisonItem[] = [];
  const deltas: number[] = [];

  for (const codigo of skuIntersection) {
    const baseItem = baseBySku.get(codigo);
    const targetItem = targetBySku.get(codigo);
    if (!baseItem || !targetItem) continue;

    const variacaoBasePct = baseItem.variacaoPct;
    const variacaoTargetPct = targetItem.variacaoPct;
    const deltaVariacaoPct =
      variacaoBasePct !== null && variacaoTargetPct !== null
        ? variacaoTargetPct - variacaoBasePct
        : null;
    if (deltaVariacaoPct !== null) deltas.push(deltaVariacaoPct);

    const melhorOpcaoBase = baseItem.melhorOpcao || "--";
    const melhorOpcaoTarget = targetItem.melhorOpcao || "--";
    const mudouOpcao =
      normalizeHeader(melhorOpcaoBase) !== normalizeHeader(melhorOpcaoTarget);
    const mudouVariacao = Math.abs(deltaVariacaoPct ?? 0) >= 0.03;

    if (mudouOpcao || mudouVariacao) {
      diffItems.push({
        codigo,
        variacaoBasePct: roundOrNull(variacaoBasePct),
        variacaoTargetPct: roundOrNull(variacaoTargetPct),
        deltaVariacaoPct: roundOrNull(deltaVariacaoPct),
        melhorOpcaoBase,
        melhorOpcaoTarget,
        mudouOpcao,
      });
    }
  }

  diffItems.sort((a, b) => {
    if (a.mudouOpcao !== b.mudouOpcao) return a.mudouOpcao ? -1 : 1;
    return Math.abs(b.deltaVariacaoPct ?? 0) - Math.abs(a.deltaVariacaoPct ?? 0);
  });

  return {
    baseSnapshotId: base.id,
    targetSnapshotId: target.id,
    skuComparados: skuIntersection.length,
    skuMudouOpcao: diffItems.filter(item => item.mudouOpcao).length,
    deltaVariacaoMediaPct: roundOrNull(safeMean(deltas)),
    principaisMudancas: diffItems.slice(0, 25),
  };
}

async function buildAnalyticsFromWorkbook(outputPath: string) {
  const wb = XLSX.readFile(outputPath, { cellDates: true });

  const acuracidadeRows = getSheetRows(wb, "Acuracidade");
  const backtestRows = getSheetRows(wb, "Backtest_Sku");
  const cenariosRows = getSheetRows(wb, "Analise_Cenarios");
  const detalhadoRows = getSheetRows(wb, "Detalhado");
  const geralRows = getSheetRows(wb, "Geral");

  const codigoAcuracidadeKey = resolveColumnName(acuracidadeRows, ["Codigo", "Codigo SKU"]);
  const mapeTotalKey = resolveColumnName(acuracidadeRows, ["MAPE_TOTAL", "MAPE TOTAL"]);
  const classErroTotalKey = resolveColumnName(acuracidadeRows, [
    "CLASSIFICACAO_ERRO_TOTAL",
    "CLASSIFICACAO ERRO TOTAL",
  ]);
  const biasKey = resolveColumnName(acuracidadeRows, ["BIAS"]);
  const sugestaoAjusteKey = resolveColumnName(acuracidadeRows, [
    "SUGESTAO_AJUSTE_PCT",
    "% SUGESTAO AJUSTE",
  ]);

  const acuracidadeMapped = acuracidadeRows
    .map<AnalyticsSkuMape>(row => ({
      codigo: toText(codigoAcuracidadeKey ? row[codigoAcuracidadeKey] : null),
      mapeTotal: toNumber(mapeTotalKey ? row[mapeTotalKey] : null),
      classificacao: toText(classErroTotalKey ? row[classErroTotalKey] : null),
      bias: toText(biasKey ? row[biasKey] : null),
      sugestaoAjustePct: toNumber(sugestaoAjusteKey ? row[sugestaoAjusteKey] : null),
    }))
    .filter(row => row.codigo);

  const mapeValues = acuracidadeMapped
    .map(row => row.mapeTotal)
    .filter((value): value is number => value !== null);
  const ajusteValues = acuracidadeMapped
    .map(row => row.sugestaoAjustePct)
    .filter((value): value is number => value !== null);

  const acuracidadeDistribution = countByLabel(acuracidadeMapped.map(row => row.classificacao));
  const biasDistribution = countByLabel(acuracidadeMapped.map(row => row.bias));

  const topErros = [...acuracidadeMapped]
    .sort((a, b) => (b.mapeTotal ?? -Infinity) - (a.mapeTotal ?? -Infinity))
    .slice(0, 10);

  const topAcertos = [...acuracidadeMapped]
    .filter(item => item.mapeTotal !== null)
    .sort((a, b) => (a.mapeTotal ?? Infinity) - (b.mapeTotal ?? Infinity))
    .slice(0, 10);

  const modeloKey = resolveColumnName(backtestRows, ["MELHOR_MODELO", "MELHOR MODELO"]);
  const melhorMapeKey = resolveColumnName(backtestRows, ["MELHOR_MAPE", "MELHOR MAPE"]);

  const modelTemp = new Map<string, { count: number; sum: number; countMape: number }>();
  for (const row of backtestRows) {
    const modelo = toText(modeloKey ? row[modeloKey] : null) || "SEM MODELO";
    const mape = toNumber(melhorMapeKey ? row[melhorMapeKey] : null);
    const current = modelTemp.get(modelo) ?? { count: 0, sum: 0, countMape: 0 };
    current.count += 1;
    if (mape !== null) {
      current.sum += mape;
      current.countMape += 1;
    }
    modelTemp.set(modelo, current);
  }

  const modelRanking = Array.from(modelTemp.entries())
    .map<AnalyticsModel>(([modelo, item]) => ({
      modelo,
      skuCount: item.count,
      avgMape: item.countMape > 0 ? item.sum / item.countMape : null,
    }))
    .sort((a, b) => b.skuCount - a.skuCount);

  const scenarios = extractScenarioRows(cenariosRows).map<AnalyticsScenario>(item => ({
    codigo: item.codigo,
    tipoProduto: item.tipoProduto,
    melhorOpcao: item.melhorOpcao,
    variacaoPct: item.variacaoPct,
    valorMelhorOpcao: item.valorMelhorOpcao,
  }));

  const topOportunidades = [...scenarios]
    .filter(item => item.variacaoPct !== null && item.variacaoPct > 0)
    .sort((a, b) => (b.variacaoPct ?? -Infinity) - (a.variacaoPct ?? -Infinity))
    .slice(0, 10);

  const topRiscos = [...scenarios]
    .filter(item => item.variacaoPct !== null && item.variacaoPct < 0)
    .sort((a, b) => (a.variacaoPct ?? Infinity) - (b.variacaoPct ?? Infinity))
    .slice(0, 10);

  const status12mKey = resolveColumnName(geralRows, ["STATUS_12M", "STATUS 12M"]);
  const statusAtividadeKey = resolveColumnName(geralRows, [
    "STATUS_ATIVIDADE",
    "STATUS ATIVIDADE",
  ]);

  const status12mDistribution = countByLabel(
    geralRows.map(row => toText(status12mKey ? row[status12mKey] : null))
  );
  const statusAtividadeDistribution = countByLabel(
    geralRows.map(row => toText(statusAtividadeKey ? row[statusAtividadeKey] : null))
  );

  const monthlySeries = extractMonthlySeries(detalhadoRows);
  const avgMapeTotal = safeMean(mapeValues);
  const medianMapeTotal = safeMedian(mapeValues);

  return {
    generatedAt: new Date().toISOString(),
    sheetNames: wb.SheetNames,
    summary: {
      skuCount: acuracidadeMapped.length || detalhadoRows.length,
      avgMapeTotal: roundOrNull(avgMapeTotal),
      medianMapeTotal: roundOrNull(medianMapeTotal),
      acuracidadeMedia: avgMapeTotal === null ? null : roundOrNull(Math.max(0, 1 - avgMapeTotal)),
      avgSugestaoAjustePct: roundOrNull(safeMean(ajusteValues)),
      modelCount: modelRanking.length,
    },
    monthlySeries,
    acuracidadeDistribution,
    biasDistribution,
    status12mDistribution,
    statusAtividadeDistribution,
    modelRanking: modelRanking.map(item => ({
      ...item,
      avgMape: roundOrNull(item.avgMape),
    })),
    topErros: topErros.map(item => ({
      ...item,
      mapeTotal: roundOrNull(item.mapeTotal),
      sugestaoAjustePct: roundOrNull(item.sugestaoAjustePct),
    })),
    topAcertos: topAcertos.map(item => ({
      ...item,
      mapeTotal: roundOrNull(item.mapeTotal),
      sugestaoAjustePct: roundOrNull(item.sugestaoAjustePct),
    })),
    topOportunidades: topOportunidades.map(item => ({
      ...item,
      variacaoPct: roundOrNull(item.variacaoPct),
      valorMelhorOpcao: roundOrNull(item.valorMelhorOpcao, 2),
    })),
    topRiscos: topRiscos.map(item => ({
      ...item,
      variacaoPct: roundOrNull(item.variacaoPct),
      valorMelhorOpcao: roundOrNull(item.valorMelhorOpcao, 2),
    })),
  } satisfies PrevisaoJobAnalytics;
}

export async function getPrevisaoJobWorkbookMeta(jobId: number) {
  const cacheEntry = await getWorkbookViewCacheEntry(jobId);
  // Aquece abas em background para o clique abrir na hora.
  warmWorkbookSheetsInBackground(cacheEntry);
  return cacheEntry.sheetNames;
}

export async function getPrevisaoJobAnalytics(jobId: number, monthsLimit = 24) {
  const outputPath = await getVisualizableOutputPathFromJob(jobId);
  const stat = await fs.stat(outputPath);
  const cached = analyticsCache.get(jobId);

  const shouldReuse =
    cached &&
    cached.outputPath === outputPath &&
    cached.mtimeMs === stat.mtimeMs;

  const fullData = shouldReuse
    ? cached.data
    : await buildAnalyticsFromWorkbook(outputPath);

  if (!shouldReuse) {
    analyticsCache.set(jobId, {
      outputPath,
      mtimeMs: stat.mtimeMs,
      data: fullData,
    });
  }

  const maxMonths = Math.max(1, monthsLimit);
  const monthlySeries = fullData.monthlySeries.slice(-maxMonths);

  return {
    ...fullData,
    monthlySeries,
  } satisfies PrevisaoJobAnalytics;
}

export async function getPrevisaoJobExecutiveAnalytics(jobId: number) {
  const cacheEntry = await getWorkbookViewCacheEntry(jobId);
  return await buildExecutiveAnalyticsFromCache(cacheEntry);
}

export async function getPrevisaoJobCustomerAnalytics(jobId: number) {
  const cacheEntry = await getWorkbookViewCacheEntry(jobId);
  return await buildCustomerAnalyticsFromCache(cacheEntry);
}

export async function getPrevisaoJobCustomerDetailData(
  jobId: number,
  options?: {
    page?: number;
    pageSize?: number;
    search?: string;
    sortBy?: string;
    sortDir?: "asc" | "desc";
    sku?: string;
    codCliente?: string;
    comportamento?: string;
    fidelidade?: string;
  }
) {
  const normalizedFilters: SheetFilterInput[] = [];

  if (options?.sku?.trim()) {
    normalizedFilters.push({ column: "Codigo", value: options.sku.trim() });
  }
  if (options?.codCliente?.trim()) {
    normalizedFilters.push({ column: "Cod_Cliente", value: options.codCliente.trim() });
  }
  if (options?.comportamento?.trim()) {
    normalizedFilters.push({ column: "COMPORTAMENTO", value: options.comportamento.trim() });
  }
  if (options?.fidelidade?.trim()) {
    normalizedFilters.push({ column: "FIDELIDADE", value: options.fidelidade.trim() });
  }

  return getPrevisaoJobSheetData(jobId, "Cliente_detalhado", {
    page: options?.page ?? 1,
    pageSize: options?.pageSize ?? 100,
    search: options?.search ?? "",
    sortBy: options?.sortBy ?? "",
    sortDir: options?.sortDir ?? "asc",
    filters: normalizedFilters,
  });
}

export async function getPrevisaoJobExplainability(jobId: number, limit = 20) {
  const outputPath = await getVisualizableOutputPathFromJob(jobId);
  const stat = await fs.stat(outputPath);
  const cached = explainabilityCache.get(jobId);

  const shouldReuse =
    cached &&
    cached.outputPath === outputPath &&
    cached.mtimeMs === stat.mtimeMs;

  const fullData = shouldReuse
    ? cached.data
    : buildExplainabilityFromWorkbook(outputPath);

  if (!shouldReuse) {
    explainabilityCache.set(jobId, {
      outputPath,
      mtimeMs: stat.mtimeMs,
      data: fullData,
    });
  }

  const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
  return {
    ...fullData,
    itens: fullData.itens.slice(0, safeLimit),
  } satisfies PrevisaoJobExplainability;
}

export async function listPrevisaoJobScenarioSnapshots(jobId: number) {
  const rows = await db.listPrevisaoPythonScenarioSnapshots(jobId, 80);
  return rows.map(row => mapScenarioSnapshotListItem(row as ScenarioSnapshotRow));
}

export async function createPrevisaoJobScenarioSnapshot(
  jobId: number,
  input: {
    cicloRef: string;
    horizonteRef?: string | null;
    titulo?: string | null;
    observacoes?: string | null;
    createdBy?: string | null;
  }
) {
  const cicloRef = (input.cicloRef || "").trim();
  if (!cicloRef) {
    throw new Error("Informe o ciclo para salvar o snapshot.");
  }

  const outputPath = await getVisualizableOutputPathFromJob(jobId);
  const wb = XLSX.readFile(outputPath, { cellDates: true });
  const items = extractScenarioRows(getSheetRows(wb, "Analise_Cenarios"));
  if (items.length === 0) {
    throw new Error("Nao foi possivel extrair dados da aba de cenarios para snapshot.");
  }

  const summary = summarizeScenarioRows(items);
  const created = await db.createPrevisaoPythonScenarioSnapshot({
    jobId,
    cicloRef,
    horizonteRef: input.horizonteRef?.trim() || null,
    titulo: input.titulo?.trim() || null,
    observacoes: input.observacoes?.trim() || null,
    summaryJson: JSON.stringify(summary),
    dataJson: JSON.stringify(items),
    createdBy: input.createdBy ?? null,
  });

  const saved = await db.getPrevisaoPythonScenarioSnapshotById(created.id);
  if (!saved) {
    throw new Error("Snapshot salvo, mas nao foi possivel recarregar os dados.");
  }

  return mapScenarioSnapshotRow(saved as ScenarioSnapshotRow);
}

export async function comparePrevisaoJobScenarioSnapshots(
  jobId: number,
  baseSnapshotId: number,
  targetSnapshotId: number
) {
  const [baseRaw, targetRaw] = await Promise.all([
    db.getPrevisaoPythonScenarioSnapshotById(baseSnapshotId),
    db.getPrevisaoPythonScenarioSnapshotById(targetSnapshotId),
  ]);

  if (!baseRaw || !targetRaw) {
    throw new Error("Snapshot informado nao encontrado.");
  }
  const base = mapScenarioSnapshotRow(baseRaw as ScenarioSnapshotRow);
  const target = mapScenarioSnapshotRow(targetRaw as ScenarioSnapshotRow);

  if (base.jobId !== jobId || target.jobId !== jobId) {
    throw new Error("Os snapshots precisam pertencer ao mesmo job.");
  }

  return compareScenarioSnapshotViews(base, target);
}

export async function getPrevisaoJobCycleSummary(
  jobId: number,
  snapshotId?: number | null
): Promise<PrevisaoCycleSummary> {
  const [analytics, explainability, snapshots] = await Promise.all([
    getPrevisaoJobAnalytics(jobId, 24),
    getPrevisaoJobExplainability(jobId, 200),
    listPrevisaoJobScenarioSnapshots(jobId),
  ]);

  const selectedSnapshot =
    snapshotId && Number.isFinite(snapshotId)
      ? snapshots.find(item => item.id === snapshotId) || null
      : snapshots[0] || null;

  let comparativoSnapshots: PrevisaoScenarioComparison | null = null;
  if (snapshots.length >= 2) {
    const target = selectedSnapshot ?? snapshots[0];
    const targetIndex = snapshots.findIndex(item => item.id === target.id);
    const base = snapshots[targetIndex + 1] ?? snapshots[1] ?? null;
    if (base) {
      comparativoSnapshots = await comparePrevisaoJobScenarioSnapshots(jobId, base.id, target.id);
    }
  }

  const mapeCriticoCount = explainability.itens.filter(item => (item.mapeTotal ?? 0) >= 0.25).length;
  const riscoTop = analytics.topRiscos.slice(0, 3);
  const oportunidadeTop = analytics.topOportunidades.slice(0, 3);

  const kpis: PrevisaoCycleSummary["kpis"] = [
    {
      label: "SKUs analisados",
      valor: String(analytics.summary.skuCount),
      destaque: "NEUTRO",
    },
    {
      label: "Acuracidade media",
      valor: formatPercentText(analytics.summary.acuracidadeMedia),
      destaque: (analytics.summary.acuracidadeMedia ?? 0) >= 0.8 ? "POSITIVO" : "ATENCAO",
    },
    {
      label: "MAPE medio",
      valor: formatPercentText(analytics.summary.avgMapeTotal),
      destaque: (analytics.summary.avgMapeTotal ?? 1) <= 0.2 ? "POSITIVO" : "ATENCAO",
    },
    {
      label: "Sugestao media de ajuste",
      valor: formatPercentText(analytics.summary.avgSugestaoAjustePct),
      destaque: "NEUTRO",
    },
  ];

  if (selectedSnapshot) {
    kpis.push({
      label: "Ciclo snapshot",
      valor: selectedSnapshot.cicloRef,
      destaque: "NEUTRO",
    });
    kpis.push({
      label: "Oportunidades x riscos",
      valor: `${selectedSnapshot.summary.oportunidades} / ${selectedSnapshot.summary.riscos}`,
      destaque:
        selectedSnapshot.summary.oportunidades >= selectedSnapshot.summary.riscos
          ? "POSITIVO"
          : "ATENCAO",
    });
  }

  const riscos: string[] = [];
  if (mapeCriticoCount > 0) {
    riscos.push(`${mapeCriticoCount} SKU(s) estao com erro de previsao critico (MAPE >= 25%).`);
  }
  riscoTop.forEach(item => {
    riscos.push(
      `SKU ${item.codigo}: risco de ${formatPercentText(item.variacaoPct)} no melhor cenario (${item.melhorOpcao || "--"}).`
    );
  });
  if (riscos.length === 0) {
    riscos.push("Nao ha riscos relevantes acima do limiar definido para o ciclo.");
  }

  const decisoesPendentes: string[] = [];
  if (comparativoSnapshots && comparativoSnapshots.skuMudouOpcao > 0) {
    decisoesPendentes.push(
      `${comparativoSnapshots.skuMudouOpcao} SKU(s) trocaram melhor opcao entre snapshots: validar aprovacao no consenso.`
    );
  }
  if (oportunidadeTop.length > 0) {
    decisoesPendentes.push(
      `Priorizar validacao comercial dos ${oportunidadeTop.length} principais SKU(s) com ganho potencial.`
    );
  }
  if (decisoesPendentes.length === 0) {
    decisoesPendentes.push("Sem decisoes pendentes criticas para este ciclo.");
  }

  const planoAcao: string[] = [
    "Revisar semanalmente os SKU com maior erro de previsao e formalizar plano corretivo.",
    "Executar reuniao curta de consenso para itens com troca de melhor cenario entre snapshots.",
    "Atualizar premissas comerciais dos SKU com variacao 3M relevante antes do fechamento do ciclo.",
    "Registrar decisoes e responsaveis na ata do ciclo para auditoria e rastreabilidade.",
  ];

  let recomendacaoExecutiva =
    "Ciclo controlado, com foco em reduzir vies e consolidar decisoes nos SKU de maior impacto.";
  if ((analytics.summary.acuracidadeMedia ?? 0) >= 0.85 && mapeCriticoCount < 5) {
    recomendacaoExecutiva =
      "Ciclo saudavel: manter governanca atual e acelerar captura das oportunidades de crescimento.";
  } else if ((analytics.summary.acuracidadeMedia ?? 0) < 0.75 || mapeCriticoCount >= 15) {
    recomendacaoExecutiva =
      "Ciclo em atencao: reforcar calibracao de modelos e priorizar mitigacao dos principais riscos.";
  }

  return {
    generatedAt: new Date().toISOString(),
    titulo: "Resumo do ciclo de previsao",
    contexto: selectedSnapshot
      ? `Snapshot ativo: ${selectedSnapshot.cicloRef}${selectedSnapshot.horizonteRef ? ` (${selectedSnapshot.horizonteRef})` : ""}.`
      : "Sem snapshot salvo para este job. O resumo usa os dados atuais do relatorio.",
    kpis,
    riscos,
    decisoesPendentes,
    planoAcao,
    recomendacaoExecutiva,
    snapshotAtual: selectedSnapshot,
    comparativoSnapshots,
  };
}

export async function getPrevisaoJobSheetPreview(
  jobId: number,
  sheetName: string,
  maxRows = 100
) {
  const cacheEntry = await getWorkbookViewCacheEntry(jobId);
  const sheet = await resolveSheetFromCache(cacheEntry, sheetName);
  const safeMaxRows = Math.max(1, maxRows);
  const dataRows = sheet.rows.slice(0, safeMaxRows);

  return {
    sheetName: sheet.sheetName,
    header: sheet.columns,
    rows: dataRows,
    totalRows: sheet.rows.length,
  };
}

export async function getPrevisaoJobSheetData(
  jobId: number,
  sheetName: string,
  options?: {
    page?: number;
    pageSize?: number;
    search?: string;
    sortBy?: string;
    sortDir?: "asc" | "desc";
    filters?: SheetFilterInput[];
  }
) {
  const cacheEntry = await getWorkbookViewCacheEntry(jobId);
  const sheet = await resolveSheetFromCache(cacheEntry, sheetName);
  const columns = sheet.columns;
  const pageSizeRaw = Number(options?.pageSize ?? 100);
  const safePageSize = Math.min(250, Math.max(1, Number.isFinite(pageSizeRaw) ? Math.floor(pageSizeRaw) : 100));
  const pageRaw = Number(options?.page ?? 1);
  const requestedPage = Math.max(1, Number.isFinite(pageRaw) ? Math.floor(pageRaw) : 1);
  const search = (options?.search ?? "").trim().toLowerCase();
  const sortBy = (options?.sortBy ?? "").trim();
  const sortDir = options?.sortDir === "desc" ? "desc" : "asc";

  const normalizedFilters = (options?.filters ?? [])
    .map(filter => ({
      column: (filter.column ?? "").trim(),
      value: (filter.value ?? "").trim().toLowerCase(),
    }))
    .filter(filter => filter.column && filter.value);

  const resolvedFilters = normalizedFilters
    .map(filter => ({
      columnIndex: resolveColumnIndex(columns, filter.column),
      value: filter.value,
    }))
    .filter(filter => filter.columnIndex >= 0);

  const sortColumnIndex = sortBy ? resolveColumnIndex(columns, sortBy) : -1;
  const hasSearch = search.length > 0;
  const hasFilters = resolvedFilters.length > 0;
  const hasSort = sortColumnIndex >= 0;
  const canonicalFilterKey = [...resolvedFilters]
    .sort((a, b) => (a.columnIndex - b.columnIndex) || a.value.localeCompare(b.value))
    .map(filter => `${filter.columnIndex}:${filter.value}`)
    .join("|");
  const cacheKey = [
    jobId,
    cacheEntry.mtimeMs,
    sheet.sheetName,
    requestedPage,
    safePageSize,
    search,
    sortColumnIndex,
    sortDir,
    canonicalFilterKey,
  ].join("::");
  cleanupSheetDataQueryCache();
  const cachedResult = getSheetDataQueryCacheEntry(cacheKey);
  if (cachedResult) return cachedResult;

  // Fast path for plain pagination only.
  if (!hasSearch && !hasFilters && !hasSort) {
    const totalRows = sheet.rows.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / safePageSize));
    const page = Math.min(requestedPage, totalPages);
    const start = (page - 1) * safePageSize;
    const rows = sheet.rows.slice(start, start + safePageSize);
    const result: SheetDataQueryResult = {
      sheetName: sheet.sheetName,
      columns,
      rows,
      totalRows,
      page,
      pageSize: safePageSize,
      totalPages,
    };
    setSheetDataQueryCacheEntry(cacheKey, result);
    return result;
  }

  let filteredRows = sheet.rows;

  if (hasSearch || hasFilters) {
    filteredRows = sheet.rows.filter(row => {
      if (hasSearch) {
        let matchesSearch = false;
        for (const cell of row) {
          if (cell.toLowerCase().includes(search)) {
            matchesSearch = true;
            break;
          }
        }
        if (!matchesSearch) return false;
      }

      if (hasFilters) {
        for (const filter of resolvedFilters) {
          const value = row[filter.columnIndex] ?? "";
          if (!value.toLowerCase().includes(filter.value)) {
            return false;
          }
        }
      }

      return true;
    });
  }

  if (hasSort) {
    const direction = sortDir === "desc" ? -1 : 1;
    filteredRows = [...filteredRows].sort((a, b) => {
      const valueA = a[sortColumnIndex] ?? "";
      const valueB = b[sortColumnIndex] ?? "";
      return (
        valueA.localeCompare(valueB, "pt-BR", {
          numeric: true,
          sensitivity: "base",
        }) * direction
      );
    });
  }

  const totalRows = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / safePageSize));
  const page = Math.min(requestedPage, totalPages);
  const start = (page - 1) * safePageSize;
  const rows = filteredRows.slice(start, start + safePageSize);

  const result: SheetDataQueryResult = {
    sheetName: sheet.sheetName,
    columns,
    rows,
    totalRows,
    page,
    pageSize: safePageSize,
    totalPages,
  };
  setSheetDataQueryCacheEntry(cacheKey, result);
  return result;
}
