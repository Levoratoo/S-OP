import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { Loader2, Target, TrendingUp, Gauge, BarChart3, Factory } from "lucide-react";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "--";
  return `${value.toFixed(2)}%`;
}

function formatMoney(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "-";
  return `R$ ${parsed.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function Acuracidade() {
  const [anoInput, setAnoInput] = useState(String(new Date().getFullYear()));
  const ano = useMemo(() => Number(anoInput) || new Date().getFullYear(), [anoInput]);

  const { data: indicadores, isLoading: loadingIndicadores, refetch } = trpc.dashboard.acuracidade.useQuery({ ano });
  const { data: previsoes, isLoading: loadingPrevisoes } = trpc.previsoes.list.useQuery({ ano });

  const isLoading = loadingIndicadores || loadingPrevisoes;

  const cards = [
    { title: "MAPE", value: formatPercent(indicadores?.mape), icon: BarChart3, bg: "bg-blue-100", color: "text-blue-700" },
    { title: "WMAPE", value: formatPercent(indicadores?.wmape), icon: TrendingUp, bg: "bg-amber-100", color: "text-amber-700" },
    { title: "Bias", value: formatPercent(indicadores?.bias), icon: Gauge, bg: "bg-purple-100", color: "text-purple-700" },
    { title: "Acuracidade", value: formatPercent(indicadores?.acuracidade), icon: Target, bg: "bg-green-100", color: "text-green-700" },
    { title: "IROG Médio", value: formatPercent(indicadores?.irog), icon: Factory, bg: "bg-cyan-100", color: "text-cyan-700" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Acuracidade da Demanda</h1>
          <p className="text-muted-foreground">Indicadores consolidados de previsão e produção</p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-2">
            <Label htmlFor="ano-acuracidade">Ano</Label>
            <Input
              id="ano-acuracidade"
              type="number"
              value={anoInput}
              onChange={(e) => setAnoInput(e.target.value)}
              className="w-28"
            />
          </div>
          <Button variant="outline" onClick={() => refetch()}>
            Atualizar
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-5">
            {cards.map((card) => (
              <Card key={card.title}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
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
                        Nenhuma previsão encontrada para este ano
                      </TableCell>
                    </TableRow>
                  ) : (
                    previsoes.slice(0, 50).map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.ano}/{MESES[(item.mes || 1) - 1]}</TableCell>
                        <TableCell>{item.produtoId ?? "-"}</TableCell>
                        <TableCell>{item.familiaId ?? "-"}</TableCell>
                        <TableCell className="text-right">{formatMoney(item.valorPrevisto)}</TableCell>
                        <TableCell className="text-right">{formatPercent(item.mape ? Number(item.mape) : null)}</TableCell>
                        <TableCell className="text-right">{formatPercent(item.wmape ? Number(item.wmape) : null)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
