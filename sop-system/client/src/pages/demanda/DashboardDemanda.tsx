import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { Loader2, TrendingUp, Package, Target } from "lucide-react";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function fmtPercent(value: number | null | undefined) {
  if (value === null || value === undefined) return "--";
  return `${value.toFixed(2)}%`;
}

export default function DashboardDemanda() {
  const anoAtual = new Date().getFullYear();
  const { data: dashboardData, isLoading: loadingDashboard } = trpc.dashboard.demanda.useQuery();
  const { data: vendasMes, isLoading: loadingVendas } = trpc.dashboard.vendasPorMes.useQuery({ ano: anoAtual });
  const { data: acuracidade, isLoading: loadingAcuracidade } = trpc.dashboard.acuracidade.useQuery({ ano: anoAtual });

  const chartData = vendasMes?.map((v) => ({
    mes: MESES[v.mes - 1],
    receita: parseFloat(v.receita) / 1000,
    quantidade: parseInt(v.quantidade),
  })) || [];

  const isLoading = loadingDashboard || loadingVendas || loadingAcuracidade;

  const stats = [
    { title: "Total de Produtos", value: dashboardData?.totalProdutos ?? 0, icon: Package, color: "text-blue-600", bgColor: "bg-blue-100" },
    { title: "Total de Clientes", value: dashboardData?.totalClientes ?? 0, icon: Target, color: "text-green-600", bgColor: "bg-green-100" },
    { title: "Total de Vendas", value: dashboardData?.totalVendas ?? 0, icon: TrendingUp, color: "text-purple-600", bgColor: "bg-purple-100" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard de Demanda</h1>
        <p className="text-muted-foreground">Analise de previsao e historico de demanda</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            {stats.map((stat) => (
              <Card key={stat.title}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
                  <div className={`p-2 rounded-lg ${stat.bgColor}`}><stat.icon className={`h-4 w-4 ${stat.color}`} /></div>
                </CardHeader>
                <CardContent><div className="text-2xl font-bold">{stat.value.toLocaleString("pt-BR")}</div></CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Receita Mensal</CardTitle>
                <CardDescription>Receita bruta por mes (em milhares R$)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="mes" className="text-xs" />
                      <YAxis className="text-xs" />
                      <Tooltip formatter={(value: number) => [`R$ ${value.toFixed(0)}k`, "Receita"]} />
                      <Bar dataKey="receita" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Quantidade Vendida</CardTitle>
                <CardDescription>Unidades vendidas por mes</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="mes" className="text-xs" />
                      <YAxis className="text-xs" />
                      <Tooltip formatter={(value: number) => [value.toLocaleString("pt-BR"), "Quantidade"]} />
                      <Line type="monotone" dataKey="quantidade" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ fill: "hsl(var(--primary))" }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Indicadores de Acuracidade</CardTitle>
              <CardDescription>Metricas de precisao da previsao de demanda</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-5">
                <div className="p-4 border rounded-lg">
                  <p className="text-sm text-muted-foreground">MAPE</p>
                  <p className="text-2xl font-bold">{fmtPercent(acuracidade?.mape)}</p>
                  <p className="text-xs text-muted-foreground">Mean Absolute Percentage Error</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <p className="text-sm text-muted-foreground">WMAPE</p>
                  <p className="text-2xl font-bold">{fmtPercent(acuracidade?.wmape)}</p>
                  <p className="text-xs text-muted-foreground">Weighted MAPE</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <p className="text-sm text-muted-foreground">Bias</p>
                  <p className="text-2xl font-bold">{fmtPercent(acuracidade?.bias)}</p>
                  <p className="text-xs text-muted-foreground">Tendencia da previsao</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <p className="text-sm text-muted-foreground">Acuracidade</p>
                  <p className="text-2xl font-bold">{fmtPercent(acuracidade?.acuracidade)}</p>
                  <p className="text-xs text-muted-foreground">1 - WMAPE</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <p className="text-sm text-muted-foreground">IROG Medio</p>
                  <p className="text-2xl font-bold">{fmtPercent(acuracidade?.irog)}</p>
                  <p className="text-xs text-muted-foreground">Meta media de producao</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
