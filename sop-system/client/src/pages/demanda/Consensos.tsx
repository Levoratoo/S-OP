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

type Status = "ABERTO" | "EM_REVISAO" | "APROVADO" | "FECHADO";

const statusVariant: Record<Status, "default" | "secondary" | "outline"> = {
  ABERTO: "secondary",
  EM_REVISAO: "outline",
  APROVADO: "default",
  FECHADO: "secondary",
};

export default function Consensos() {
  const anoAtual = new Date().getFullYear();
  const [anoInput, setAnoInput] = useState(String(anoAtual));
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    ano: anoAtual,
    ciclo: 1,
    status: "ABERTO" as Status,
    dataAprovacao: "",
    observacoes: "",
  });

  const ano = useMemo(() => Number(anoInput) || anoAtual, [anoInput, anoAtual]);
  const utils = trpc.useUtils();

  const { data: consensos, isLoading } = trpc.consensos.list.useQuery({ ano });

  const createMutation = trpc.consensos.create.useMutation({
    onSuccess: () => {
      utils.consensos.list.invalidate();
      toast.success("Consenso cadastrado");
      setIsOpen(false);
      setFormData({ ...formData, observacoes: "", dataAprovacao: "" });
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = trpc.consensos.delete.useMutation({
    onSuccess: () => {
      utils.consensos.list.invalidate();
      toast.success("Consenso removido");
    },
    onError: (error) => toast.error(error.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      ano: Number(formData.ano),
      ciclo: Number(formData.ciclo),
      status: formData.status,
      dataAprovacao: formData.dataAprovacao || undefined,
      observacoes: formData.observacoes || undefined,
    });
  };

  const formatDate = (value: Date | null) => (value ? new Date(value).toLocaleDateString("pt-BR") : "-");

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Consensos</h1>
          <p className="text-muted-foreground">Fechamentos de consenso por ciclo</p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-2">
            <Label htmlFor="ano-consenso">Ano</Label>
            <Input id="ano-consenso" type="number" className="w-28" value={anoInput} onChange={(e) => setAnoInput(e.target.value)} />
          </div>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" />Novo Consenso</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Novo Consenso</DialogTitle></DialogHeader>
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
                    <Label>Status</Label>
                    <Select value={formData.status} onValueChange={(value: Status) => setFormData({ ...formData, status: value })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ABERTO">Aberto</SelectItem>
                        <SelectItem value="EM_REVISAO">Em Revisão</SelectItem>
                        <SelectItem value="APROVADO">Aprovado</SelectItem>
                        <SelectItem value="FECHADO">Fechado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Data de Aprovação</Label>
                    <Input type="date" value={formData.dataAprovacao} onChange={(e) => setFormData({ ...formData, dataAprovacao: e.target.value })} />
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
        <CardHeader><CardTitle>Consensos de {ano}</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ano/Ciclo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data Aprovação</TableHead>
                  <TableHead>Observações</TableHead>
                  <TableHead className="w-[80px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!consensos || consensos.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Nenhum consenso cadastrado</TableCell></TableRow>
                ) : (
                  consensos.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.ano}/{item.ciclo}</TableCell>
                      <TableCell><Badge variant={statusVariant[item.status as Status]}>{item.status}</Badge></TableCell>
                      <TableCell>{formatDate(item.dataAprovacao)}</TableCell>
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
