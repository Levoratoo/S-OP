import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Loader2, Upload, Eye, Download, ArrowLeft } from "lucide-react";
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

function canUseOutput(job: { outputFileName?: string | null; workdir?: string | null }) {
  return Boolean(job.outputFileName && job.workdir);
}

export default function PrevisaoPythonCiclo13() {
  const [, setLocation] = useLocation();
  const [workbookFile, setWorkbookFile] = useState<File | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const utils = trpc.useUtils();

  const { data: jobs, isLoading: loadingJobs } = trpc.previsaoPython.list.useQuery(
    { limit: 60 },
    { refetchInterval: 3000 }
  );

  const ciclo13Jobs = useMemo(
    () =>
      (jobs || []).filter(job =>
        String(job.scriptVersion || "")
          .toLowerCase()
          .includes("ciclo13")
      ),
    [jobs]
  );

  useEffect(() => {
    if (selectedJobId || ciclo13Jobs.length === 0) return;
    setSelectedJobId(ciclo13Jobs[0].id);
  }, [ciclo13Jobs, selectedJobId]);

  const uploadMutation = trpc.previsaoPython.createCiclo13Upload.useMutation({
    onSuccess: job => {
      toast.success(`Upload concluido no job #${job?.id}.`);
      setWorkbookFile(null);
      void utils.previsaoPython.list.invalidate();
      if (job?.id) {
        setSelectedJobId(job.id);
        setLocation(`/previsao-python/jobs/${job.id}/visualizacao-ciclo-13`);
      }
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

  const handleUpload = async () => {
    if (!workbookFile) {
      toast.error("Selecione a planilha de Previsão Demanda Estatística.");
      return;
    }

    try {
      const payload: UploadPayload = {
        fileName: workbookFile.name,
        contentBase64: await readFileAsDataUrl(workbookFile),
      };
      uploadMutation.mutate({ workbook: payload });
    } catch (error) {
      toast.error(`Falha ao ler arquivo: ${String(error)}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Previsão Demanda Estatística</h1>
          <p className="text-muted-foreground">
            Upload dedicado da planilha com abertura direta da análise executiva.
          </p>
        </div>
        <Button variant="outline" onClick={() => setLocation("/previsao-python")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload da Planilha
          </CardTitle>
          <CardDescription>
            Envie o arquivo consolidado (ex.: Ciclo 13 - Previsão Demanda Estatística.xlsx).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="file-ciclo13">Arquivo Excel</Label>
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <Input
              id="file-ciclo13"
              type="file"
              accept=".xlsx,.xls"
              className="md:flex-1"
              onChange={e => setWorkbookFile(e.target.files?.[0] ?? null)}
            />
            <Button
              onClick={handleUpload}
              disabled={uploadMutation.isPending}
              className="md:shrink-0"
            >
              {uploadMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Enviar e analisar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {workbookFile?.name || "Nenhum arquivo selecionado"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico - Previsão Demanda Estatística</CardTitle>
          <CardDescription>
            Jobs importados pela tela dedicada.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingJobs ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : ciclo13Jobs.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">Nenhum job encontrado.</p>
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
                {ciclo13Jobs.map(job => (
                  <TableRow key={job.id} className={selectedJobId === job.id ? "bg-muted/40" : ""}>
                    <TableCell>#{job.id}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[job.status] || "secondary"}>{job.status}</Badge>
                    </TableCell>
                    <TableCell>{formatDate(job.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!canUseOutput(job)}
                          onClick={() =>
                            setLocation(`/previsao-python/jobs/${job.id}/visualizacao-ciclo-13`)
                          }
                        >
                          <Eye className="mr-1 h-3 w-3" />
                          Abrir analise
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
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
