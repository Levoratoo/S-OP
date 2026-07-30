import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { Plus, Loader2, Upload, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";

export default function HistoricoVendas() {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    nfNumero: "",
    dataNf: new Date().toISOString().split("T")[0],
    quantidade: "",
    receitaBruta: "",
    produtoId: 0,
    clienteId: null as number | null,
  });

  const utils = trpc.useUtils();
  const { data: vendas, isLoading } = trpc.vendas.list.useQuery({ limit: 100 });
  const { data: produtos } = trpc.produtos.list.useQuery();
  const { data: clientes } = trpc.clientes.list.useQuery();
  
  const createMutation = trpc.vendas.create.useMutation({
    onSuccess: () => {
      utils.vendas.list.invalidate();
      toast.success("Venda registrada!");
      resetForm();
    },
    onError: (error) => toast.error(error.message),
  });

  const resetForm = () => {
    setFormData({ nfNumero: "", dataNf: new Date().toISOString().split("T")[0], quantidade: "", receitaBruta: "", produtoId: 0, clienteId: null });
    setIsOpen(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  const getProdutoNome = (id: number) => produtos?.find(p => p.id === id)?.nome || "-";
  const getClienteNome = (id: number | null) => id ? clientes?.find(c => c.id === id)?.razaoSocial || "-" : "-";

  const formatCurrency = (value: string | null) => {
    if (!value) return "-";
    return `R$ ${parseFloat(value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
  };

  const formatDate = (date: Date | null) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("pt-BR");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Histórico de Vendas</h1>
          <p className="text-muted-foreground">Registro de notas fiscais e vendas</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => toast.info("Funcionalidade em desenvolvimento")}>
            <Upload className="h-4 w-4 mr-2" />
            Importar
          </Button>
          <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Nova Venda</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Registrar Venda</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Nº NF</Label>
                    <Input value={formData.nfNumero} onChange={(e) => setFormData({ ...formData, nfNumero: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Data NF</Label>
                    <Input type="date" value={formData.dataNf} onChange={(e) => setFormData({ ...formData, dataNf: e.target.value })} required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Produto</Label>
                  <Select value={formData.produtoId.toString()} onValueChange={(v) => setFormData({ ...formData, produtoId: parseInt(v) })}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>{produtos?.map((p) => <SelectItem key={p.id} value={p.id.toString()}>{p.nome}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Cliente</Label>
                  <Select value={formData.clienteId?.toString() || "none"} onValueChange={(v) => setFormData({ ...formData, clienteId: v === "none" ? null : parseInt(v) })}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {clientes?.map((c) => <SelectItem key={c.id} value={c.id.toString()}>{c.razaoSocial}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
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
                  <Button type="button" variant="outline" onClick={resetForm}>Cancelar</Button>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Registrar
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
            <FileSpreadsheet className="h-5 w-5" />
            Vendas Registradas
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>NF</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                  <TableHead className="text-right">Receita</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vendas?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Nenhuma venda registrada
                    </TableCell>
                  </TableRow>
                ) : vendas?.map((venda) => (
                  <TableRow key={venda.id}>
                    <TableCell className="font-mono">{venda.nfNumero || "-"}</TableCell>
                    <TableCell>{formatDate(venda.dataNf)}</TableCell>
                    <TableCell>{getProdutoNome(venda.produtoId)}</TableCell>
                    <TableCell>{getClienteNome(venda.clienteId)}</TableCell>
                    <TableCell className="text-right">{parseFloat(venda.quantidade || "0").toLocaleString("pt-BR")}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(venda.receitaBruta)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
