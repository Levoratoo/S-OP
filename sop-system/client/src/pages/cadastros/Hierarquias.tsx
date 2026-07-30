import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function Hierarquias() {
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({ codigo: "", mercado: "", canalVenda: "", forcaVenda: "", zonaVenda: "", ativo: true });

  const utils = trpc.useUtils();
  const { data: hierarquias, isLoading } = trpc.hierarquias.list.useQuery();
  
  const createMutation = trpc.hierarquias.create.useMutation({
    onSuccess: () => { utils.hierarquias.list.invalidate(); toast.success("Hierarquia criada!"); resetForm(); },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = trpc.hierarquias.update.useMutation({
    onSuccess: () => { utils.hierarquias.list.invalidate(); toast.success("Hierarquia atualizada!"); resetForm(); },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = trpc.hierarquias.delete.useMutation({
    onSuccess: () => { utils.hierarquias.list.invalidate(); toast.success("Hierarquia excluída!"); },
    onError: (error) => toast.error(error.message),
  });

  const resetForm = () => { setFormData({ codigo: "", mercado: "", canalVenda: "", forcaVenda: "", zonaVenda: "", ativo: true }); setEditingId(null); setIsOpen(false); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) updateMutation.mutate({ id: editingId, ...formData });
    else createMutation.mutate(formData);
  };

  const handleEdit = (h: NonNullable<typeof hierarquias>[0]) => {
    setFormData({ codigo: h.codigo, mercado: h.mercado || "", canalVenda: h.canalVenda || "", forcaVenda: h.forcaVenda || "", zonaVenda: h.zonaVenda || "", ativo: h.ativo });
    setEditingId(h.id);
    setIsOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Hierarquias</h1>
          <p className="text-muted-foreground">Estrutura comercial de vendas</p>
        </div>
        <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Nova Hierarquia</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editingId ? "Editar Hierarquia" : "Nova Hierarquia"}</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2"><Label>Código</Label><Input value={formData.codigo} onChange={(e) => setFormData({ ...formData, codigo: e.target.value })} required /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Mercado</Label><Input value={formData.mercado} onChange={(e) => setFormData({ ...formData, mercado: e.target.value })} /></div>
                <div className="space-y-2"><Label>Canal de Venda</Label><Input value={formData.canalVenda} onChange={(e) => setFormData({ ...formData, canalVenda: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Força de Venda</Label><Input value={formData.forcaVenda} onChange={(e) => setFormData({ ...formData, forcaVenda: e.target.value })} /></div>
                <div className="space-y-2"><Label>Zona de Venda</Label><Input value={formData.zonaVenda} onChange={(e) => setFormData({ ...formData, zonaVenda: e.target.value })} /></div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={resetForm}>Cancelar</Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>{(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{editingId ? "Atualizar" : "Criar"}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle>Lista de Hierarquias</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div> : (
            <Table>
              <TableHeader><TableRow><TableHead>Código</TableHead><TableHead>Mercado</TableHead><TableHead>Canal</TableHead><TableHead>Força</TableHead><TableHead>Zona</TableHead><TableHead>Status</TableHead><TableHead className="w-[100px]">Ações</TableHead></TableRow></TableHeader>
              <TableBody>
                {hierarquias?.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhuma hierarquia cadastrada</TableCell></TableRow> : hierarquias?.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="font-mono">{h.codigo}</TableCell>
                    <TableCell>{h.mercado || "-"}</TableCell>
                    <TableCell>{h.canalVenda || "-"}</TableCell>
                    <TableCell>{h.forcaVenda || "-"}</TableCell>
                    <TableCell>{h.zonaVenda || "-"}</TableCell>
                    <TableCell><Badge variant={h.ativo ? "default" : "secondary"}>{h.ativo ? "Ativo" : "Inativo"}</Badge></TableCell>
                    <TableCell><div className="flex gap-1"><Button size="icon" variant="ghost" onClick={() => handleEdit(h)}><Pencil className="h-4 w-4" /></Button><AlertDialog><AlertDialogTrigger asChild><Button size="icon" variant="ghost"><Trash2 className="h-4 w-4 text-destructive" /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Confirmar exclusão</AlertDialogTitle><AlertDialogDescription>Tem certeza que deseja excluir a hierarquia <strong>{h.codigo}</strong>? Esta ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => deleteMutation.mutate({ id: h.id })} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div></TableCell>
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
