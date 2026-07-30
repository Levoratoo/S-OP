import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Loader2, Factory, Gauge, Clock } from "lucide-react";

export default function DashboardCapacidade() {
  const { data: recursos, isLoading } = trpc.recursos.list.useQuery();
  const { data: linhas } = trpc.linhas.list.useQuery();

  const getLinhaName = (linhaId: number | null) => {
    if (!linhaId || !linhas) return "Sem linha";
    const linha = linhas.find(l => l.id === linhaId);
    return linha?.nome || "Sem linha";
  };

  const stats = [
    { title: "Total de Recursos", value: recursos?.length ?? 0, icon: Factory, color: "text-blue-600", bgColor: "bg-blue-100" },
    { title: "Recursos Ativos", value: recursos?.filter(r => r.ativo).length ?? 0, icon: Gauge, color: "text-green-600", bgColor: "bg-green-100" },
    { title: "Intermediários", value: recursos?.filter(r => r.tipo === "Intermediário").length ?? 0, icon: Clock, color: "text-purple-600", bgColor: "bg-purple-100" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard de Capacidade</h1>
        <p className="text-muted-foreground">Análise de capacidade produtiva</p>
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
                <CardContent><div className="text-2xl font-bold">{typeof stat.value === "number" ? stat.value.toLocaleString("pt-BR") : stat.value}</div></CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Recursos por Tipo</CardTitle>
              <CardDescription>Equipamentos cadastrados por tipo e linha</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recursos?.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Nenhum recurso cadastrado</p>
                ) : recursos?.map((recurso) => (
                  <div key={recurso.id} className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="font-medium">{recurso.nome}</p>
                        <p className="text-sm text-muted-foreground">{recurso.tipo}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">{recurso.linhaProducao || "-"}</p>
                        <p className={`text-xs ${recurso.ativo ? "text-green-600" : "text-red-600"}`}>
                          {recurso.ativo ? "Ativo" : "Inativo"}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
