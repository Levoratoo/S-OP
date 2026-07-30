import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Colaborador = "COMERCIAL" | "MARKETING" | "PLANEJAMENTO" | "FINANCEIRO";
type Status = "PENDENTE" | "EM_ANDAMENTO" | "APROVADO" | "REJEITADO";

const statusVariant: Record<Status, "default" | "secondary" | "outline"> = {
  PENDENTE: "secondary",
  EM_ANDAMENTO: "outline",
  APROVADO: "default",
  REJEITADO: "secondary",
};

export default function Colaboracoes() {
  const anoAtual = new Date().getFullYear();
  const [anoInput, setAnoInput] = useState(String(anoAtual));
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    ano: anoAtual,
    ciclo: 1,
    colaborador: "COMERCIAL" as Colaborador,
    status: "PENDENTE" as Status,
    observacoes: "",
  });

  const ano = useMemo(() => Number(anoInput) || anoAtual, [anoInput, anoAtual]);
  const utils = trpc.useUtils();

  const { data: colaboracoes, isLoading } = trpc.colaboracoes.list.useQuery({ ano });

  const createMutation = trpc.colaboracoes.create.useMutation({
    onSuccess: () => {
      utils.colaboracoes.list.invalidate();
      toast.success("Colaboração cadastrada");
      setIsOpen(false);
      setFormData({ ...formData, observacoes: "" });
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = trpc.colaboracoes.delete.useMutation({
    onSuccess: () => {
      utils.colaboracoes.list.invalidate();
      toast.success("Colaboração removida");
    },
    onError: (error) => toast.error(error.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      ano: Number(formData.ano),
      ciclo: Number(formData.ciclo),
      colaborador: formData.colaborador,
      status: formData.status,
      observacoes: formData.observacoes || undefined,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Colaborações</h1>
          <p className="text-muted-foreground">Rodadas de colaboração entre áreas</p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-2">
            <Label htmlFor="ano-colaboracao">Ano</Label>
            <Input id="ano-colaboracao" type="number" className="w-28" value={anoInput} onChange={(e) => setAnoInput(e.target.value)} />
          </div>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" />Nova Colaboração</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Nova Colaboração</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Ano</Label>
                    <Input type="number" value={formData.ano} onChange={(e) => setFormData({ ...formData, ano: Number(e.target.value) })} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Ciclo</Label>
                    <Input type="number" min={1} value={formData.ciclo} onChange={(e) => setFormData({ ...formData, ciclo: Number(e.target.value) })} required />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Colaborador</Label>
                    <Select value={formData.colaborador} onValueChange={(value: Colaborador) => setFormData({ ...formData, colaborador: value })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="COMERCIAL">Comercial</SelectItem>
                        <SelectItem value="MARKETING">Marketing</SelectItem>
                        <SelectItem value="PLANEJAMENTO">Planejamento</SelectItem>
                        <SelectItem value="FINANCEIRO">Financeiro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={formData.status} onValueChange={(value: Status) => setFormData({ ...formData, status: value })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PENDENTE">Pendente</SelectItem>
                        <SelectItem value="EM_ANDAMENTO">Em Andamento</SelectItem>
                        <SelectItem value="APROVADO">Aprovado</SelectItem>
                        <SelectItem value="REJEITADO">Rejeitado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Observações</Label>
                  <Textarea value={formData.observacoes} onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })} rows={4} />
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
        <CardHeader><CardTitle>Colaborações de {ano}</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ano/Ciclo</TableHead>
                  <TableHead>Área</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Observações</TableHead>
                  <TableHead className="w-[80px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!colaboracoes || colaboracoes.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Nenhuma colaboração cadastrada</TableCell></TableRow>
                ) : (
                  colaboracoes.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.ano}/{item.ciclo}</TableCell>
                      <TableCell>{item.colaborador}</TableCell>
                      <TableCell><Badge variant={statusVariant[item.status as Status]}>{item.status}</Badge></TableCell>
                      <TableCell className="max-w-[380px] truncate">{item.observacoes || "-"}</TableCell>
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
