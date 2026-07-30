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
import { Plus, Pencil, Trash2, Loader2, Download } from "lucide-react";
import { exportToCsv } from "@/lib/exportCsv";
import { toast } from "sonner";

export default function Membros() {
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({ nome: "", funcao: "", email: "", areaEmpresa: "", ativo: true });

  const utils = trpc.useUtils();
  const { data: membros, isLoading } = trpc.membros.list.useQuery();
  
  const createMutation = trpc.membros.create.useMutation({
    onSuccess: () => { utils.membros.list.invalidate(); toast.success("Membro criado!"); resetForm(); },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = trpc.membros.update.useMutation({
    onSuccess: () => { utils.membros.list.invalidate(); toast.success("Membro atualizado!"); resetForm(); },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = trpc.membros.delete.useMutation({
    onSuccess: () => { utils.membros.list.invalidate(); toast.success("Membro excluído!"); },
    onError: (error) => toast.error(error.message),
  });

  const resetForm = () => { setFormData({ nome: "", funcao: "", email: "", areaEmpresa: "", ativo: true }); setEditingId(null); setIsOpen(false); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) updateMutation.mutate({ id: editingId, ...formData });
    else createMutation.mutate(formData);
  };

  const handleEdit = (m: NonNullable<typeof membros>[0]) => {
    setFormData({ nome: m.nome, funcao: m.funcao || "", email: m.email || "", areaEmpresa: m.areaEmpresa || "", ativo: m.ativo });
    setEditingId(m.id);
    setIsOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Membros</h1>
          <p className="text-muted-foreground">Vendedores e representantes</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => {
            if (membros && membros.length > 0) {
              exportToCsv(membros, "membros", [
                { key: "nome", title: "Nome" },
                { key: "funcao", title: "Função" },
                { key: "email", title: "Email" },
                { key: "areaEmpresa", title: "Área" },
                { key: "ativo", title: "Ativo" },
              ]);
            } else {
              toast.error("Não há dados para exportar");
            }
          }}><Download className="h-4 w-4 mr-2" />Exportar CSV</Button>
          <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Novo Membro</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editingId ? "Editar Membro" : "Novo Membro"}</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2"><Label>Nome</Label><Input value={formData.nome} onChange={(e) => setFormData({ ...formData, nome: e.target.value })} required /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Função</Label><Input value={formData.funcao} onChange={(e) => setFormData({ ...formData, funcao: e.target.value })} /></div>
                <div className="space-y-2"><Label>Área</Label><Input value={formData.areaEmpresa} onChange={(e) => setFormData({ ...formData, areaEmpresa: e.target.value })} /></div>
              </div>
              <div className="space-y-2"><Label>Email</Label><Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} /></div>
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
        <CardHeader><CardTitle>Lista de Membros</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div> : (
            <Table>
              <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Função</TableHead><TableHead>Email</TableHead><TableHead>Área</TableHead><TableHead>Status</TableHead><TableHead className="w-[100px]">Ações</TableHead></TableRow></TableHeader>
              <TableBody>
                {membros?.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum membro cadastrado</TableCell></TableRow> : membros?.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.nome}</TableCell>
                    <TableCell>{m.funcao || "-"}</TableCell>
                    <TableCell>{m.email || "-"}</TableCell>
                    <TableCell>{m.areaEmpresa || "-"}</TableCell>
                    <TableCell><Badge variant={m.ativo ? "default" : "secondary"}>{m.ativo ? "Ativo" : "Inativo"}</Badge></TableCell>
                    <TableCell><div className="flex gap-1"><Button size="icon" variant="ghost" onClick={() => handleEdit(m)}><Pencil className="h-4 w-4" /></Button><AlertDialog><AlertDialogTrigger asChild><Button size="icon" variant="ghost"><Trash2 className="h-4 w-4 text-destructive" /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Confirmar exclusão</AlertDialogTitle><AlertDialogDescription>Tem certeza que deseja excluir o membro <strong>{m.nome}</strong>? Esta ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => deleteMutation.mutate({ id: m.id })} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div></TableCell>
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
