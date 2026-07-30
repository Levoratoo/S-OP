import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Plus, Pencil, Trash2, Loader2, Download } from "lucide-react";
import { exportToCsv } from "@/lib/exportCsv";
import { toast } from "sonner";

export default function Paradas() {
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({ nome: "", programada: false, tempoMinutos: 0 });

  const utils = trpc.useUtils();
  const { data: paradas, isLoading } = trpc.paradas.list.useQuery();
  
  const createMutation = trpc.paradas.create.useMutation({
    onSuccess: () => { utils.paradas.list.invalidate(); toast.success("Parada criada!"); resetForm(); },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = trpc.paradas.update.useMutation({
    onSuccess: () => { utils.paradas.list.invalidate(); toast.success("Parada atualizada!"); resetForm(); },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = trpc.paradas.delete.useMutation({
    onSuccess: () => { utils.paradas.list.invalidate(); toast.success("Parada excluída!"); },
    onError: (error) => toast.error(error.message),
  });

  const resetForm = () => { setFormData({ nome: "", programada: false, tempoMinutos: 0 }); setEditingId(null); setIsOpen(false); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) updateMutation.mutate({ id: editingId, ...formData });
    else createMutation.mutate(formData);
  };

  const handleEdit = (p: NonNullable<typeof paradas>[0]) => {
    setFormData({ nome: p.nome, programada: p.programada ?? false, tempoMinutos: p.tempoMinutos || 0 });
    setEditingId(p.id);
    setIsOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Paradas</h1>
          <p className="text-muted-foreground">Tipos de paradas de produção</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => {
            if (paradas && paradas.length > 0) {
              exportToCsv(paradas, "paradas", [
                { key: "nome", title: "Nome" },
                { key: "tempoMinutos", title: "Tempo (min)" },
                { key: "programada", title: "Programada" },
              ]);
            } else {
              toast.error("Não há dados para exportar");
            }
          }}><Download className="h-4 w-4 mr-2" />Exportar CSV</Button>
          <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Nova Parada</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editingId ? "Editar Parada" : "Nova Parada"}</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2"><Label>Nome</Label><Input value={formData.nome} onChange={(e) => setFormData({ ...formData, nome: e.target.value })} required /></div>
                <div className="space-y-2"><Label>Tempo (minutos)</Label><Input type="number" value={formData.tempoMinutos} onChange={(e) => setFormData({ ...formData, tempoMinutos: parseInt(e.target.value) })} /></div>
                <div className="flex items-center gap-2">
                  <Switch checked={formData.programada} onCheckedChange={(checked) => setFormData({ ...formData, programada: checked })} />
                  <Label>Parada Programada</Label>
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
        <CardHeader><CardTitle>Lista de Paradas</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div> : (
            <Table>
              <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Tempo</TableHead><TableHead>Tipo</TableHead><TableHead className="w-[100px]">Ações</TableHead></TableRow></TableHeader>
              <TableBody>
                {paradas?.length === 0 ? <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nenhuma parada cadastrada</TableCell></TableRow> : paradas?.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.nome}</TableCell>
                    <TableCell>{p.tempoMinutos} min</TableCell>
                    <TableCell><Badge variant={p.programada ? "default" : "secondary"}>{p.programada ? "Programada" : "Não Programada"}</Badge></TableCell>
                    <TableCell><div className="flex gap-1"><Button size="icon" variant="ghost" onClick={() => handleEdit(p)}><Pencil className="h-4 w-4" /></Button><AlertDialog><AlertDialogTrigger asChild><Button size="icon" variant="ghost"><Trash2 className="h-4 w-4 text-destructive" /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Confirmar exclusão</AlertDialogTitle><AlertDialogDescription>Tem certeza que deseja excluir a parada <strong>{p.nome}</strong>? Esta ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => deleteMutation.mutate({ id: p.id })} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div></TableCell>
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
