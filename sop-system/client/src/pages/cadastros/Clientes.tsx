import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Plus, Pencil, Trash2, Loader2, Download } from "lucide-react";
import { exportToCsv } from "@/lib/exportCsv";
import { toast } from "sonner";

export default function Clientes() {
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    razaoSocial: "",
    nomeFantasia: "",
    cnpjCpf: "",
    cidade: "",
    estado: "",
    status: "ATIVO" as "ATIVO" | "INATIVO",
  });

  const utils = trpc.useUtils();
  const { data: clientes, isLoading } = trpc.clientes.list.useQuery();
  
  const createMutation = trpc.clientes.create.useMutation({
    onSuccess: () => {
      utils.clientes.list.invalidate();
      toast.success("Cliente criado com sucesso!");
      resetForm();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = trpc.clientes.update.useMutation({
    onSuccess: () => {
      utils.clientes.list.invalidate();
      toast.success("Cliente atualizado com sucesso!");
      resetForm();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = trpc.clientes.delete.useMutation({
    onSuccess: () => {
      utils.clientes.list.invalidate();
      toast.success("Cliente excluído com sucesso!");
    },
    onError: (error) => toast.error(error.message),
  });

  const resetForm = () => {
    setFormData({ razaoSocial: "", nomeFantasia: "", cnpjCpf: "", cidade: "", estado: "", status: "ATIVO" });
    setEditingId(null);
    setIsOpen(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      updateMutation.mutate({ id: editingId, ...formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (cliente: NonNullable<typeof clientes>[0]) => {
    setFormData({
      razaoSocial: cliente.razaoSocial,
      nomeFantasia: cliente.nomeFantasia || "",
      cnpjCpf: cliente.cnpjCpf || "",
      cidade: cliente.cidade || "",
      estado: cliente.estado || "",
      status: cliente.status as "ATIVO" | "INATIVO",
    });
    setEditingId(cliente.id);
    setIsOpen(true);
  };



  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground">Gerencie o cadastro de clientes</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => {
            if (clientes && clientes.length > 0) {
              exportToCsv(clientes, "clientes", [
                { key: "razaoSocial", title: "Razão Social" },
                { key: "nomeFantasia", title: "Nome Fantasia" },
                { key: "cnpjCpf", title: "CNPJ/CPF" },
                { key: "cidade", title: "Cidade" },
                { key: "estado", title: "Estado" },
                { key: "status", title: "Status" },
              ]);
            } else {
              toast.error("Não há dados para exportar");
            }
          }}><Download className="h-4 w-4 mr-2" />Exportar CSV</Button>
          <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Novo Cliente</Button>
            </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="razaoSocial">Razão Social</Label>
                <Input id="razaoSocial" value={formData.razaoSocial} onChange={(e) => setFormData({ ...formData, razaoSocial: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nomeFantasia">Nome Fantasia</Label>
                <Input id="nomeFantasia" value={formData.nomeFantasia} onChange={(e) => setFormData({ ...formData, nomeFantasia: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cnpjCpf">CNPJ/CPF</Label>
                <Input id="cnpjCpf" value={formData.cnpjCpf} onChange={(e) => setFormData({ ...formData, cnpjCpf: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cidade">Cidade</Label>
                  <Input id="cidade" value={formData.cidade} onChange={(e) => setFormData({ ...formData, cidade: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="estado">Estado</Label>
                  <Input id="estado" value={formData.estado} maxLength={2} onChange={(e) => setFormData({ ...formData, estado: e.target.value.toUpperCase() })} />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={resetForm}>Cancelar</Button>
                <Button type="submit" disabled={isPending}>
                  {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editingId ? "Atualizar" : "Criar"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Lista de Clientes</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Razão Social</TableHead>
                  <TableHead>Nome Fantasia</TableHead>
                  <TableHead>CNPJ/CPF</TableHead>
                  <TableHead>Cidade/UF</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientes?.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum cliente cadastrado</TableCell></TableRow>
                ) : (
                  clientes?.map((cliente) => (
                    <TableRow key={cliente.id}>
                      <TableCell className="font-medium">{cliente.razaoSocial}</TableCell>
                      <TableCell>{cliente.nomeFantasia || "-"}</TableCell>
                      <TableCell className="font-mono text-sm">{cliente.cnpjCpf || "-"}</TableCell>
                      <TableCell>{cliente.cidade ? `${cliente.cidade}/${cliente.estado}` : "-"}</TableCell>
                      <TableCell><Badge variant={cliente.status === "ATIVO" ? "default" : "secondary"}>{cliente.status}</Badge></TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" onClick={() => handleEdit(cliente)}><Pencil className="h-4 w-4" /></Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="icon" variant="ghost"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Tem certeza que deseja excluir o cliente <strong>{cliente.razaoSocial}</strong>? Esta ação não pode ser desfeita.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteMutation.mutate({ id: cliente.id })} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
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
