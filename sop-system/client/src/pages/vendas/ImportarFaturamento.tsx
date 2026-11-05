import { useState, useEffect, useRef } from "react";
import { formatCalendarDate } from "@shared/calendar-date";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { AlertCircle, CheckCircle2, Loader2, Trash2, Download, Database, RefreshCw, Users } from "lucide-react";
import { toast } from "sonner";
import { useRefreshFaturamentoRecent, toastPostSyncAlerts } from "./useRefreshFaturamentoRecent";

const MONTH_OPTIONS = [
  { value: "all", label: "Todos os meses" },
  { value: "1", label: "Janeiro" },
  { value: "2", label: "Fevereiro" },
  { value: "3", label: "Março" },
  { value: "4", label: "Abril" },
  { value: "5", label: "Maio" },
  { value: "6", label: "Junho" },
  { value: "7", label: "Julho" },
  { value: "8", label: "Agosto" },
  { value: "9", label: "Setembro" },
  { value: "10", label: "Outubro" },
  { value: "11", label: "Novembro" },
  { value: "12", label: "Dezembro" },
] as const;

export default function ImportarFaturamento() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState<string>("all");

  const utils = trpc.useUtils();
  const refreshRecent = useRefreshFaturamentoRecent();
  const monthNum = month === "all" ? undefined : Number(month);
  const periodFilter = { year, month: monthNum };

  const { data: stats, isLoading: loadingStats } = trpc.faturamento.stats.useQuery(periodFilter);
  const { data: monthBreakdown = [] } = trpc.faturamento.porMes.useQuery({ ano: year });
  const { data: storedRows = [], isLoading: loadingRows } = trpc.faturamento.list.useQuery({
    year,
    month: monthNum,
    limit: 50,
  });
  
  
  const clearMutation = trpc.faturamento.clear.useMutation({
    onSuccess: () => {
      toast.success("Base de faturamento limpa com sucesso!");
      utils.faturamento.stats.invalidate();
      utils.faturamento.list.invalidate();
      utils.faturamento.porMes.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const sqlTestQuery = trpc.faturamento.testSqlConnection.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const syncYearsMutation = trpc.faturamento.syncYears.useMutation({
    onSuccess: () => {
      toast.success("Recarga de 2024 e 2025 iniciada. Pode levar vários minutos.");
      utils.faturamento.syncYearsStatus.invalidate();
    },
    onError: error => toast.error(`Falha ao recarregar anos: ${error.message}`),
  });
  const yearsStatus = trpc.faturamento.syncYearsStatus.useQuery(undefined, {
    refetchInterval: query => (query.state.data?.status === "running" ? 4000 : false),
  });
  const yearsRunning = yearsStatus.data?.status === "running";
  const yearsDoneSeen = useRef<string | null>(null);
  useEffect(() => {
    const status = yearsStatus.data;
    if (!status || status.status === "running" || status.status === "idle") return;
    const stamp = status.finishedAt;
    if (!stamp || yearsDoneSeen.current === stamp) return;
    yearsDoneSeen.current = stamp;
    if (status.status === "done" && status.result) {
      const detail = status.result.years
        .map(year => `${year.year}: ${year.inserted.toLocaleString("pt-BR")}`)
        .join(" · ");
      toast.success(`Anos recarregados. ${detail}`);
      if (status.result.postSync) toastPostSyncAlerts(status.result.postSync);
      utils.faturamento.stats.invalidate();
      utils.faturamento.list.invalidate();
      utils.faturamento.porMes.invalidate();
      return;
    }
    if (status.status === "error") toast.error(status.error || "Falha ao recarregar 2024 e 2025");
  }, [yearsStatus.data, utils]);

  const syncSqlMutation = trpc.faturamento.syncFromSql.useMutation({
    onSuccess: result => {
      toast.success(
        `Carga salva: ${result.inserted.toLocaleString("pt-BR")} registros de ${result.desde} em diante`
      );
      if (result.postSync) toastPostSyncAlerts(result.postSync);
      utils.faturamento.stats.invalidate();
      utils.faturamento.list.invalidate();
      utils.faturamento.porMes.invalidate();
      sqlTestQuery.refetch();
    },
    onError: error => toast.error(`Falha na carga SQL: ${error.message}`),
  });

  const seedCadastrosMutation = trpc.cadastrosSistema.seedFromFaturamento.useMutation({
    onSuccess: result => {
      toast.success(
        `Cadastros: +${result.produtos.created.toLocaleString("pt-BR")} produtos, +${result.clientes.created.toLocaleString("pt-BR")} clientes (${result.coverage.matchPct}% SKUs cobertos)`
      );
      utils.produtos.list.invalidate();
      utils.clientes.list.invalidate();
      utils.dashboard.demanda.invalidate();
    },
    onError: error => toast.error(`Falha ao gerar cadastros: ${error.message}`),
  });

  const yearOptions = [currentYear, currentYear - 1, currentYear - 2];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Faturamento</h1>
          <p className="text-muted-foreground">
            Ao abrir, o S&OP busca notas novas no ERP e mantém só os CFOP de venda e devolução da lista.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={String(year)} onValueChange={value => setYear(Number(value))}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Ano" />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map(y => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Mês" />
            </SelectTrigger>
            <SelectContent>
              {MONTH_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Histórico armazenado — {year}
            {monthNum ? ` / ${MONTH_OPTIONS.find(m => m.value === month)?.label}` : ""}
          </CardTitle>
          <CardDescription>
            Dados salvos no S&OP após a carga do ERP. Última carga:{" "}
            {stats?.lastLoadedAt
              ? new Date(stats.lastLoadedAt).toLocaleString("pt-BR")
              : "ainda não carregado"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {refreshRecent.isPending ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Atualizando notas novas do ERP e removendo CFOP fora da lista...
            </div>
          ) : null}
          {loadingStats ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <div className="grid gap-4 md:grid-cols-4">
              <div className="p-4 border rounded-lg">
                <p className="text-sm text-muted-foreground">Registros no filtro</p>
                <p className="text-2xl font-bold">{stats?.totalRegistros.toLocaleString("pt-BR")}</p>
              </div>
              <div className="p-4 border rounded-lg">
                <p className="text-sm text-muted-foreground">Valor Total</p>
                <p className="text-2xl font-bold">
                  R$ {stats?.totalValor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="p-4 border rounded-lg">
                <p className="text-sm text-muted-foreground">Quantidade Total</p>
                <p className="text-2xl font-bold">{stats?.totalQtd.toLocaleString("pt-BR")}</p>
              </div>
              <div className="p-4 border rounded-lg flex items-center justify-center">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    if (confirm("Tem certeza que deseja limpar toda a base de faturamento?")) {
                      clearMutation.mutate();
                    }
                  }}
                  disabled={clearMutation.isPending || (stats?.totalRegistros ?? 0) === 0}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Limpar Base
                </Button>
              </div>
            </div>
          )}

          {month === "all" && monthBreakdown.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mês</TableHead>
                    <TableHead className="text-right">Registros</TableHead>
                    <TableHead className="text-right">Qtd</TableHead>
                    <TableHead className="text-right">Receita</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthBreakdown.map(row => (
                    <TableRow key={row.mes}>
                      <TableCell>
                        {MONTH_OPTIONS.find(m => m.value === String(row.mes))?.label ?? row.mes}
                      </TableCell>
                      <TableCell className="text-right">
                        {Number(row.registros).toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-right">
                        {Number(row.quantidade).toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-right">
                        R${" "}
                        {Number(row.receita).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setMonth(String(row.mes))}
                        >
                          Filtrar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-lg border">
            {loadingRows ? (
              <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando registros...
              </div>
            ) : storedRows.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                Nenhum registro local neste filtro. Use “Carregar ano do ERP” abaixo.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>NF</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Material</TableHead>
                    <TableHead>Marca</TableHead>
                    <TableHead className="text-right">Qtd</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Tipo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {storedRows.map(row => (
                    <TableRow key={row.id}>
                      <TableCell>
                        {formatCalendarDate(row.dataEmissao)}
                      </TableCell>
                      <TableCell>{row.nfNumero || "-"}</TableCell>
                      <TableCell>{row.codCliente || "-"}</TableCell>
                      <TableCell className="font-mono text-xs">{row.codMaterial || "-"}</TableCell>
                      <TableCell>{row.marca || "-"}</TableCell>
                      <TableCell className="text-right">
                        {Number(row.qtd).toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-right">
                        R${" "}
                        {Number(row.valorTotal).toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                        })}
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.tipoFaturamento === "DEVOLUCAO" ? "destructive" : "default"}>
                          {row.tipoFaturamento || "SAIDA"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          {(stats?.totalRegistros ?? 0) > 50 ? (
            <p className="text-xs text-muted-foreground">
              Mostrando 50 mais recentes de {(stats?.totalRegistros ?? 0).toLocaleString("pt-BR")} no filtro.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            Carregar histórico do ERP
          </CardTitle>
          <CardDescription>
            Uma carga grava o histórico local (desde {sqlTestQuery.data?.desde ?? "2022-01-01"}),
            ano a ano. Depois disso basta filtrar por mês — só rode de novo para atualizar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm space-y-2">
            {sqlTestQuery.isLoading ? (
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Testando conexão com VMDB2\VMDB2...
              </span>
            ) : sqlTestQuery.isError ? (
              <span className="text-destructive">
                Sem conexão com o ERP: {sqlTestQuery.error.message}
              </span>
            ) : (
              <>
                <div className="text-foreground">
                  {sqlTestQuery.data?.message} — {sqlTestQuery.data?.server} /{" "}
                  {sqlTestQuery.data?.database}
                  {sqlTestQuery.data?.desde ? ` · desde ${sqlTestQuery.data.desde}` : ""}
                </div>
                {sqlTestQuery.data?.yearCounts && sqlTestQuery.data.yearCounts.length > 0 ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {sqlTestQuery.data.yearCounts.map(yc => (
                      <Badge key={yc.year} variant="secondary" className="font-normal">
                        {yc.year}: {yc.count.toLocaleString("pt-BR")}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Contagem por ano indisponível ou zerada na view a partir de{" "}
                    {sqlTestQuery.data?.desde ?? "2022-01-01"}.
                  </p>
                )}
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => sqlTestQuery.refetch()}
              disabled={sqlTestQuery.isFetching}
            >
              {sqlTestQuery.isFetching ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Testar conexão
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (
                  confirm(
                    "Isso atualiza o histórico local a partir do MetricsPROD (substitui o período desde 2022-01-01, ano a ano). Continuar?"
                  )
                ) {
                  syncSqlMutation.mutate({ clearBefore: true });
                }
              }}
              disabled={syncSqlMutation.isPending}
            >
              {syncSqlMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Database className="mr-2 h-4 w-4" />
              )}
              Carregar / atualizar do ERP
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (
                  confirm(
                    "Recarrega 2024 e 2025 do ERP com o mesmo ajuste da carga de 2026. 2026 e os demais anos não são apagados. Pode levar vários minutos. Continuar?"
                  )
                ) {
                  syncYearsMutation.mutate({ years: [2024, 2025] });
                }
              }}
              disabled={syncYearsMutation.isPending || syncSqlMutation.isPending || yearsRunning}
            >
              {syncYearsMutation.isPending || yearsRunning ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Recarregar 2024 e 2025
            </Button>
          </div>
          {syncSqlMutation.isPending || yearsRunning ? (
            <Alert>
              <Loader2 className="h-4 w-4 animate-spin" />
              <AlertTitle>Carga em andamento</AlertTitle>
              <AlertDescription>
                {yearsRunning
                  ? "Recarregando 2024 e 2025 no MetricsPROD com o mesmo ajuste de 2026. Os outros anos ficam como estão."
                  : `Buscando faturamento desde ${sqlTestQuery.data?.desde ?? "2022-01-01"} no MetricsPROD (um ano por vez) e gravando na base local. Pode levar vários minutos.`}
              </AlertDescription>
            </Alert>
          ) : null}
          <Alert className="border-muted bg-muted/30">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Runbook faturamento (spec Parte 2)</AlertTitle>
            <AlertDescription className="text-sm space-y-1">
              <p>
                Histórico ERP de <strong>2022-01-01</strong> (<code>ERP_FATURAMENTO_DESDE</code>) até{" "}
                <strong>D-1</strong>, via sync incremental ao abrir a tela e botão &quot;Carregar / atualizar
                do ERP&quot;.
              </p>
              <p>
                Se 2024 ou 2025 estiverem incorretos frente a 2026, use &quot;Recarregar 2024 e 2025&quot;
                (substitui só esses anos; 2026+ intactos). Clientes e vínculos gestor×marca rodam sozinhos após
                cada carga.
              </p>
            </AlertDescription>
          </Alert>
          {syncSqlMutation.data ? (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Carga concluída e persistida</AlertTitle>
              <AlertDescription className="space-y-2">
                <div>
                  Inseridos {syncSqlMutation.data.inserted.toLocaleString("pt-BR")} · desde{" "}
                  {syncSqlMutation.data.desde} · origem {syncSqlMutation.data.source}
                </div>
                {syncSqlMutation.data.years?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {syncSqlMutation.data.years.map(y => (
                      <Badge key={y.year} variant="outline" className="font-normal">
                        {y.year}: {y.inserted.toLocaleString("pt-BR")}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Gerar produtos e clientes do faturamento
          </CardTitle>
          <CardDescription>
            Extrai SKUs e clientes distintos da base local e popula os cadastros (sem duplicar).
            Necessário para previsão e Capacidade × Demanda.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            type="button"
            variant="outline"
            disabled={seedCadastrosMutation.isPending || (stats?.totalRegistros ?? 0) === 0}
            onClick={() => seedCadastrosMutation.mutate({ dryRun: false })}
          >
            {seedCadastrosMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Users className="mr-2 h-4 w-4" />
            )}
            Sincronizar cadastros
          </Button>
          {seedCadastrosMutation.data ? (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Cadastros atualizados</AlertTitle>
              <AlertDescription>
                Produtos: +{seedCadastrosMutation.data.produtos.created.toLocaleString("pt-BR")} novos
                (de {seedCadastrosMutation.data.produtos.distinctInFaturamento.toLocaleString("pt-BR")} SKUs) ·
                Clientes: +{seedCadastrosMutation.data.clientes.created.toLocaleString("pt-BR")} novos
                (de {seedCadastrosMutation.data.clientes.distinctInFaturamento.toLocaleString("pt-BR")}) ·
                cobertura {seedCadastrosMutation.data.coverage.matchPct}%
              </AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <Alert className="border-muted bg-muted/30">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Importação por arquivo desativada</AlertTitle>
        <AlertDescription>
          O histórico de faturamento vem somente do ERP (MetricsPROD). Use a sincronização e, se
          necessário, &quot;Recarregar 2024 e 2025&quot; acima. A única importação manual do S&amp;OP
          é o Excel do CRM na Colaboração Comercial.
        </AlertDescription>
      </Alert>
    </div>
  );
}
