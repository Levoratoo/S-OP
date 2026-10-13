import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { Database, Loader2, Plus, RefreshCw, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

function cell(row: Record<string, unknown>, ...keys: string[]) {
  for (const k of keys) {
    if (row[k] != null && String(row[k]).trim() !== "") return String(row[k]).trim();
    const found = Object.keys(row).find(h => h.trim().toLowerCase() === k.toLowerCase());
    if (found && row[found] != null && String(row[found]).trim() !== "") {
      return String(row[found]).trim();
    }
  }
  return "";
}

export default function CarteiraPedidos() {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    codigo: "",
    sequencia: 1,
    competencia: new Date().toISOString().split("T")[0],
    quantidade: "",
    receitaBruta: "",
    produtoId: "none",
    clienteId: "none",
    faturado: false,
  });

  const utils = trpc.useUtils();
  const { data: pedidos, isLoading } = trpc.carteiraPedidos.list.useQuery({ limit: 2000 });
  const { data: produtos } = trpc.produtos.list.useQuery();
  const { data: clientes } = trpc.clientes.list.useQuery();

  const createMutation = trpc.carteiraPedidos.create.useMutation({
    onSuccess: () => {
      utils.carteiraPedidos.list.invalidate();
      toast.success("Pedido incluído na carteira");
      setIsOpen(false);
      setFormData({ ...formData, codigo: "", quantidade: "", receitaBruta: "" });
    },
    onError: error => toast.error(error.message),
  });

  const deleteMutation = trpc.carteiraPedidos.delete.useMutation({
    onSuccess: () => {
      utils.carteiraPedidos.list.invalidate();
      toast.success("Pedido removido da carteira");
    },
    onError: error => toast.error(error.message),
  });

  const syncErpMutation = trpc.carteiraPedidos.syncFromErp.useMutation({
    onSuccess: r => {
      toast.success(
        `ERP: ${r.importados} linhas (Liberado+PRG) · ${r.fetched} lidas · ${r.removidosAbertos} abertos substituídos`
      );
      if (r.avisos.length) toast.message(`${r.avisos.length} avisos`);
      if (r.erros.length) toast.error(`${r.erros.length} SKUs sem cadastro (veja console)`);
      if (r.erros.length) console.warn("[carteira syncFromErp] erros", r.erros);
      utils.carteiraPedidos.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const importMutation = trpc.carteiraPedidos.importBySku.useMutation({
    onSuccess: r => {
      toast.success(`Importação manual: ${r.importados} pedidos`);
      if (r.avisos.length) toast.message(`${r.avisos.length} avisos`);
      if (r.erros.length) toast.error(`${r.erros.length} erros (SKU/competência)`);
      utils.carteiraPedidos.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.produtoId === "none") {
      toast.error("Selecione um produto");
      return;
    }

    createMutation.mutate({
      codigo: formData.codigo,
      sequencia: Number(formData.sequencia),
      competencia: formData.competencia,
      quantidade: formData.quantidade,
      receitaBruta: formData.receitaBruta,
      produtoId: Number(formData.produtoId),
      clienteId: formData.clienteId === "none" ? null : Number(formData.clienteId),
      faturado: formData.faturado,
    });
  };

  const handleImportFile = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      const rows = json
        .map(row => {
          const sku = cell(row, "SKU", "Cod Item", "CodItem", "Codigo Item", "Material", "codMaterial");
          const competenciaRaw =
            cell(row, "Competencia", "Competência", "Data", "Mes", "Mês", "Prev Entrega") ||
            (row["Competencia"] instanceof Date
              ? (row["Competencia"] as Date).toISOString().slice(0, 10)
              : "");
          let competencia = competenciaRaw;
          if (row["Competencia"] instanceof Date) {
            competencia = (row["Competencia"] as Date).toISOString().slice(0, 10);
          } else if (row["Competência"] instanceof Date) {
            competencia = (row["Competência"] as Date).toISOString().slice(0, 10);
          }
          return {
            codigo: cell(row, "Codigo", "Código", "Pedido", "OV", "Ordem") || sku,
            sequencia: Number(cell(row, "Sequencia", "Sequência", "Seq") || "1") || 1,
            competencia,
            sku,
            quantidade: cell(row, "Quantidade", "Qtde", "Qtd", "Qtde Aberta") || "0",
            receitaBruta: cell(row, "Receita", "Receita Bruta", "Valor", "R$") || "0",
            faturado: /^(s|sim|1|true|x)$/i.test(cell(row, "Faturado")),
          };
        })
        .filter(r => r.sku && r.competencia);
      if (!rows.length) {
        toast.error("Nenhuma linha válida (precisa SKU + Competência)");
        return;
      }
      importMutation.mutate(rows);
    } catch (e) {
      toast.error(`Falha ao ler Excel: ${String(e)}`);
    }
  };

  const produtoNome = (id: number) => produtos?.find(p => p.id === id)?.nome || "-";
  const clienteNome = (id: number | null) =>
    id ? clientes?.find(c => c.id === id)?.razaoSocial || "-" : "-";
  const formatDate = (value: Date | null) =>
    value ? new Date(value).toLocaleDateString("pt-BR") : "-";

  const syncPending = syncErpMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Carteira de Pedidos (PV Aberto)</h1>
          <p className="text-muted-foreground">
            Pedidos Liberado + PRG direto do ERP → Sync PV_MTO na Colaboração Comercial
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => syncErpMutation.mutate()}
            disabled={syncPending}
          >
            {syncPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Atualizar do ERP
          </Button>
          <Label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm text-muted-foreground hover:bg-accent">
            {importMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Importar Excel (legado)
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              disabled={importMutation.isPending}
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) void handleImportFile(f);
                e.target.value = "";
              }}
            />
          </Label>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Plus className="mr-2 h-4 w-4" />
                Novo Pedido
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle>Novo Pedido na Carteira</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label>Código</Label>
                    <Input
                      value={formData.codigo}
                      onChange={e => setFormData({ ...formData, codigo: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Sequência</Label>
                    <Input
                      type="number"
                      value={formData.sequencia}
                      onChange={e =>
                        setFormData({ ...formData, sequencia: Number(e.target.value) })
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Competência</Label>
                    <Input
                      type="date"
                      value={formData.competencia}
                      onChange={e => setFormData({ ...formData, competencia: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Produto</Label>
                    <Select
                      value={formData.produtoId}
                      onValueChange={value => setFormData({ ...formData, produtoId: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Selecione</SelectItem>
                        {produtos?.map(p => (
                          <SelectItem key={p.id} value={String(p.id)}>
                            {p.nome || p.codItem || `Produto ${p.id}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Cliente</Label>
                    <Select
                      value={formData.clienteId}
                      onValueChange={value => setFormData({ ...formData, clienteId: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem cliente</SelectItem>
                        {clientes?.map(c => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.razaoSocial}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Quantidade</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.quantidade}
                      onChange={e => setFormData({ ...formData, quantidade: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Receita Bruta (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.receitaBruta}
                      onChange={e => setFormData({ ...formData, receitaBruta: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Salvar
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Pedidos em Carteira
          </CardTitle>
          <CardDescription>
            Fonte: ERP MetricsPROD (View_Usr_PedidoVenda_SEOP1) · filtros Liberado + PRG ·
            competência = mês da DataEntrega. Depois: Colaboração → Resumos → Sync PV da Carteira.
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
                  <TableHead className="w-[80px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!pedidos || pedidos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
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
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteMutation.mutate({ id: item.id })}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
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
