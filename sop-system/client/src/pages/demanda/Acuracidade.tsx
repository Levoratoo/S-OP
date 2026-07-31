import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { Loader2, Target, TrendingUp, Gauge, BarChart3, Factory } from "lucide-react";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function formatRatioAsPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const pct = Math.abs(value) <= 1.5 ? value * 100 : value;
  return `${pct.toFixed(1)}%`;
}

function formatMoney(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "-";
  return `R$ ${parsed.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPercentLegacy(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(2)}%`;
}

export default function Acuracidade() {
  const [anoInput, setAnoInput] = useState(String(new Date().getFullYear()));
  const [jobIdOverride, setJobIdOverride] = useState<number | null>(null);
  const ano = useMemo(() => Number(anoInput) || new Date().getFullYear(), [anoInput]);

  const { data: jobs, isLoading: loadingJobs } = trpc.previsaoPython.list.useQuery({ limit: 30 });
  const successJobs = useMemo(
    () => (jobs ?? []).filter(j => j.status === "SUCCESS"),
    [jobs]
  );
  const latestSuccessId = successJobs[0]?.id ?? null;
  const selectedJobId = jobIdOverride ?? latestSuccessId;

  const selectedJob = useMemo(
    () => successJobs.find(j => j.id === selectedJobId) ?? null,
    [successJobs, selectedJobId]
  );

  const canUsePython = Boolean(selectedJob?.workdir && selectedJob?.outputFileName);

  const {
    data: analytics,
    isLoading: loadingAnalytics,
    refetch: refetchAnalytics,
    isError: analyticsError,
  } = trpc.previsaoPython.analytics.useQuery(
    { id: selectedJobId ?? 0, monthsLimit: 24 },
    { enabled: Boolean(selectedJobId) && canUsePython, staleTime: 20_000, retry: 1 }
  );

  const hasPythonAnalytics = Boolean(analytics) && !analyticsError && canUsePython;
  const useLegacy =
    !loadingJobs &&
    !(canUsePython && loadingAnalytics) &&
    !hasPythonAnalytics;

  const {
    data: indicadores,
    isLoading: loadingIndicadores,
    refetch: refetchLegacy,
  } = trpc.dashboard.acuracidade.useQuery({ ano }, { enabled: useLegacy });
  const { data: previsoes, isLoading: loadingPrevisoes } = trpc.previsoes.list.useQuery(
    { ano },
    { enabled: useLegacy }
  );

  const isLoading =
    loadingJobs ||
    (canUsePython && loadingAnalytics) ||
    (useLegacy && (loadingIndicadores || loadingPrevisoes));

  const pythonCards = analytics
    ? [
        {
          title: "MAPE médio",
          value: formatRatioAsPercent(analytics.summary.avgMapeTotal),
          icon: BarChart3,
          bg: "bg-blue-100",
          color: "text-blue-700",
        },
        {
          title: "MAPE mediano",
          value: formatRatioAsPercent(analytics.summary.medianMapeTotal),
          icon: TrendingUp,
          bg: "bg-amber-100",
          color: "text-amber-700",
        },
        {
          title: "Acuracidade",
          value: formatRatioAsPercent(analytics.summary.acuracidadeMedia),
          icon: Target,
          bg: "bg-green-100",
          color: "text-green-700",
        },
        {
          title: "Sugestão ajuste",
          value: formatRatioAsPercent(analytics.summary.avgSugestaoAjustePct),
          icon: Gauge,
          bg: "bg-purple-100",
          color: "text-purple-700",
        },
        {
          title: "SKUs",
          value: String(analytics.summary.skuCount ?? "—"),
          icon: Factory,
          bg: "bg-cyan-100",
          color: "text-cyan-700",
        },
      ]
    : [];

  const legacyCards = [
    {
      title: "MAPE",
      value: formatPercentLegacy(indicadores?.mape),
      icon: BarChart3,
      bg: "bg-blue-100",
      color: "text-blue-700",
    },
    {
      title: "WMAPE",
      value: formatPercentLegacy(indicadores?.wmape),
      icon: TrendingUp,
      bg: "bg-amber-100",
      color: "text-amber-700",
    },
    {
      title: "Bias",
      value: formatPercentLegacy(indicadores?.bias),
      icon: Gauge,
      bg: "bg-purple-100",
      color: "text-purple-700",
    },
    {
      title: "Acuracidade",
      value: formatPercentLegacy(indicadores?.acuracidade),
      icon: Target,
      bg: "bg-green-100",
      color: "text-green-700",
    },
    {
      title: "IROG Médio",
      value: formatPercentLegacy(indicadores?.irog),
      icon: Factory,
      bg: "bg-cyan-100",
      color: "text-cyan-700",
    },
  ];

  const cards = !useLegacy && analytics ? pythonCards : legacyCards;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Acuracidade da Demanda</h1>
          <p className="text-muted-foreground">
            Preferência: analytics do job Python SUCCESS · fallback: previsões CRUD do ano
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label>Job Python</Label>
            <Select
              value={selectedJobId ? String(selectedJobId) : undefined}
              onValueChange={v => setJobIdOverride(Number(v))}
            >
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Nenhum job SUCCESS" />
              </SelectTrigger>
              <SelectContent>
                {successJobs.map(j => (
                  <SelectItem key={j.id} value={String(j.id)}>
                    #{j.id} — {j.scriptVersion} {j.id === latestSuccessId ? "(mais recente)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {useLegacy && (
            <div className="space-y-1">
              <Label htmlFor="ano-acuracidade">Ano (fallback)</Label>
              <Input
                id="ano-acuracidade"
                type="number"
                value={anoInput}
                onChange={e => setAnoInput(e.target.value)}
                className="w-28"
              />
            </div>
          )}
          <Button
            variant="outline"
            onClick={() => {
              if (!useLegacy) void refetchAnalytics();
              else void refetchLegacy();
            }}
          >
            Atualizar
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm">
        {!useLegacy && analytics ? (
          <Badge>Fonte: job Python #{selectedJobId}</Badge>
        ) : (
          <Badge variant="secondary">Fonte: previsões CRUD / dashboard ({ano})</Badge>
        )}
        {selectedJob && (
          <span className="text-muted-foreground">
            {selectedJob.scriptVersion}
            {selectedJob.outputFileName ? ` · ${selectedJob.outputFileName}` : ""}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-5">
            {cards.map(card => (
              <Card key={card.title}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {card.title}
                  </CardTitle>
                  <div className={`rounded-lg p-2 ${card.bg}`}>
                    <card.icon className={`h-4 w-4 ${card.color}`} />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{card.value}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {!useLegacy && analytics ? (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Ranking de modelos</CardTitle>
                    <CardDescription>MAPE médio por método no workbook do job</CardDescription>
                  </CardHeader>
                  <CardContent className="overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Modelo</TableHead>
                          <TableHead className="text-right">SKUs</TableHead>
                          <TableHead className="text-right">MAPE</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(analytics.modelRanking ?? []).slice(0, 12).map(item => (
                          <TableRow key={item.modelo}>
                            <TableCell>{item.modelo}</TableCell>
                            <TableCell className="text-right">{item.skuCount}</TableCell>
                            <TableCell className="text-right">
                              {formatRatioAsPercent(item.avgMape)}
                            </TableCell>
                          </TableRow>
                        ))}
                        {(analytics.modelRanking ?? []).length === 0 && (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center text-muted-foreground">
                              Sem ranking de modelos no output.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Maiores erros (MAPE)</CardTitle>
                    <CardDescription>Top SKUs com maior erro no job</CardDescription>
                  </CardHeader>
                  <CardContent className="overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>SKU</TableHead>
                          <TableHead className="text-right">MAPE</TableHead>
                          <TableHead className="text-right">Ajuste sug.</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(analytics.topErros ?? []).slice(0, 15).map((item, idx) => (
                          <TableRow key={`${item.codigo}-${idx}`}>
                            <TableCell className="max-w-[180px] truncate">{item.codigo}</TableCell>
                            <TableCell className="text-right">
                              {formatRatioAsPercent(item.mapeTotal)}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatRatioAsPercent(item.sugestaoAjustePct)}
                            </TableCell>
                          </TableRow>
                        ))}
                        {(analytics.topErros ?? []).length === 0 && (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center text-muted-foreground">
                              Sem top erros no output.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Maiores acertos</CardTitle>
                  <CardDescription>SKUs com menor MAPE</CardDescription>
                </CardHeader>
                <CardContent className="overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>SKU</TableHead>
                        <TableHead className="text-right">MAPE</TableHead>
                        <TableHead className="text-right">Ajuste sug.</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(analytics.topAcertos ?? []).slice(0, 15).map((item, idx) => (
                        <TableRow key={`${item.codigo}-ok-${idx}`}>
                          <TableCell className="max-w-[220px] truncate">{item.codigo}</TableCell>
                          <TableCell className="text-right">
                            {formatRatioAsPercent(item.mapeTotal)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatRatioAsPercent(item.sugestaoAjustePct)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Base de Previsões</CardTitle>
                <CardDescription>
                  Registros do ano {ano} usados para cálculo (total: {indicadores?.totalPrevisoes ?? 0})
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ano/Mês</TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead>Família</TableHead>
                      <TableHead className="text-right">Valor Previsto</TableHead>
                      <TableHead className="text-right">MAPE</TableHead>
                      <TableHead className="text-right">WMAPE</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!previsoes || previsoes.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                          Nenhuma previsão encontrada para este ano. Rode um job Python SUCCESS para
                          ver analytics unificados.
                        </TableCell>
                      </TableRow>
                    ) : (
                      previsoes.slice(0, 50).map(item => (
                        <TableRow key={item.id}>
                          <TableCell>
                            {item.ano}/{MESES[(item.mes || 1) - 1]}
                          </TableCell>
                          <TableCell>{item.produtoId ?? "-"}</TableCell>
                          <TableCell>{item.familiaId ?? "-"}</TableCell>
                          <TableCell className="text-right">{formatMoney(item.valorPrevisto)}</TableCell>
                          <TableCell className="text-right">
                            {formatPercentLegacy(item.mape ? Number(item.mape) : null)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatPercentLegacy(item.wmape ? Number(item.wmape) : null)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
