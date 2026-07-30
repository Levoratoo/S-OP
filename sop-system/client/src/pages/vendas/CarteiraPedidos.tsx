import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

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
  const { data: pedidos, isLoading } = trpc.carteiraPedidos.list.useQuery({ limit: 200 });
  const { data: produtos } = trpc.produtos.list.useQuery();
  const { data: clientes } = trpc.clientes.list.useQuery();

  const createMutation = trpc.carteiraPedidos.create.useMutation({
    onSuccess: () => {
      utils.carteiraPedidos.list.invalidate();
      toast.success("Pedido incluído na carteira");
      setIsOpen(false);
      setFormData({ ...formData, codigo: "", quantidade: "", receitaBruta: "" });
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = trpc.carteiraPedidos.delete.useMutation({
    onSuccess: () => {
      utils.carteiraPedidos.list.invalidate();
      toast.success("Pedido removido da carteira");
    },
    onError: (error) => toast.error(error.message),
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

  const produtoNome = (id: number) => produtos?.find((p) => p.id === id)?.nome || "-";
  const clienteNome = (id: number | null) => (id ? clientes?.find((c) => c.id === id)?.razaoSocial || "-" : "-");
  const formatDate = (value: Date | null) => (value ? new Date(value).toLocaleDateString("pt-BR") : "-");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Carteira de Pedidos</h1>
          <p className="text-muted-foreground">Pedidos confirmados e pendentes de faturamento</p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Novo Pedido</Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader><DialogTitle>Novo Pedido na Carteira</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label>Código</Label>
                  <Input value={formData.codigo} onChange={(e) => setFormData({ ...formData, codigo: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Sequência</Label>
                  <Input type="number" value={formData.sequencia} onChange={(e) => setFormData({ ...formData, sequencia: Number(e.target.value) })} required />
                </div>
                <div className="space-y-2">
                  <Label>Competência</Label>
                  <Input type="date" value={formData.competencia} onChange={(e) => setFormData({ ...formData, competencia: e.target.value })} required />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Produto</Label>
                  <Select value={formData.produtoId} onValueChange={(value) => setFormData({ ...formData, produtoId: value })}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Selecione</SelectItem>
                      {produtos?.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.nome || p.codItem || `Produto ${p.id}`}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Cliente</Label>
                  <Select value={formData.clienteId} onValueChange={(value) => setFormData({ ...formData, clienteId: value })}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem cliente</SelectItem>
                      {clientes?.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.razaoSocial}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Quantidade</Label>
                  <Input type="number" step="0.01" value={formData.quantidade} onChange={(e) => setFormData({ ...formData, quantidade: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Receita Bruta (R$)</Label>
                  <Input type="number" step="0.01" value={formData.receitaBruta} onChange={(e) => setFormData({ ...formData, receitaBruta: e.target.value })} required />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Salvar
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle>Pedidos em Carteira</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
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
                  <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Nenhum pedido na carteira</TableCell></TableRow>
                ) : (
                  pedidos.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.codigo}/{item.sequencia}</TableCell>
                      <TableCell>{formatDate(item.competencia)}</TableCell>
                      <TableCell>{produtoNome(item.produtoId)}</TableCell>
                      <TableCell>{clienteNome(item.clienteId)}</TableCell>
                      <TableCell className="text-right">{Number(item.quantidade || 0).toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="text-right font-medium">R$ {Number(item.receitaBruta || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell className="text-center">{item.faturado ? "Sim" : "Não"}</TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate({ id: item.id })}>
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
