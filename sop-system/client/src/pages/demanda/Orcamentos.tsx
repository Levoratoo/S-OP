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

export default function Orcamentos() {
  const anoAtual = new Date().getFullYear();
  const [anoInput, setAnoInput] = useState(String(anoAtual));
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    ano: anoAtual,
    mes: 1,
    familiaId: "none",
    valorMeta: "",
  });

  const ano = useMemo(() => Number(anoInput) || anoAtual, [anoInput, anoAtual]);
  const utils = trpc.useUtils();

  const { data: orcamentos, isLoading } = trpc.orcamentos.list.useQuery({ ano });
  const { data: familias } = trpc.familias.list.useQuery();

  const createMutation = trpc.orcamentos.create.useMutation({
    onSuccess: () => {
      utils.orcamentos.list.invalidate();
      toast.success("Orçamento cadastrado");
      setIsOpen(false);
      setFormData({ ...formData, valorMeta: "" });
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = trpc.orcamentos.delete.useMutation({
    onSuccess: () => {
      utils.orcamentos.list.invalidate();
      toast.success("Orçamento removido");
    },
    onError: (error) => toast.error(error.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      ano: Number(formData.ano),
      mes: Number(formData.mes),
      familiaId: formData.familiaId === "none" ? null : Number(formData.familiaId),
      valorMeta: formData.valorMeta,
    });
  };

  const familiaNome = (familiaId: number | null) => familias?.find((f) => f.id === familiaId)?.nome || "-";

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Orçamentos</h1>
          <p className="text-muted-foreground">Metas mensais por família</p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-2">
            <Label htmlFor="ano-orcamento">Ano</Label>
            <Input id="ano-orcamento" type="number" className="w-28" value={anoInput} onChange={(e) => setAnoInput(e.target.value)} />
          </div>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" />Novo Orçamento</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Novo Orçamento</DialogTitle></DialogHeader>
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
                    <Label>Valor Meta</Label>
                    <Input type="number" step="0.01" value={formData.valorMeta} onChange={(e) => setFormData({ ...formData, valorMeta: e.target.value })} required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Família</Label>
                  <Select value={formData.familiaId} onValueChange={(value) => setFormData({ ...formData, familiaId: value })}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem família</SelectItem>
                      {familias?.map((f) => <SelectItem key={f.id} value={String(f.id)}>{f.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
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
        <CardHeader><CardTitle>Orçamentos de {ano}</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ano/Mês</TableHead>
                  <TableHead>Família</TableHead>
                  <TableHead className="text-right">Meta</TableHead>
                  <TableHead className="w-[80px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!orcamentos || orcamentos.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">Nenhum orçamento cadastrado</TableCell></TableRow>
                ) : (
                  orcamentos.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.ano}/{MESES[(item.mes || 1) - 1]}</TableCell>
                      <TableCell>{familiaNome(item.familiaId)}</TableCell>
                      <TableCell className="text-right font-medium">R$ {Number(item.valorMeta || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</TableCell>
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
