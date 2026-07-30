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

export default function MetasProducao() {
  const anoAtual = new Date().getFullYear();
  const [anoInput, setAnoInput] = useState(String(anoAtual));
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    ano: anoAtual,
    mes: 1,
    recursoId: "none",
    disponibilidadeMeta: "",
    performanceMeta: "",
    qualidadeMeta: "",
    irogMeta: "",
  });

  const ano = useMemo(() => Number(anoInput) || anoAtual, [anoInput, anoAtual]);
  const utils = trpc.useUtils();

  const { data: metas, isLoading } = trpc.metasProducao.list.useQuery({ ano });
  const { data: recursos } = trpc.recursos.list.useQuery();

  const createMutation = trpc.metasProducao.create.useMutation({
    onSuccess: () => {
      utils.metasProducao.list.invalidate();
      utils.dashboard.acuracidade.invalidate();
      toast.success("Meta de produção cadastrada");
      setIsOpen(false);
      setFormData({
        ...formData,
        disponibilidadeMeta: "",
        performanceMeta: "",
        qualidadeMeta: "",
        irogMeta: "",
      });
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = trpc.metasProducao.delete.useMutation({
    onSuccess: () => {
      utils.metasProducao.list.invalidate();
      utils.dashboard.acuracidade.invalidate();
      toast.success("Meta de produção removida");
    },
    onError: (error) => toast.error(error.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.recursoId === "none") {
      toast.error("Selecione um recurso");
      return;
    }

    createMutation.mutate({
      ano: Number(formData.ano),
      mes: Number(formData.mes),
      recursoId: Number(formData.recursoId),
      disponibilidadeMeta: formData.disponibilidadeMeta || undefined,
      performanceMeta: formData.performanceMeta || undefined,
      qualidadeMeta: formData.qualidadeMeta || undefined,
      irogMeta: formData.irogMeta || undefined,
    });
  };

  const recursoNome = (id: number) => recursos?.find((r) => r.id === id)?.nome || `Recurso ${id}`;
  const fmtPercent = (value: string | null) => (value ? `${Number(value).toFixed(2)}%` : "-");

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Metas de Produção</h1>
          <p className="text-muted-foreground">Disponibilidade, performance, qualidade e IROG</p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-2">
            <Label htmlFor="ano-metas">Ano</Label>
            <Input id="ano-metas" type="number" className="w-28" value={anoInput} onChange={(e) => setAnoInput(e.target.value)} />
          </div>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" />Nova Meta</Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl">
              <DialogHeader><DialogTitle>Nova Meta de Produção</DialogTitle></DialogHeader>
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
                    <Label>Recurso</Label>
                    <Select value={formData.recursoId} onValueChange={(value) => setFormData({ ...formData, recursoId: value })}>
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Selecione</SelectItem>
                        {recursos?.map((r) => <SelectItem key={r.id} value={String(r.id)}>{r.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Disponibilidade (%)</Label>
                    <Input type="number" step="0.01" value={formData.disponibilidadeMeta} onChange={(e) => setFormData({ ...formData, disponibilidadeMeta: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Performance (%)</Label>
                    <Input type="number" step="0.01" value={formData.performanceMeta} onChange={(e) => setFormData({ ...formData, performanceMeta: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Qualidade (%)</Label>
                    <Input type="number" step="0.01" value={formData.qualidadeMeta} onChange={(e) => setFormData({ ...formData, qualidadeMeta: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>IROG (%)</Label>
                    <Input type="number" step="0.01" value={formData.irogMeta} onChange={(e) => setFormData({ ...formData, irogMeta: e.target.value })} />
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
        <CardHeader><CardTitle>Metas de {ano}</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ano/Mês</TableHead>
                  <TableHead>Recurso</TableHead>
                  <TableHead className="text-right">Disp.</TableHead>
                  <TableHead className="text-right">Perf.</TableHead>
                  <TableHead className="text-right">Qual.</TableHead>
                  <TableHead className="text-right">IROG</TableHead>
                  <TableHead className="w-[80px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!metas || metas.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Nenhuma meta cadastrada</TableCell></TableRow>
                ) : (
                  metas.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.ano}/{MESES[(item.mes || 1) - 1]}</TableCell>
                      <TableCell>{recursoNome(item.recursoId)}</TableCell>
                      <TableCell className="text-right">{fmtPercent(item.disponibilidadeMeta)}</TableCell>
                      <TableCell className="text-right">{fmtPercent(item.performanceMeta)}</TableCell>
                      <TableCell className="text-right">{fmtPercent(item.qualidadeMeta)}</TableCell>
                      <TableCell className="text-right font-medium">{fmtPercent(item.irogMeta)}</TableCell>
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
