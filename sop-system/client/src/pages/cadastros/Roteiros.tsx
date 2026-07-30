import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { Plus, Pencil, Trash2, Loader2, Download } from "lucide-react";
import { exportToCsv } from "@/lib/exportCsv";
import { toast } from "sonner";

export default function Roteiros() {
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({ produtoId: 0, sequencia: 1, atividade: "", recursoId: null as number | null, tempoOperacaoMin: 0 });

  const utils = trpc.useUtils();
  const { data: roteiros, isLoading } = trpc.roteiros.list.useQuery();
  const { data: produtos } = trpc.produtos.list.useQuery();
  const { data: recursos } = trpc.recursos.list.useQuery();
  
  const createMutation = trpc.roteiros.create.useMutation({
    onSuccess: () => { utils.roteiros.list.invalidate(); toast.success("Roteiro criado!"); resetForm(); },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = trpc.roteiros.update.useMutation({
    onSuccess: () => { utils.roteiros.list.invalidate(); toast.success("Roteiro atualizado!"); resetForm(); },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = trpc.roteiros.delete.useMutation({
    onSuccess: () => { utils.roteiros.list.invalidate(); toast.success("Roteiro excluído!"); },
    onError: (error) => toast.error(error.message),
  });

  const resetForm = () => { setFormData({ produtoId: 0, sequencia: 1, atividade: "", recursoId: null, tempoOperacaoMin: 0 }); setEditingId(null); setIsOpen(false); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) updateMutation.mutate({ id: editingId, ...formData });
    else createMutation.mutate(formData);
  };

  const getProdutoNome = (id: number) => produtos?.find(p => p.id === id)?.nome || "-";
  const getRecursoNome = (id: number | null) => id ? recursos?.find(r => r.id === id)?.nome || "-" : "-";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Roteiros</h1>
          <p className="text-muted-foreground">Defina os roteiros de produção</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => {
            if (roteiros && roteiros.length > 0) {
              exportToCsv(roteiros, "roteiros", [
                { key: "produtoId", title: "Produto ID" },
                { key: "sequencia", title: "Sequência" },
                { key: "atividade", title: "Atividade" },
                { key: "tempoOperacaoMin", title: "Tempo (min)" },
              ]);
            } else {
              toast.error("Não há dados para exportar");
            }
          }}><Download className="h-4 w-4 mr-2" />Exportar CSV</Button>
          <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Novo Roteiro</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editingId ? "Editar Roteiro" : "Novo Roteiro"}</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Produto</Label>
                <Select value={formData.produtoId.toString()} onValueChange={(v) => setFormData({ ...formData, produtoId: parseInt(v) })}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>{produtos?.map((p) => <SelectItem key={p.id} value={p.id.toString()}>{p.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Sequência</Label><Input type="number" value={formData.sequencia} onChange={(e) => setFormData({ ...formData, sequencia: parseInt(e.target.value) })} /></div>
                <div className="space-y-2"><Label>Tempo (min)</Label><Input type="number" value={formData.tempoOperacaoMin} onChange={(e) => setFormData({ ...formData, tempoOperacaoMin: parseInt(e.target.value) })} /></div>
              </div>
              <div className="space-y-2"><Label>Atividade</Label><Input value={formData.atividade} onChange={(e) => setFormData({ ...formData, atividade: e.target.value })} required /></div>
              <div className="space-y-2">
                <Label>Recurso</Label>
                <Select value={formData.recursoId?.toString() || "none"} onValueChange={(v) => setFormData({ ...formData, recursoId: v === "none" ? null : parseInt(v) })}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent><SelectItem value="none">Nenhum</SelectItem>{recursos?.map((r) => <SelectItem key={r.id} value={r.id.toString()}>{r.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={resetForm}>Cancelar</Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>{(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{editingId ? "Atualizar" : "Criar"}</Button>
              </div>
            </form>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Lista de Roteiros</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div> : (
            <Table>
              <TableHeader><TableRow><TableHead>Produto</TableHead><TableHead>Seq</TableHead><TableHead>Atividade</TableHead><TableHead>Recurso</TableHead><TableHead>Tempo</TableHead><TableHead className="w-[100px]">Ações</TableHead></TableRow></TableHeader>
              <TableBody>
                {roteiros?.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum roteiro cadastrado</TableCell></TableRow> : roteiros?.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{getProdutoNome(r.produtoId)}</TableCell>
                    <TableCell>{r.sequencia}</TableCell>
                    <TableCell>{r.atividade}</TableCell>
                    <TableCell>{getRecursoNome(r.recursoId)}</TableCell>
                    <TableCell>{r.tempoOperacaoMin} min</TableCell>
                    <TableCell><div className="flex gap-1"><Button size="icon" variant="ghost" onClick={() => { setFormData({ produtoId: r.produtoId, sequencia: r.sequencia, atividade: r.atividade, recursoId: r.recursoId, tempoOperacaoMin: r.tempoOperacaoMin || 0 }); setEditingId(r.id); setIsOpen(true); }}><Pencil className="h-4 w-4" /></Button><AlertDialog><AlertDialogTrigger asChild><Button size="icon" variant="ghost"><Trash2 className="h-4 w-4 text-destructive" /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Confirmar exclusão</AlertDialogTitle><AlertDialogDescription>Tem certeza que deseja excluir este roteiro? Esta ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => deleteMutation.mutate({ id: r.id })} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div></TableCell>
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
