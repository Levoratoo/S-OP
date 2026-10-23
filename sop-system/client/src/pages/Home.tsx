import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import {
  Package,
  Users,
  FileSpreadsheet,
  TrendingUp,
  Play,
  TableProperties,
  Target,
  Route,
  Calendar,
} from "lucide-react";
import { useLocation } from "wouter";

export default function Home() {
  const [, setLocation] = useLocation();
  const { data: dashboardData, isLoading } = trpc.dashboard.demanda.useQuery();

  const stats = [
    {
      title: "Produtos",
      value: dashboardData?.totalProdutos ?? 0,
      icon: Package,
      color: "text-blue-600",
      bgColor: "bg-blue-100",
    },
    {
      title: "Clientes",
      value: dashboardData?.totalClientes ?? 0,
      icon: Users,
      color: "text-green-600",
      bgColor: "bg-green-100",
    },
    {
      title: "Registros de venda",
      value: dashboardData?.totalVendas ?? 0,
      icon: FileSpreadsheet,
      color: "text-purple-600",
      bgColor: "bg-purple-100",
    },
  ];

  const steps = [
    {
      step: "1",
      title: "Cadastros + Skus Projetar",
      description: "Produtos, De-Para e lista de SKUs que entram na estatística",
      icon: Package,
      href: "/cadastros/skus-projetar",
      color: "text-slate-700",
      bgColor: "bg-slate-100",
    },
    {
      step: "2",
      title: "Bases / Faturamento",
      description: "Atualizar faturamento (Jan/2020 até o mês fechado anterior)",
      icon: FileSpreadsheet,
      href: "/vendas/importar",
      color: "text-blue-700",
      bgColor: "bg-blue-100",
    },
    {
      step: "3",
      title: "Rodar Previsão Python",
      description: "Tratamento das bases + script estatístico v5.2",
      icon: Play,
      href: "/previsao-python",
      color: "text-orange-700",
      bgColor: "bg-orange-100",
    },
    {
      step: "4",
      title: "Relatório Estatístico",
      description: "Visão executiva e resultado do job",
      icon: TableProperties,
      href: "/previsao-python/ciclo-13",
      color: "text-amber-700",
      bgColor: "bg-amber-100",
    },
    {
      step: "5",
      title: "Colaboração Comercial",
      description: "Ciclo S&OP — MTS, JITO, PV e CRM",
      icon: TrendingUp,
      href: "/demanda/colaboracoes",
      color: "text-emerald-700",
      bgColor: "bg-emerald-100",
    },
    {
      step: "6",
      title: "Acuracidade",
      description: "Previsto × realizado (MAPE / WMAPE / BIAS)",
      icon: Target,
      href: "/demanda/acuracidade",
      color: "text-rose-700",
      bgColor: "bg-rose-100",
    },
  ];

  const atalhos = [
    { label: "Skus Projetar", href: "/cadastros/skus-projetar", icon: Target },
    { label: "De-Para", href: "/cadastros/depara", icon: Route },
    { label: "Sazonalidade Marca", href: "/cadastros/sazonalidade-marca", icon: Calendar },
    { label: "Gestor × Marca", href: "/cadastros/gestor-marca", icon: Users },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Previsão de Demanda</h1>
        <p className="text-muted-foreground">
          Fluxo mensal S&OP: cadastros → bases → script Python → colaboração comercial
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {isLoading ? (
                  <div className="h-8 w-16 bg-muted animate-pulse rounded" />
                ) : (
                  stat.value.toLocaleString("pt-BR")
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-4">Passo a passo do ciclo</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {steps.map((item) => (
            <Card
              key={item.step}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setLocation(item.href)}
            >
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className={`p-3 rounded-lg ${item.bgColor}`}>
                    <item.icon className={`h-6 w-6 ${item.color}`} />
                  </div>
                  <div>
                    <CardTitle className="text-base">
                      <span className="text-muted-foreground mr-1">{item.step}.</span>
                      {item.title}
                    </CardTitle>
                    <CardDescription className="text-xs mt-1">
                      {item.description}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-4">Cadastros do processo</h2>
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          {atalhos.map((item) => (
            <Card
              key={item.label}
              className="cursor-pointer hover:bg-accent transition-colors"
              onClick={() => setLocation(item.href)}
            >
              <CardContent className="p-4 flex items-center gap-2 justify-center">
                <item.icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{item.label}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
