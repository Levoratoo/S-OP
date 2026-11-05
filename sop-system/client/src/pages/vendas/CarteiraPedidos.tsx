import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { Database, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export default function CarteiraPedidos() {
  const utils = trpc.useUtils();
  const { data: pedidos, isLoading } = trpc.carteiraPedidos.list.useQuery({
    limit: 2000,
    apenasPvAberto: true,
  });
  const { data: produtos } = trpc.produtos.list.useQuery();
  const { data: clientes } = trpc.clientes.list.useQuery();

  const syncErpMutation = trpc.carteiraPedidos.syncFromErp.useMutation({
    onSuccess: r => {
      toast.success(
        `ERP: ${r.importados} linhas (Liberado+PRG) · ${r.fetched} lidas · PV MTO atualizado em ${r.ciclosPv} ciclo(s)`
      );
      if (r.avisos.length) toast.message(`${r.avisos.length} avisos`);
      if (r.erros.length) toast.error(`${r.erros.length} SKUs sem cadastro (veja console)`);
      if (r.erros.length) console.warn("[carteira syncFromErp] erros", r.erros);
      utils.carteiraPedidos.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const produtoNome = (id: number) => produtos?.find(p => p.id === id)?.nome || "-";
  const clienteNome = (id: number | null) =>
    id ? clientes?.find(c => c.id === id)?.razaoSocial || "-" : "-";
  const formatDate = (value: Date | null) =>
    value ? new Date(value).toLocaleDateString("pt-BR") : "-";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Carteira de Pedidos (PV Aberto)</h1>
          <p className="text-muted-foreground">
            Uma linha por pedido × SKU (ERP Liberado + PRG). Sincronização automática — sem importação manual.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => syncErpMutation.mutate()}
          disabled={syncErpMutation.isPending}
        >
          {syncErpMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Atualizar do ERP
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Pedidos em Carteira
          </CardTitle>
          <CardDescription>
            Fonte: ERP MetricsPROD (View_Usr_PedidoVenda_SEOP1) · Liberado + PRG · competência = 1ª
            entrega do SKU no pedido.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Competência</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                  <TableHead className="text-right">Receita</TableHead>
                  <TableHead className="text-center">Faturado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!pedidos || pedidos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      Nenhum pedido na carteira — clique em Atualizar do ERP
                    </TableCell>
                  </TableRow>
                ) : (
                  pedidos.map(item => (
                    <TableRow key={item.id}>
                      <TableCell>
                        {item.codigo}/{item.sequencia}
                      </TableCell>
                      <TableCell>{formatDate(item.competencia)}</TableCell>
                      <TableCell>{produtoNome(item.produtoId)}</TableCell>
                      <TableCell>{clienteNome(item.clienteId)}</TableCell>
                      <TableCell className="text-right">
                        {Number(item.quantidade || 0).toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        R${" "}
                        {Number(item.receitaBruta || 0).toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                        })}
                      </TableCell>
                      <TableCell className="text-center">{item.faturado ? "Sim" : "Não"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
