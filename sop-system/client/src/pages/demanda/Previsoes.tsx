import { useMemo, useState } from "react";
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

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export default function Previsoes() {
  const anoAtual = new Date().getFullYear();
  const [anoInput, setAnoInput] = useState(String(anoAtual));
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    produtoId: "none",
    familiaId: "none",
    ano: anoAtual,
    mes: 1,
    valorPrevisto: "",
    modeloUtilizado: "",
    mape: "",
    wmape: "",
  });

  const ano = useMemo(() => Number(anoInput) || anoAtual, [anoInput, anoAtual]);
  const utils = trpc.useUtils();

  const { data: previsoes, isLoading } = trpc.previsoes.list.useQuery({ ano });
  const { data: produtos } = trpc.produtos.list.useQuery();
  const { data: familias } = trpc.familias.list.useQuery();

  const createMutation = trpc.previsoes.create.useMutation({
    onSuccess: () => {
      utils.previsoes.list.invalidate();
      toast.success("Previsão cadastrada");
      setIsOpen(false);
      setFormData({ ...formData, valorPrevisto: "", modeloUtilizado: "", mape: "", wmape: "" });
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = trpc.previsoes.delete.useMutation({
    onSuccess: () => {
      utils.previsoes.list.invalidate();
      toast.success("Previsão removida");
    },
    onError: (error) => toast.error(error.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      produtoId: formData.produtoId === "none" ? null : Number(formData.produtoId),
      familiaId: formData.familiaId === "none" ? null : Number(formData.familiaId),
      ano: Number(formData.ano),
      mes: Number(formData.mes),
      valorPrevisto: formData.valorPrevisto,
      modeloUtilizado: formData.modeloUtilizado || undefined,
      mape: formData.mape || undefined,
      wmape: formData.wmape || undefined,
    });
  };

  const produtoNome = (id: number | null) => produtos?.find((p) => p.id === id)?.nome || "-";
  const familiaNome = (id: number | null) => familias?.find((f) => f.id === id)?.nome || "-";

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Previsões</h1>
          <p className="text-muted-foreground">Base mensal de previsões da demanda</p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-2">
            <Label htmlFor="ano-previsoes">Ano</Label>
            <Input id="ano-previsoes" type="number" className="w-28" value={anoInput} onChange={(e) => setAnoInput(e.target.value)} />
          </div>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" />Nova Previsão</Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle>Nova Previsão</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label>Ano</Label>
                    <Input type="number" value={formData.ano} onChange={(e) => setFormData({ ...formData, ano: Number(e.target.value) })} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Mês</Label>
                    <Input type="number" min={1} max={12} value={formData.mes} onChange={(e) => setFormData({ ...formData, mes: Number(e.target.value) })} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Valor Previsto</Label>
                    <Input type="number" step="0.01" value={formData.valorPrevisto} onChange={(e) => setFormData({ ...formData, valorPrevisto: e.target.value })} required />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Produto (opcional)</Label>
                    <Select value={formData.produtoId} onValueChange={(value) => setFormData({ ...formData, produtoId: value })}>
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum</SelectItem>
                        {produtos?.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.nome || p.codItem || `Produto ${p.id}`}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Família (opcional)</Label>
                    <Select value={formData.familiaId} onValueChange={(value) => setFormData({ ...formData, familiaId: value })}>
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhuma</SelectItem>
                        {familias?.map((f) => <SelectItem key={f.id} value={String(f.id)}>{f.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label>Modelo</Label>
                    <Input value={formData.modeloUtilizado} onChange={(e) => setFormData({ ...formData, modeloUtilizado: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>MAPE</Label>
                    <Input type="number" step="0.01" value={formData.mape} onChange={(e) => setFormData({ ...formData, mape: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>WMAPE</Label>
                    <Input type="number" step="0.01" value={formData.wmape} onChange={(e) => setFormData({ ...formData, wmape: e.target.value })} />
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
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Registros de {ano}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Competência</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Família</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">MAPE</TableHead>
                  <TableHead className="text-right">WMAPE</TableHead>
                  <TableHead className="w-[80px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!previsoes || previsoes.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Nenhuma previsão cadastrada</TableCell></TableRow>
                ) : (
                  previsoes.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.ano}/{MESES[(item.mes || 1) - 1]}</TableCell>
                      <TableCell>{produtoNome(item.produtoId)}</TableCell>
                      <TableCell>{familiaNome(item.familiaId)}</TableCell>
                      <TableCell className="text-right">R$ {Number(item.valorPrevisto || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell className="text-right">{item.mape ? `${Number(item.mape).toFixed(2)}%` : "-"}</TableCell>
                      <TableCell className="text-right">{item.wmape ? `${Number(item.wmape).toFixed(2)}%` : "-"}</TableCell>
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
