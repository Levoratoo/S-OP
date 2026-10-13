import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Loader2, Eye, Download, ArrowLeft, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { downloadPrevisaoJobExcel } from "@/lib/downloadPrevisaoJobExcel";

const statusVariant: Record<string, "default" | "secondary" | "outline"> = {
  PENDING: "secondary",
  RUNNING: "outline",
  SUCCESS: "default",
  ERROR: "secondary",
};

function formatDate(value: Date | string | number | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("pt-BR");
}

function canUseOutput(job: { outputFileName?: string | null; workdir?: string | null }) {
  return Boolean(job.outputFileName && job.workdir);
}

/**
 * Relatório Estatístico — mostra as estatísticas geradas em Gerar Previsão
 * (jobs SUCCESS do script v5.2), não o upload legado ciclo-13.
 */
export default function PrevisaoPythonCiclo13() {
  const [, setLocation] = useLocation();
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);

  const { data: jobs, isLoading: loadingJobs } = trpc.previsaoPython.list.useQuery(
    { limit: 60 },
    { refetchInterval: 3000 }
  );

  const estatisticaJobs = useMemo(
    () =>
      (jobs || []).filter(job => {
        if (job.status !== "SUCCESS") return false;
        const ver = String(job.scriptVersion || "").toLowerCase();
        return !ver.includes("ciclo13");
      }),
    [jobs]
  );

  useEffect(() => {
    if (selectedJobId || estatisticaJobs.length === 0) return;
    setSelectedJobId(estatisticaJobs[0].id);
  }, [estatisticaJobs, selectedJobId]);

  const selected = estatisticaJobs.find(j => j.id === selectedJobId) ?? estatisticaJobs[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Relatório Estatístico</h1>
          <p className="text-muted-foreground">
            Estatísticas geradas em Gerar Previsão (jobs SUCCESS). Abra a visão executiva do job.
          </p>
        </div>
        <Button variant="outline" onClick={() => setLocation("/previsao-python")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Ir para Gerar Previsão
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Jobs de previsão estatística
          </CardTitle>
          <CardDescription>
            Fonte: Gerar Previsão (`v5.2-COMPLETO`). Upload ciclo-13 legado não aparece aqui.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingJobs ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : estatisticaJobs.length === 0 ? (
            <p className="py-6 text-center text-muted-foreground">
              Nenhum job SUCCESS ainda. Rode a geração em{" "}
              <button
                type="button"
                className="underline"
                onClick={() => setLocation("/previsao-python")}
              >
                Gerar Previsão
              </button>
              .
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Versão</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Criado</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {estatisticaJobs.map(job => (
                  <TableRow
                    key={job.id}
                    className={selected?.id === job.id ? "bg-muted/50" : undefined}
                    onClick={() => setSelectedJobId(job.id)}
                  >
                    <TableCell>#{job.id}</TableCell>
                    <TableCell>{job.scriptVersion}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[job.status] || "secondary"}>{job.status}</Badge>
                    </TableCell>
                    <TableCell>{formatDate(job.createdAt)}</TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!canUseOutput(job)}
                        onClick={e => {
                          e.stopPropagation();
                          setLocation(`/previsao-python/jobs/${job.id}/visualizacao`);
                        }}
                      >
                        <Eye className="mr-1 h-4 w-4" />
                        Ver
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!canUseOutput(job)}
                        onClick={e => {
                          e.stopPropagation();
                          void downloadPrevisaoJobExcel(job.id).catch(err =>
                            toast.error(String(err))
                          );
                        }}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
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
