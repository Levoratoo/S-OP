import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Package, Users, ShoppingCart, TrendingUp, Factory, BarChart3 } from "lucide-react";

export default function Home() {
  const { data: dashboardData, isLoading } = trpc.dashboard.demanda.useQuery();

  const stats = [
    {
      title: "Total de Produtos",
      value: dashboardData?.totalProdutos ?? 0,
      icon: Package,
      color: "text-blue-600",
      bgColor: "bg-blue-100",
    },
    {
      title: "Total de Clientes",
      value: dashboardData?.totalClientes ?? 0,
      icon: Users,
      color: "text-green-600",
      bgColor: "bg-green-100",
    },
    {
      title: "Total de Vendas",
      value: dashboardData?.totalVendas ?? 0,
      icon: ShoppingCart,
      color: "text-purple-600",
      bgColor: "bg-purple-100",
    },
  ];

  const modules = [
    {
      title: "Previsão de Demanda",
      description: "Dashboard de demanda, acuracidade e colaborações",
      icon: TrendingUp,
      href: "/demanda/dashboard",
      color: "text-orange-600",
      bgColor: "bg-orange-100",
    },
    {
      title: "Análise de Capacidade",
      description: "Dashboard de capacidade produtiva e IROG",
      icon: Factory,
      href: "/capacidade/dashboard",
      color: "text-cyan-600",
      bgColor: "bg-cyan-100",
    },
    {
      title: "Gestão de Vendas",
      description: "Histórico de vendas, carteira e forecast",
      icon: BarChart3,
      href: "/vendas/dashboard",
      color: "text-pink-600",
      bgColor: "bg-pink-100",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Visão geral do sistema de Sales & Operations Planning
        </p>
      </div>

      {/* Stats Cards */}
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

      {/* Modules */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Módulos</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {modules.map((module) => (
            <Card 
              key={module.title} 
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => window.location.href = module.href}
            >
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className={`p-3 rounded-lg ${module.bgColor}`}>
                    <module.icon className={`h-6 w-6 ${module.color}`} />
                  </div>
                  <div>
                    <CardTitle className="text-base">{module.title}</CardTitle>
                    <CardDescription className="text-xs mt-1">
                      {module.description}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Cadastros Rápidos</h2>
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4 lg:grid-cols-5">
          {[
            { label: "Marcas", href: "/cadastros/gestor-marca" },
            { label: "Produtos", href: "/cadastros/produtos" },
            { label: "Clientes", href: "/cadastros/clientes" },
            { label: "Recursos", href: "/cadastros/recursos" },
            { label: "Membros", href: "/cadastros/membros" },
          ].map((item) => (
            <Card 
              key={item.label}
              className="cursor-pointer hover:bg-accent transition-colors"
              onClick={() => window.location.href = item.href}
            >
              <CardContent className="p-4 text-center">
                <span className="text-sm font-medium">{item.label}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
