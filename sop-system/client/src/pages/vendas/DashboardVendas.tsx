import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from "recharts";
import { Loader2, DollarSign, ShoppingCart, TrendingUp, Users, MapPin, Tag, Package, AlertCircle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAccessControl } from "@/hooks/useAccessControl";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16"];

export default function DashboardVendas() {
  const ano = new Date().getFullYear();
  const { 
    nivelAcesso, 
    podeVerTodasMarcas, 
    marcasPermitidas, 
    isLoading: loadingAccess,
    isGestor,
    isGerenteComercial,
    isMaster
  } = useAccessControl();

  const { data: dashboardData, isLoading: loadingDashboard } = trpc.dashboard.demanda.useQuery();
  const { data: vendasMes, isLoading: loadingVendas } = trpc.dashboard.vendasPorMesConsolidadas.useQuery({ ano });
  const { data: vendasMarca, isLoading: loadingMarca } = trpc.dashboard.vendasPorMarca.useQuery({ ano });
  const { data: vendasLinha, isLoading: loadingLinha } = trpc.dashboard.vendasPorLinha.useQuery({ ano });
  const { data: vendasUF, isLoading: loadingUF } = trpc.dashboard.vendasPorUF.useQuery({ ano });
  const { data: marcas = [] } = trpc.marcas.list.useQuery();

  // Filtrar dados por marcas permitidas se for Gestor (nível 1)
  const filtrarPorMarcas = <T extends Record<string, any>>(data: T[] | undefined): T[] => {
    if (!data) return [];
    if (podeVerTodasMarcas) return data;
    
    // Obter nomes das marcas permitidas
    const marcasNomes = marcas
      .filter((m: any) => marcasPermitidas.includes(m.id))
      .map((m: any) => m.nome?.toLowerCase());
    
    return data.filter(item => {
      if (!item.marca) return false;
      return marcasNomes.includes(item.marca.toLowerCase());
    });
  };

  // Aplicar filtros
  const vendasMarcaFiltradas = filtrarPorMarcas(vendasMarca);
  const vendasLinhaFiltradas = filtrarPorMarcas(vendasLinha);
  const vendasUFFiltradas = filtrarPorMarcas(vendasUF);

  const chartData = vendasMes?.map(v => ({
    mes: MESES[v.mes - 1],
    receita: parseFloat(v.receita) / 1000,
    quantidade: parseInt(v.quantidade),
  })) || [];

  const totalReceita = chartData.reduce((acc, v) => acc + v.receita * 1000, 0);
  const totalQuantidade = chartData.reduce((acc, v) => acc + v.quantidade, 0);

  const marcaData = vendasMarcaFiltradas?.map((m, i) => ({
    name: m.marca || 'Sem marca',
    value: parseFloat(m.receita),
    color: COLORS[i % COLORS.length],
  })) || [];

  const linhaData = vendasLinhaFiltradas?.map(l => ({
    linha: l.linha || 'Sem linha',
    receita: parseFloat(l.receita) / 1000,
    quantidade: parseInt(l.quantidade),
  })) || [];

  const ufData = vendasUFFiltradas?.slice(0, 10).map(u => ({
    uf: u.uf || 'N/A',
    receita: parseFloat(u.receita) / 1000,
    quantidade: parseInt(u.quantidade),
  })) || [];

  const isLoading = loadingDashboard || loadingVendas || loadingMarca || loadingLinha || loadingUF || loadingAccess;

  const stats = [
    { title: "Receita Total", value: `R$ ${(totalReceita / 1000).toFixed(0)}k`, icon: DollarSign, color: "text-green-600", bgColor: "bg-green-100" },
    { title: "Quantidade Vendida", value: totalQuantidade.toLocaleString("pt-BR"), icon: ShoppingCart, color: "text-blue-600", bgColor: "bg-blue-100" },
    { title: "Total de Clientes", value: dashboardData?.totalClientes ?? 0, icon: Users, color: "text-purple-600", bgColor: "bg-purple-100" },
    { title: "Ticket Médio", value: totalQuantidade > 0 ? `R$ ${(totalReceita / totalQuantidade).toFixed(2)}` : "--", icon: TrendingUp, color: "text-orange-600", bgColor: "bg-orange-100" },
  ];

  // Obter nomes das marcas permitidas para exibição
  const marcasNomesPermitidas = marcas
    .filter((m: any) => marcasPermitidas.includes(m.id))
    .map((m: any) => m.nome);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard de Vendas</h1>
          <p className="text-muted-foreground">Análise de faturamento e performance comercial - Dados consolidados com De-Para</p>
        </div>
        <div className="flex items-center gap-2">
          {isGestor && (
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
              Nível 1 - Gestor
            </Badge>
          )}
          {isGerenteComercial && (
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
              Nível 2 - Gerente Comercial
            </Badge>
          )}
          {isMaster && (
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
              Nível 3 - Master/Admin
            </Badge>
          )}
        </div>
      </div>

      {/* Alerta para Gestores sobre filtro de marcas */}
      {isGestor && !loadingAccess && (
        <Alert className="border-blue-200 bg-blue-50">
          <AlertCircle className="h-4 w-4 text-blue-600" />
          <AlertTitle className="text-blue-800">Visualização Filtrada</AlertTitle>
          <AlertDescription className="text-blue-700">
            Você está visualizando dados apenas das suas marcas: {marcasNomesPermitidas.length > 0 
              ? marcasNomesPermitidas.join(", ") 
              : "Nenhuma marca vinculada. Entre em contato com o administrador."}
          </AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            {stats.map((stat) => (
              <Card key={stat.title}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
                  <div className={`p-2 rounded-lg ${stat.bgColor}`}><stat.icon className={`h-4 w-4 ${stat.color}`} /></div>
                </CardHeader>
                <CardContent><div className="text-2xl font-bold">{typeof stat.value === "number" ? stat.value.toLocaleString("pt-BR") : stat.value}</div></CardContent>
              </Card>
            ))}
          </div>

          <Tabs defaultValue="mensal" className="space-y-4">
            <TabsList>
              <TabsTrigger value="mensal">Visão Mensal</TabsTrigger>
              <TabsTrigger value="marca">Por Marca</TabsTrigger>
              <TabsTrigger value="linha">Por Linha</TabsTrigger>
              <TabsTrigger value="regiao">Por Região</TabsTrigger>
            </TabsList>

            <TabsContent value="mensal" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Faturamento Mensal</CardTitle>
                    <CardDescription>Receita bruta por mês (em milhares R$)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="mes" className="text-xs" />
                          <YAxis className="text-xs" />
                          <Tooltip formatter={(value: number) => [`R$ ${value.toFixed(0)}k`, "Receita"]} />
                          <Bar dataKey="receita" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Quantidade por Mês</CardTitle>
                    <CardDescription>Unidades vendidas mensalmente</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="mes" className="text-xs" />
                          <YAxis className="text-xs" />
                          <Tooltip formatter={(value: number) => [value.toLocaleString("pt-BR"), "Quantidade"]} />
                          <Line type="monotone" dataKey="quantidade" stroke="#10b981" strokeWidth={2} dot={{ fill: "#10b981" }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="marca" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Tag className="h-5 w-5" /> Receita por Marca</CardTitle>
                    <CardDescription>
                      {podeVerTodasMarcas ? "Top 10 marcas por faturamento" : `Marcas vinculadas (${marcaData.length})`}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {marcaData.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-[350px] text-muted-foreground">
                        <Tag className="h-12 w-12 mb-4 opacity-50" />
                        <p>Nenhum dado disponível</p>
                        {isGestor && <p className="text-sm">Verifique suas marcas vinculadas</p>}
                      </div>
                    ) : (
                      <div className="h-[350px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={marcaData}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={100}
                              paddingAngle={2}
                              dataKey="value"
                              label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                              labelLine={false}
                            >
                              {marcaData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value: number) => [`R$ ${(value / 1000).toFixed(0)}k`, "Receita"]} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Detalhamento por Marca</CardTitle>
                    <CardDescription>Valores absolutos de faturamento</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {marcaData.length === 0 ? (
                      <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                        Nenhum dado disponível
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {marcaData.map((marca, i) => (
                          <div key={i} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: marca.color }} />
                              <span className="text-sm font-medium">{marca.name}</span>
                            </div>
                            <span className="text-sm text-muted-foreground">R$ {(marca.value / 1000).toFixed(0)}k</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="linha" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Package className="h-5 w-5" /> Faturamento por Linha de Produto</CardTitle>
                  <CardDescription>Receita e quantidade por linha</CardDescription>
                </CardHeader>
                <CardContent>
                  {linhaData.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-[400px] text-muted-foreground">
                      <Package className="h-12 w-12 mb-4 opacity-50" />
                      <p>Nenhum dado disponível</p>
                    </div>
                  ) : (
                    <div className="h-[400px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={linhaData} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis type="number" className="text-xs" />
                          <YAxis dataKey="linha" type="category" className="text-xs" width={100} />
                          <Tooltip formatter={(value: number) => [`R$ ${value.toFixed(0)}k`, "Receita"]} />
                          <Legend />
                          <Bar dataKey="receita" name="Receita (R$ mil)" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="regiao" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5" /> Faturamento por UF</CardTitle>
                  <CardDescription>Top 10 estados por receita</CardDescription>
                </CardHeader>
                <CardContent>
                  {ufData.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-[400px] text-muted-foreground">
                      <MapPin className="h-12 w-12 mb-4 opacity-50" />
                      <p>Nenhum dado disponível</p>
                    </div>
                  ) : (
                    <div className="h-[400px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={ufData}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="uf" className="text-xs" />
                          <YAxis className="text-xs" />
                          <Tooltip formatter={(value: number) => [`R$ ${value.toFixed(0)}k`, "Receita"]} />
                          <Bar dataKey="receita" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
