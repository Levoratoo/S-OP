import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { trpc } from "@/lib/trpc";
import {
  Loader2,
  Play,
  Download,
  FileSpreadsheet,
  Eye,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ArrowRight,
  Database,
  Sparkles,
  Clock3,
  Hash,
  Terminal,
} from "lucide-react";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type UploadPayload = {
  fileName: string;
  contentBase64: string;
};

type JobInputMetadata = {
  origin?: string;
  sourceMetadata?: {
    previstoOrigem?: string;
    cadastro?: Array<{ arquivo: string; atualizadoEm: string }>;
  } | null;
  vendas?: JobFileMetadata;
  previsto?: JobFileMetadata | null;
  clientes?: JobFileMetadata | null;
};

type JobFileMetadata = {
  lastCompetence?: string | null;
  rowCount?: number;
  sha256?: string;
  totalCompetencias?: number;
};

const statusTone: Record<
  string,
  { badge: string; dot: string; ring: string; label: string }
> = {
  SUCCESS: {
    badge: "border-emerald-200 bg-emerald-50 text-emerald-800",
    dot: "bg-emerald-500",
    ring: "ring-emerald-500/30",
    label: "Concluído",
  },
  RUNNING: {
    badge: "border-sky-200 bg-sky-50 text-sky-800",
    dot: "bg-sky-500 animate-pulse",
    ring: "ring-sky-500/30",
    label: "Em execução",
  },
  PENDING: {
    badge: "border-amber-200 bg-amber-50 text-amber-900",
    dot: "bg-amber-400",
    ring: "ring-amber-500/25",
    label: "Na fila",
  },
  ERROR: {
    badge: "border-rose-200 bg-rose-50 text-rose-800",
    dot: "bg-rose-500",
    ring: "ring-rose-500/30",
    label: "Erro",
  },
};

function canUseOutput(job: {
  outputFileName?: string | null;
  workdir?: string | null;
}) {
  return Boolean(job.outputFileName && job.workdir);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatDate(value: Date | string | number | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("pt-BR");
}

function formatRelativeDate(value: Date | string | number | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `há ${days}d`;
  return date.toLocaleDateString("pt-BR");
}

export default function PrevisaoPython() {
  const [, setLocation] = useLocation();
  const [vendasFile, setVendasFile] = useState<File | null>(null);
  const [previstoFile, setPrevistoFile] = useState<File | null>(null);
  const [clientesFile, setClientesFile] = useState<File | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const detailsRef = useRef<HTMLDivElement | null>(null);

  const { data: mesFechado } = trpc.faturamento.mesFechadoCheck.useQuery(undefined, {
    staleTime: 5 * 60_000,
  });

  const utils = trpc.useUtils();
  const { data: jobs, isLoading: loadingJobs } =
    trpc.previsaoPython.list.useQuery(
      { limit: 30 },
      {
        staleTime: 20_000,
        refetchInterval: query =>
          query.state.data?.some(job =>
            ["PENDING", "RUNNING"].includes(job.status)
          )
            ? 3000
            : false,
      }
    );

  const { data: selectedJobDetails, isFetching: loadingJobDetails } =
    trpc.previsaoPython.getById.useQuery(
      { id: selectedJobId ?? 0 },
      {
        enabled: Boolean(selectedJobId),
        staleTime: 15_000,
        refetchInterval: query =>
          ["PENDING", "RUNNING"].includes(query.state.data?.status ?? "")
            ? 2000
            : false,
      }
    );

  const {
    data: jobLog,
    isLoading: loadingLog,
    dataUpdatedAt: logUpdatedAt,
  } = trpc.previsaoPython.log.useQuery(
    { id: selectedJobId ?? 0, maxChars: 40000 },
    {
      enabled: Boolean(selectedJobId),
      refetchInterval: ["PENDING", "RUNNING"].includes(
        selectedJobDetails?.status ?? ""
      )
        ? 1500
        : false,
    }
  );
  const inputMetadata = useMemo<JobInputMetadata | null>(() => {
    if (!selectedJobDetails?.inputMetadataJson) return null;
    try {
      return JSON.parse(selectedJobDetails.inputMetadataJson) as JobInputMetadata;
    } catch {
      return null;
    }
  }, [selectedJobDetails?.inputMetadataJson]);

  useEffect(() => {
    if (!selectedJobId) return;

    const viewport = document.querySelector<HTMLElement>(
      "[data-previsao-log] [data-radix-scroll-area-viewport]"
    );
    if (!viewport) return;

    viewport.scrollTop = viewport.scrollHeight;
  }, [jobLog, selectedJobId]);

  useEffect(() => {
    if (selectedJobId || !jobs?.length) return;
    const preferred =
      jobs.find(job => job.status === "SUCCESS") ??
      jobs.find(job => ["RUNNING", "PENDING"].includes(job.status)) ??
      jobs[0];
    if (preferred) setSelectedJobId(preferred.id);
  }, [jobs, selectedJobId]);

  const successCount = useMemo(
    () => jobs?.filter(job => job.status === "SUCCESS").length ?? 0,
    [jobs]
  );
  const runningCount = useMemo(
    () =>
      jobs?.filter(job => ["RUNNING", "PENDING"].includes(job.status)).length ??
      0,
    [jobs]
  );
  const selectedTone =
    statusTone[selectedJobDetails?.status ?? ""] ?? statusTone.PENDING;
  const waitingForDetails =
    Boolean(selectedJobId) &&
    (!selectedJobDetails || selectedJobDetails.id !== selectedJobId);

  const createMutation = trpc.previsaoPython.create.useMutation({
    onSuccess: job => {
      toast.success(`Job #${job?.id} criado e enviado para processamento.`);
      utils.previsaoPython.list.invalidate();
      if (job?.id) setSelectedJobId(job.id);
    },
    onError: error => toast.error(error.message),
  });

  const createFromSistemaMutation =
    trpc.previsaoPython.createFromSistema.useMutation({
      onSuccess: result => {
        const s = result.stats as {
          gruposVendas?: number;
          mesesHistorico?: number;
          previstoOrigem?: string;
          previstoAtrasado?: boolean;
          previstoCompetenciaUsada?: string | null;
          linhasSemSkuProjetar?: number;
          marcasInativasExcluidas?: number;
          linhasOutrosExcluidas?: number;
        };
        toast.success(
          `Job #${result.job?.id} gerado (${s.gruposVendas ?? "?"} grupos, ${s.mesesHistorico ?? "?"} meses` +
            (s.previstoOrigem && s.previstoOrigem !== "nenhum"
              ? `, previsto=${s.previstoOrigem}`
              : ", sem previsto") +
            `).`
        );
        if (s.previstoAtrasado) {
          toast.message(
            "Projeção Itens está atrás do mês fechado — atualize o Previsto assim que possível."
          );
        }
        utils.previsaoPython.list.invalidate();
        if (result.job?.id) setSelectedJobId(result.job.id);
      },
    });

  const [gerandoPrevisao, setGerandoPrevisao] = useState(false);

  const desagregarMutation = trpc.cicloComercial.desagregarDoJob.useMutation({
    onSuccess: result => {
      toast.success(
        `Ciclo comercial #${result.cicloId} criado (${result.itensCriados} itens).`
      );
      setLocation("/demanda/colaboracoes");
    },
    onError: error => toast.error(error.message),
  });

  /** Um clique = sync cadastros + ETL das 3 bases + script Python (Word: executar_previsao). */
  const handleGerarPrevisao = async () => {
    if (mesFechado?.ok === false) {
      toast.error(
        "Atualize o faturamento do mês fechado antes de gerar a previsão."
      );
      return;
    }
    setGerandoPrevisao(true);
    try {
      const result = await createFromSistemaMutation.mutateAsync({});
      utils.produtos.list.invalidate();
      if (result.sourceSync.avisos?.length) {
        toast.message(`${result.sourceSync.avisos.length} avisos no sync de cadastros`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setGerandoPrevisao(false);
    }
  };

  const downloadJobExcel = (jobId: number) => {
    // Mesmo arquivo binário da pasta do job (evita base64 de 15MB)
    window.location.assign(`/api/previsao-python/jobs/${jobId}/file`);
  };

  const handleCreateJob = async () => {
    if (!vendasFile) {
      toast.error("Selecione o arquivo de vendas.");
      return;
    }

    try {
      const vendasPayload: UploadPayload = {
        fileName: vendasFile.name,
        contentBase64: await readFileAsDataUrl(vendasFile),
      };

      const previstoPayload = previstoFile
        ? ({
            fileName: previstoFile.name,
            contentBase64: await readFileAsDataUrl(previstoFile),
          } as UploadPayload)
        : undefined;

      const clientesPayload = clientesFile
        ? ({
            fileName: clientesFile.name,
            contentBase64: await readFileAsDataUrl(clientesFile),
          } as UploadPayload)
        : undefined;

      createMutation.mutate({
        vendas: vendasPayload,
        previsto: previstoPayload,
        clientes: clientesPayload,
      });
    } catch (error) {
      toast.error(`Falha ao ler arquivos: ${String(error)}`);
    }
  };

  const handleViewJob = (jobId: number) => {
    setSelectedJobId(jobId);
    void utils.previsaoPython.getById.prefetch({ id: jobId });
    void utils.previsaoPython.log.prefetch({ id: jobId, maxChars: 40000 });
    requestAnimationFrame(() => {
      detailsRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

  const prefetchJobVisualization = (jobId: number) => {
    void import("@/pages/previsao/PrevisaoPythonViewer");
    void utils.previsaoPython.workbookMeta.prefetch({ id: jobId });
    void utils.previsaoPython.sheetData.prefetch({
      id: jobId,
      sheetName: "Visao_Executiva",
      page: 1,
      pageSize: 100,
      search: "",
      sortBy: "",
      sortDir: "asc",
      filters: [],
    });
  };

  return (
    <div className="space-y-7">
      <section className="relative overflow-hidden rounded-[1.75rem] bg-[linear-gradient(125deg,#092e55_0%,#0c4e78_58%,#08765c_125%)] p-6 text-white shadow-[0_24px_65px_-32px_rgba(4,43,78,0.75)] md:p-9">
        <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-emerald-300/15 blur-3xl" />
        <div className="absolute -bottom-32 left-1/3 h-64 w-64 rounded-full bg-sky-300/10 blur-3xl" />
        <div className="relative flex flex-col items-start justify-between gap-7 xl:flex-row xl:items-end">
          <div className="max-w-3xl">
            <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-200 backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" />
              Motor inteligente de demanda
            </span>
            <h1 className="text-3xl font-bold tracking-[-0.04em] md:text-4xl">
              Gere uma previsão mais precisa em poucos minutos.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-sky-50/72 md:text-base">
              Cadastros, faturamento e tratamento estatístico integrados em um
              fluxo único, pronto para iniciar o próximo ciclo comercial.
            </p>
          </div>
          <div
            className="flex flex-wrap gap-3"
            data-tour="page-python-gerar-bases"
          >
            <Button
              size="lg"
              variant="default"
              className="bg-emerald-400 text-emerald-950 shadow-[0_14px_30px_-12px_rgba(52,211,153,0.7)] hover:bg-emerald-300"
              disabled={
                gerandoPrevisao ||
                createFromSistemaMutation.isPending ||
                mesFechado?.ok === false
              }
              onClick={() => void handleGerarPrevisao()}
            >
              {gerandoPrevisao ||
              createFromSistemaMutation.isPending ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <Play className="mr-2 h-5 w-5" />
              )}
              Gerar Previsão
              {!gerandoPrevisao &&
              !createFromSistemaMutation.isPending ? (
                <ArrowRight className="ml-1 h-4 w-4" />
              ) : null}
            </Button>
            {selectedJobDetails?.status === "SUCCESS" && (
              <Button
                size="lg"
                variant="outline"
                className="border-white/20 bg-white/10 text-white hover:border-white/30 hover:bg-white/15 hover:text-white"
                disabled={desagregarMutation.isPending}
                onClick={() =>
                  selectedJobId &&
                  desagregarMutation.mutate({ jobId: selectedJobId })
                }
              >
                {desagregarMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Abrir novo ciclo S&OP
              </Button>
            )}
          </div>
        </div>
        <div className="relative mt-8 flex flex-wrap gap-x-7 gap-y-3 border-t border-white/10 pt-5 text-xs font-medium text-white/60">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-300" /> Cadastros
            sincronizados
          </span>
          <span className="flex items-center gap-2">
            <Database className="h-4 w-4 text-sky-300" /> Bases consolidadas
          </span>
          <span className="flex items-center gap-2">
            <Play className="h-4 w-4 text-amber-300" /> Estatística v5.2
          </span>
        </div>
      </section>

      {gerandoPrevisao || createFromSistemaMutation.isPending ? (
        <div className="flex items-center gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950 shadow-sm">
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-sky-600" />
          <div>
            <p className="font-semibold">Gerando previsão…</p>
            <p className="text-xs text-sky-800/80">
              Sincronizando cadastros, consolidando bases e rodando o motor
              estatístico. Isso pode levar alguns minutos — não feche a página.
            </p>
          </div>
        </div>
      ) : null}

      {mesFechado && !mesFechado.ok && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>
            Falta faturamento do mês fechado ({mesFechado.label})
          </AlertTitle>
          <AlertDescription>
            Atualize em Bases / Faturamento até o mês anterior (Jan/2020 → mês
            fechado). Última data:{" "}
            {mesFechado.maxDataEmissao
              ? new Date(mesFechado.maxDataEmissao).toLocaleDateString("pt-BR")
              : "—"}
            .
          </AlertDescription>
        </Alert>
      )}

      <TooltipProvider delayDuration={200}>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
          <Card className="overflow-hidden border-border/70 shadow-sm">
            <CardHeader className="border-b border-border/60 bg-gradient-to-br from-slate-50 to-white pb-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle data-tour="page-python-jobs" className="text-lg">
                    Histórico de execuções
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Clique na linha para ver detalhes. Use os ícones para abrir o
                    relatório ou baixar o Excel.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-medium text-emerald-800">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {successCount} ok
                  </span>
                  {runningCount > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 font-medium text-sky-800">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-500" />
                      {runningCount} ativo
                    </span>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingJobs ? (
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
                  <p className="text-sm font-medium text-foreground">
                    Carregando histórico de execuções…
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Aguarde um instante.
                  </p>
                </div>
              ) : !jobs || jobs.length === 0 ? (
                <div className="px-6 py-16 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                    <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    Nenhuma execução ainda
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Clique em Gerar Previsão para criar o primeiro job.
                  </p>
                </div>
              ) : (
                <div className="max-h-[640px] overflow-y-auto snop-blue-scroll">
                  <div className="divide-y divide-border/60">
                    {jobs.map(job => {
                      const tone = statusTone[job.status] ?? statusTone.PENDING;
                      const selected = selectedJobId === job.id;
                      const outputReady = canUseOutput(job);
                      return (
                        <div
                          key={job.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => handleViewJob(job.id)}
                          onKeyDown={event => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              handleViewJob(job.id);
                            }
                          }}
                          className={`group flex items-center gap-3 px-4 py-3.5 transition-all ${
                            selected
                              ? `bg-sky-50/80 ring-1 ring-inset ${tone.ring}`
                              : "hover:bg-slate-50/80"
                          }`}
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            <div
                              className={`flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl border bg-white text-center shadow-sm ${
                                selected
                                  ? "border-sky-200"
                                  : "border-border/70"
                              }`}
                            >
                              <span className="text-[10px] font-medium uppercase leading-none text-muted-foreground">
                                job
                              </span>
                              <span className="text-sm font-bold leading-tight text-foreground">
                                {job.id}
                              </span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone.badge}`}
                                >
                                  <span
                                    className={`h-1.5 w-1.5 rounded-full ${tone.dot}`}
                                  />
                                  {tone.label}
                                </span>
                                <span className="text-[11px] text-muted-foreground">
                                  {job.status}
                                </span>
                              </div>
                              <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Clock3 className="h-3 w-3 shrink-0" />
                                <span title={formatDate(job.createdAt)}>
                                  {formatRelativeDate(job.createdAt)}
                                </span>
                                <span className="text-border">·</span>
                                <span className="truncate">
                                  {formatDate(job.createdAt)}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div
                            className="flex shrink-0 items-center gap-1.5"
                            onClick={event => event.stopPropagation()}
                          >
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className="h-9 w-9 rounded-xl border-border/80 bg-white shadow-sm hover:border-sky-300 hover:bg-sky-50 hover:text-sky-800"
                                  disabled={!outputReady}
                                  onMouseEnter={() =>
                                    outputReady && prefetchJobVisualization(job.id)
                                  }
                                  onFocus={() =>
                                    outputReady && prefetchJobVisualization(job.id)
                                  }
                                  onClick={() =>
                                    setLocation(
                                      `/previsao-python/jobs/${job.id}/visualizacao`
                                    )
                                  }
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Abrir visualização</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className="h-9 w-9 rounded-xl border-border/80 bg-white shadow-sm hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800"
                                  disabled={!outputReady}
                                  onClick={() => downloadJobExcel(job.id)}
                                >
                                  <Download className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Baixar Excel</TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card
            ref={detailsRef}
            className="scroll-mt-6 overflow-hidden border-border/70 shadow-sm"
          >
            <CardHeader className="border-b border-border/60 bg-gradient-to-br from-slate-50 to-white pb-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">Detalhes da execução</CardTitle>
                  <CardDescription className="mt-1">
                    {waitingForDetails
                      ? `Carregando job #${selectedJobId}…`
                      : selectedJobDetails
                        ? selectedJobDetails.message ||
                          `Job #${selectedJobDetails.id}`
                        : "Selecione um job à esquerda para acompanhar."}
                  </CardDescription>
                </div>
                {selectedJobDetails && !waitingForDetails && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${selectedTone.badge}`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${selectedTone.dot}`}
                      />
                      {selectedTone.label}
                    </span>
                    {loadingJobDetails && !waitingForDetails && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    )}
                    {canUseOutput(selectedJobDetails) && (
                      <>
                        <Button
                          size="sm"
                          className="h-8 rounded-lg"
                          onMouseEnter={() =>
                            prefetchJobVisualization(selectedJobDetails.id)
                          }
                          onClick={() =>
                            setLocation(
                              `/previsao-python/jobs/${selectedJobDetails.id}/visualizacao`
                            )
                          }
                        >
                          <Eye className="mr-1.5 h-3.5 w-3.5" />
                          Abrir relatório
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 rounded-lg"
                          onClick={() => downloadJobExcel(selectedJobDetails.id)}
                        >
                          <Download className="mr-1.5 h-3.5 w-3.5" />
                          Excel
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4 p-5">
              {waitingForDetails ? (
                <div className="rounded-2xl border border-sky-100 bg-sky-50/60 px-6 py-16 text-center">
                  <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-sky-600" />
                  <p className="text-sm font-semibold text-sky-950">
                    Carregando detalhes do job #{selectedJobId}…
                  </p>
                  <p className="mt-1 text-xs text-sky-800/75">
                    Buscando status, metadados e log da execução.
                  </p>
                </div>
              ) : !selectedJobDetails ? (
                <div className="rounded-2xl border border-dashed border-border/80 bg-muted/20 px-6 py-16 text-center">
                  <Terminal className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">
                    Nenhum job selecionado.
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                    {[
                      {
                        label: "Status",
                        value: selectedJobDetails.status,
                        icon: CheckCircle2,
                      },
                      {
                        label: "Versão",
                        value: selectedJobDetails.scriptVersion || "—",
                        icon: Sparkles,
                      },
                      {
                        label: "Hash script",
                        value:
                          selectedJobDetails.scriptHash?.slice(0, 12) || "—",
                        icon: Hash,
                        mono: true,
                      },
                      {
                        label: "Início",
                        value: formatDate(selectedJobDetails.startedAt),
                        icon: Clock3,
                      },
                      {
                        label: "Fim",
                        value: formatDate(selectedJobDetails.finishedAt),
                        icon: Clock3,
                      },
                    ].map(item => (
                      <div
                        key={item.label}
                        className="rounded-xl border border-border/70 bg-gradient-to-b from-white to-slate-50/80 p-3 shadow-sm"
                      >
                        <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          <item.icon className="h-3 w-3" />
                          {item.label}
                        </div>
                        <div
                          className={`mt-1.5 truncate text-sm font-semibold text-foreground ${
                            item.mono ? "font-mono text-xs" : ""
                          }`}
                          title={String(item.value)}
                        >
                          {item.value}
                        </div>
                      </div>
                    ))}
                  </div>

                  {inputMetadata && (
                    <div className="space-y-3 rounded-2xl border border-border/70 bg-slate-50/60 p-4">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-semibold text-foreground">
                          Fontes de dados
                        </span>
                        <span className="rounded-full bg-white px-2 py-0.5 text-muted-foreground ring-1 ring-border/70">
                          {inputMetadata.origin || "—"}
                        </span>
                        {inputMetadata.sourceMetadata?.previstoOrigem ? (
                          <span className="rounded-full bg-white px-2 py-0.5 text-muted-foreground ring-1 ring-border/70">
                            Previsto:{" "}
                            {inputMetadata.sourceMetadata.previstoOrigem}
                          </span>
                        ) : null}
                      </div>
                      <div className="grid gap-2.5 sm:grid-cols-3">
                        {[
                          ["Vendas", inputMetadata.vendas],
                          ["Previsto", inputMetadata.previsto],
                          ["Clientes", inputMetadata.clientes],
                        ].map(([label, metadata]) => {
                          const item = metadata as
                            | JobFileMetadata
                            | null
                            | undefined;
                          return (
                            <div
                              key={String(label)}
                              className="rounded-xl border border-border/60 bg-white p-3 shadow-sm"
                            >
                              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                                <Database className="h-3 w-3 text-sky-600" />
                                {String(label)}
                              </div>
                              <dl className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                                <div className="flex justify-between gap-2">
                                  <dt>Competência</dt>
                                  <dd className="font-medium text-foreground">
                                    {item?.lastCompetence || "ausente"}
                                  </dd>
                                </div>
                                <div className="flex justify-between gap-2">
                                  <dt>Linhas</dt>
                                  <dd className="font-medium text-foreground">
                                    {item?.rowCount?.toLocaleString("pt-BR") ??
                                      "—"}
                                  </dd>
                                </div>
                                <div className="flex justify-between gap-2">
                                  <dt>Total</dt>
                                  <dd className="font-medium text-foreground">
                                    {item?.totalCompetencias?.toLocaleString(
                                      "pt-BR"
                                    ) ?? "—"}
                                  </dd>
                                </div>
                                <div className="flex justify-between gap-2">
                                  <dt>Hash</dt>
                                  <dd className="font-mono text-[10px] text-foreground">
                                    {item?.sha256?.slice(0, 10) || "—"}
                                  </dd>
                                </div>
                              </dl>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="overflow-hidden rounded-2xl border border-slate-800/80 bg-[#0b1220] shadow-inner">
                    <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
                      <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
                        <Terminal className="h-3.5 w-3.5 text-emerald-400" />
                        Log de execução
                      </div>
                      <span className="text-[10px] text-slate-500">
                        {selectedJobDetails.status === "RUNNING"
                          ? `ao vivo · ${formatDate(logUpdatedAt || null)}`
                          : `última leitura · ${formatDate(logUpdatedAt || null)}`}
                      </span>
                    </div>
                    <ScrollArea
                      data-previsao-log
                      className="h-[360px] px-4 py-3"
                    >
                      {loadingLog ? (
                        <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                          <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
                          <p className="text-xs font-medium text-slate-300">
                            Carregando log da execução…
                          </p>
                        </div>
                      ) : (
                        <pre className="whitespace-pre-wrap font-mono text-[11px] leading-5 text-emerald-100/90">
                          {jobLog || "Sem log disponível."}
                        </pre>
                      )}
                    </ScrollArea>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </TooltipProvider>

      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full justify-between rounded-xl border border-dashed border-border/80 bg-muted/20 text-muted-foreground hover:bg-muted/40"
          >
            Fallback — upload manual das 3 bases (legado Excel)
            <ChevronDown className="h-4 w-4" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Card className="mt-2 border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileSpreadsheet className="h-5 w-5" />
                Upload manual
              </CardTitle>
              <CardDescription>
                Só se precisar colar as abas vermelhas do “1 - Estatística IA”
                na mão.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="file-vendas">Vendas (obrigatorio)</Label>
                  <Input
                    id="file-vendas"
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={e => setVendasFile(e.target.files?.[0] ?? null)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {vendasFile?.name || "Nenhum arquivo selecionado"}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="file-previsto">Previsto (opcional)</Label>
                  <Input
                    id="file-previsto"
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={e => setPrevistoFile(e.target.files?.[0] ?? null)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {previstoFile?.name || "Nenhum arquivo selecionado"}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="file-clientes">Clientes (opcional)</Label>
                  <Input
                    id="file-clientes"
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={e => setClientesFile(e.target.files?.[0] ?? null)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {clientesFile?.name || "Nenhum arquivo selecionado"}
                  </p>
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={handleCreateJob}
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="mr-2 h-4 w-4" />
                  )}
                  Executar com upload
                </Button>
              </div>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
