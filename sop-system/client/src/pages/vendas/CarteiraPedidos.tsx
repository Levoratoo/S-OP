import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PvMtoPivotTable, type PvPivotRow } from "@/components/pv/PvMtoPivotTable";
import { trpc } from "@/lib/trpc";
import { Database, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export default function CarteiraPedidos() {
  const [search, setSearch] = useState("");
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.carteiraPedidos.pivotGrade.useQuery();
  const { data: pedidos } = trpc.carteiraPedidos.list.useQuery({
    limit: 5000,
    apenasPvAberto: true,
  });

  const syncErpMutation = trpc.carteiraPedidos.syncFromErp.useMutation({
    onSuccess: r => {
      toast.success(
        `ERP: ${r.importados} linhas (Liberado+PRG) · ${r.fetched} lidas · PV MTO atualizado em ${r.ciclosPv} ciclo(s)`
      );
      if (r.avisos.length) toast.message(`${r.avisos.length} avisos`);
      if (r.erros.length) toast.error(`${r.erros.length} SKUs sem cadastro`);
      utils.carteiraPedidos.list.invalidate();
      utils.carteiraPedidos.pivotGrade.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const rows: PvPivotRow[] = useMemo(
    () =>
      (data?.rows ?? []).map(r => ({
        marca: r.marca,
        codItem: r.codItem,
        descricao: r.descricao,
        tipo: r.tipo,
        precoUnitario: r.precoUnitario,
        precoOrigem: r.precoOrigem,
        numPedido: r.numPedido,
        meses: r.meses,
        quantidadeTotal: r.quantidadeTotal,
        receitaTotal: r.receitaTotal,
        cliente: r.cliente,
        faturado: r.faturado,
        semCadastro: r.semCadastro,
      })),
    [data?.rows]
  );

  const listTotals = useMemo(() => {
    let q = 0;
    let rs = 0;
    for (const p of pedidos ?? []) {
      q += Number(p.quantidade || 0);
      rs += Number(p.receitaBruta || 0);
    }
    return { q, rs };
  }, [pedidos]);

  return (
    <div className="min-w-0 max-w-full space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Carteira de Pedidos (PV Aberto)</h1>
          <p className="text-muted-foreground">
            Pivot PV: pedido × SKU × preço, quantidades por mês de entrega (DataEntrega).
          </p>
        </div>
        <Button type="button" onClick={() => syncErpMutation.mutate()} disabled={syncErpMutation.isPending}>
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
            Fonte: ERP MetricsPROD (View_Usr_PedidoVenda_SEOP1) · Liberado + PRG · entregas gravadas por mês
            (carteira_pv_entregas). Nº Pedido = NumPedido (sem /sequencia — a sequência era a ordem do SKU dentro do
            pedido na lista antiga).
            {data?.conferencia ? (
              <span className="block mt-1 text-xs text-muted-foreground space-y-0.5">
                <span className="block">
                  Pivot (entregas por mês): {data.grandQuantidade.toLocaleString("pt-BR")} un · R${" "}
                  {data.grandReceita.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} · lista cadastrada{" "}
                  {listTotals.q.toLocaleString("pt-BR")} un · R${" "}
                  {listTotals.rs.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
                <span className="block">
                  Receita pivot: R$ ERP{" "}
                  {(data.conferencia.receitaErpPivot ?? 0).toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                  })}{" "}
                  + estimada (fallback preço) R${" "}
                  {(data.conferencia.receitaEstimadaPivot ?? 0).toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                  })}
                </span>
                {data.conferencia.semCadastroSkuCount ? (
                  <span className="block">
                    {data.conferencia.semCadastroSkuCount} SKU(s) sem cadastro na pivot (
                    {data.conferencia.semCadastroQuantidade.toLocaleString("pt-BR")} un · R${" "}
                    {data.conferencia.semCadastroReceita.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}).{" "}
                    {data.conferencia.explicacaoDiferencaLista}
                  </span>
                ) : null}
              </span>
            ) : null}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="w-full max-w-sm space-y-1">
            <Label>Buscar</Label>
            <Input placeholder="Marca, SKU, pedido…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <PvMtoPivotTable
              horizonLabels={data?.horizonLabels ?? []}
              rows={rows}
              searchGlobal={search}
              exportFileName="carteira-pv-pivot"
              emptyMessage="Nenhum pedido na carteira — clique em Atualizar do ERP"
              showClienteFaturado
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}