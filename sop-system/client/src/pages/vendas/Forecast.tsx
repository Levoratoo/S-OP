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

export default function Forecast() {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    codigo: "",
    competencia: new Date().toISOString().split("T")[0],
    canalVenda: "",
    clienteId: "none",
    receitaBruta: "",
  });

  const utils = trpc.useUtils();
  const { data: forecasts, isLoading } = trpc.forecasts.list.useQuery({ limit: 200 });
  const { data: clientes } = trpc.clientes.list.useQuery();

  const createMutation = trpc.forecasts.create.useMutation({
    onSuccess: () => {
      utils.forecasts.list.invalidate();
      toast.success("Forecast cadastrado");
      setIsOpen(false);
      setFormData({ ...formData, codigo: "", receitaBruta: "", canalVenda: "" });
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = trpc.forecasts.delete.useMutation({
    onSuccess: () => {
      utils.forecasts.list.invalidate();
      toast.success("Forecast removido");
    },
    onError: (error) => toast.error(error.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      codigo: formData.codigo || undefined,
      competencia: formData.competencia,
      canalVenda: formData.canalVenda || undefined,
      clienteId: formData.clienteId === "none" ? null : Number(formData.clienteId),
      receitaBruta: formData.receitaBruta,
    });
  };

  const formatDate = (value: Date | null) => (value ? new Date(value).toLocaleDateString("pt-BR") : "-");
  const clienteNome = (id: number | null) => (id ? clientes?.find((c) => c.id === id)?.razaoSocial || "-" : "-");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Forecast</h1>
          <p className="text-muted-foreground">Projeções de receita por cliente e canal</p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Novo Forecast</Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader><DialogTitle>Novo Forecast</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Código</Label>
                  <Input value={formData.codigo} onChange={(e) => setFormData({ ...formData, codigo: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Competência</Label>
                  <Input type="date" value={formData.competencia} onChange={(e) => setFormData({ ...formData, competencia: e.target.value })} required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Canal de Venda</Label>
                  <Input value={formData.canalVenda} onChange={(e) => setFormData({ ...formData, canalVenda: e.target.value })} />
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
              <div className="space-y-2">
                <Label>Receita Bruta (R$)</Label>
                <Input type="number" step="0.01" value={formData.receitaBruta} onChange={(e) => setFormData({ ...formData, receitaBruta: e.target.value })} required />
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
        <CardHeader><CardTitle>Registros de Forecast</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Competência</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Receita</TableHead>
                  <TableHead className="w-[80px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!forecasts || forecasts.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Nenhum forecast cadastrado</TableCell></TableRow>
                ) : (
                  forecasts.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.codigo || "-"}</TableCell>
                      <TableCell>{formatDate(item.competencia)}</TableCell>
                      <TableCell>{item.canalVenda || "-"}</TableCell>
                      <TableCell>{clienteNome(item.clienteId)}</TableCell>
                      <TableCell className="text-right font-medium">R$ {Number(item.receitaBruta || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</TableCell>
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
