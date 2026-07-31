import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { trpc } from "@/lib/trpc";
import { Loader2, Play, Download, FileSpreadsheet, FileText, Eye } from "lucide-react";
import { toast } from "sonner";

type UploadPayload = {
  fileName: string;
  contentBase64: string;
};

const statusVariant: Record<string, "default" | "secondary" | "outline"> = {
  PENDING: "secondary",
  RUNNING: "outline",
  SUCCESS: "default",
  ERROR: "secondary",
};

function canUseOutput(job: { outputFileName?: string | null; workdir?: string | null }) {
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

export default function PrevisaoPython() {
  const [, setLocation] = useLocation();
  const [vendasFile, setVendasFile] = useState<File | null>(null);
  const [previstoFile, setPrevistoFile] = useState<File | null>(null);
  const [clientesFile, setClientesFile] = useState<File | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);

  const utils = trpc.useUtils();
  const { data: jobs, isLoading: loadingJobs } = trpc.previsaoPython.list.useQuery(
    { limit: 30 },
    { refetchInterval: 3000 }
  );

  const { data: selectedJobDetails } = trpc.previsaoPython.getById.useQuery(
    { id: selectedJobId ?? 0 },
    { enabled: Boolean(selectedJobId), refetchInterval: 2000 }
  );

  const { data: jobLog, isLoading: loadingLog, dataUpdatedAt: logUpdatedAt } = trpc.previsaoPython.log.useQuery(
    { id: selectedJobId ?? 0, maxChars: 40000 },
    {
      enabled: Boolean(selectedJobId),
      refetchInterval: selectedJobDetails?.status === "RUNNING" ? 1500 : 4000,
    }
  );

  useEffect(() => {
    if (selectedJobId || !jobs || jobs.length === 0) return;
    setSelectedJobId(jobs[0].id);
  }, [jobs, selectedJobId]);

  useEffect(() => {
    if (!selectedJobId) return;

    const viewport = document.querySelector<HTMLElement>(
      "[data-previsao-log] [data-radix-scroll-area-viewport]"
    );
    if (!viewport) return;

    viewport.scrollTop = viewport.scrollHeight;
  }, [jobLog, selectedJobId]);

  const createMutation = trpc.previsaoPython.create.useMutation({
    onSuccess: job => {
      toast.success(`Job #${job?.id} criado e enviado para processamento.`);
      utils.previsaoPython.list.invalidate();
      if (job?.id) setSelectedJobId(job.id);
    },
    onError: error => toast.error(error.message),
  });

  const createFromSistemaMutation = trpc.previsaoPython.createFromSistema.useMutation({
    onSuccess: result => {
      toast.success(
        `Job #${result.job?.id} gerado do sistema (${result.stats.gruposVendas} grupos, ${result.stats.mesesHistorico} meses).`
      );
      utils.previsaoPython.list.invalidate();
      if (result.job?.id) setSelectedJobId(result.job.id);
    },
    onError: error => toast.error(error.message),
  });

  const desagregarMutation = trpc.cicloComercial.desagregarDoJob.useMutation({
    onSuccess: result => {
      toast.success(`Ciclo comercial #${result.cicloId} criado (${result.itensCriados} itens).`);
      setLocation("/demanda/colaboracoes");
    },
    onError: error => toast.error(error.message),
  });

  const downloadMutation = trpc.previsaoPython.download.useMutation({
    onSuccess: payload => {
      const binary = atob(payload.contentBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const blob = new Blob([bytes], { type: payload.mimeType });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = payload.fileName;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("Download iniciado.");
    },
    onError: error => toast.error(error.message),
  });

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Execucao de Previsao Python</h1>
          <p className="text-muted-foreground">
            Gere as bases pelo sistema (Passo 1), execute o script (Passo 2) e desagregue para
            colaboração (Passo 3).
          </p>
        </div>
        <div className="flex flex-wrap gap-2" data-tour="page-python-gerar-bases">
          <Button
            variant="default"
            disabled={createFromSistemaMutation.isPending}
            onClick={() => createFromSistemaMutation.mutate({})}
          >
            {createFromSistemaMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            Gerar bases do sistema e executar
          </Button>
          {selectedJobDetails?.status === "SUCCESS" && (
            <Button
              variant="outline"
              disabled={desagregarMutation.isPending}
              onClick={() =>
                selectedJobId && desagregarMutation.mutate({ jobId: selectedJobId })
              }
            >
              {desagregarMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Desagregar → Colaboração
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Nova Execucao
          </CardTitle>
          <CardDescription>
            Vendas e obrigatorio. Previsto e Clientes sao opcionais.
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
            <Button onClick={handleCreateJob} disabled={createMutation.isPending}>
              {createMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              Executar Previsao
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle data-tour="page-python-jobs">Historico de Jobs</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingJobs ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Criado em</TableHead>
                    <TableHead>Acoes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!jobs || jobs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                        Nenhum job executado.
                      </TableCell>
                    </TableRow>
                  ) : (
                    jobs.map(job => (
                      <TableRow key={job.id} className={selectedJobId === job.id ? "bg-muted/40" : ""}>
                        <TableCell>#{job.id}</TableCell>
                        <TableCell>
                          <Badge variant={statusVariant[job.status] || "secondary"}>{job.status}</Badge>
                        </TableCell>
                        <TableCell>{formatDate(job.createdAt)}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" onClick={() => setSelectedJobId(job.id)}>
                              <FileText className="mr-1 h-3 w-3" />
                              Ver
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!canUseOutput(job)}
                              onClick={() => setLocation(`/previsao-python/jobs/${job.id}/visualizacao`)}
                            >
                              <Eye className="mr-1 h-3 w-3" />
                              Visualizar
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!canUseOutput(job) || downloadMutation.isPending}
                              onClick={() => downloadMutation.mutate({ id: job.id })}
                            >
                              <Download className="mr-1 h-3 w-3" />
                              Excel
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Detalhes e Log</CardTitle>
            <CardDescription>
              {selectedJobDetails
                ? `Job #${selectedJobDetails.id} - ${selectedJobDetails.message || "Sem mensagem"}`
                : "Selecione um job para visualizar."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedJobDetails && (
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Status: </span>
                  <span className="font-medium">{selectedJobDetails.status}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Versao: </span>
                  <span className="font-medium">{selectedJobDetails.scriptVersion}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Inicio: </span>
                  <span className="font-medium">{formatDate(selectedJobDetails.startedAt)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Fim: </span>
                  <span className="font-medium">{formatDate(selectedJobDetails.finishedAt)}</span>
                </div>
              </div>
            )}

            <div className="text-xs text-muted-foreground">
              {selectedJobDetails?.status === "RUNNING"
                ? `Atualizacao automatica em tempo real (1.5s). Ultima leitura: ${formatDate(logUpdatedAt || null)}`
                : `Ultima leitura do log: ${formatDate(logUpdatedAt || null)}`}
            </div>

            <ScrollArea data-previsao-log className="h-[420px] rounded-md border p-3">
              {loadingLog ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <pre className="whitespace-pre-wrap text-xs leading-5">
                  {jobLog || "Sem log disponivel."}
                </pre>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
