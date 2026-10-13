import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { Plus, Pencil, Trash2, Loader2, Users, Tag, Download, Link, AlertCircle } from "lucide-react";
import { exportToCsv } from "@/lib/exportCsv";
import { toast } from "sonner";

export default function GestorMarca() {
  const [activeTab, setActiveTab] = useState("relacionamento");
  const [acceptingChave, setAcceptingChave] = useState<string | null>(null);
  const [acceptingAll, setAcceptingAll] = useState(false);

  const utils = trpc.useUtils();
  const { data: pendingClientes = [] } =
    trpc.cadastrosSistema.pendingClientesFromFaturamento.useQuery();

  const acceptPendingClienteMutation = trpc.cadastrosSistema.acceptPendingCliente.useMutation({
    onSuccess: () => {
      utils.cadastrosSistema.pendingClientesFromFaturamento.invalidate();
      utils.clientes.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const handleAcceptCliente = async (chave: string) => {
    setAcceptingChave(chave);
    try {
      await acceptPendingClienteMutation.mutateAsync({ chave });
      toast.success("Cliente aceito e cadastrado!");
    } finally {
      setAcceptingChave(null);
    }
  };

  const handleAcceptAllClientes = async () => {
    setAcceptingAll(true);
    let ok = 0;
    let fail = 0;
    try {
      for (const cliente of pendingClientes) {
        try {
          await acceptPendingClienteMutation.mutateAsync({ chave: cliente.chave });
          ok += 1;
        } catch {
          fail += 1;
        }
      }
      if (ok > 0) {
        toast.success(`${ok} cliente(s) aceito(s)${fail ? `, ${fail} falha(s)` : ""}`);
      } else if (fail > 0) {
        toast.error(`Falha ao aceitar clientes (${fail})`);
      }
      await utils.cadastrosSistema.pendingClientesFromFaturamento.invalidate();
      await utils.clientes.list.invalidate();
    } finally {
      setAcceptingAll(false);
    }
  };

  const pendingPreview = pendingClientes.slice(0, 10);
  
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Gestor x Marca</h1>
        <p className="text-muted-foreground">Gerencie o relacionamento entre gestores comerciais e marcas</p>
      </div>

      {pendingClientes.length > 0 && (
        <Alert className="border-amber-300 bg-amber-50 text-amber-950">
          <AlertCircle className="h-4 w-4 text-amber-700" />
          <AlertTitle className="flex items-center gap-2">
            Clientes novos no Faturamento
            <Badge variant="secondary" className="bg-amber-200 text-amber-900">
              {pendingClientes.length}
            </Badge>
          </AlertTitle>
          <AlertDescription className="space-y-3 mt-2">
            <p>
              Há clientes no faturamento que ainda não estão cadastrados. Aceite-os para disponibilizar no SNOP.
            </p>
            <div className="rounded-md border border-amber-200 bg-white/70 max-h-56 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Chave</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>CNPJ</TableHead>
                    <TableHead>Cidade/UF</TableHead>
                    <TableHead className="w-[110px]">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingPreview.map((cliente) => (
                    <TableRow key={cliente.chave}>
                      <TableCell className="font-mono text-xs">{cliente.chave}</TableCell>
                      <TableCell className="font-mono text-sm">{cliente.codCliente || "-"}</TableCell>
                      <TableCell className="font-mono text-sm">{cliente.cnpj || "-"}</TableCell>
                      <TableCell>
                        {cliente.cidade ? `${cliente.cidade}/${cliente.uf || ""}` : "-"}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={acceptingAll || acceptPendingClienteMutation.isPending}
                          onClick={() => handleAcceptCliente(cliente.chave)}
                        >
                          {acceptingChave === cliente.chave ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            "Aceitar"
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {pendingClientes.length > 10 && (
              <p className="text-xs text-amber-800">
                Exibindo 10 de {pendingClientes.length} clientes pendentes
              </p>
            )}
            <Button
              size="sm"
              disabled={acceptingAll || acceptPendingClienteMutation.isPending}
              onClick={handleAcceptAllClientes}
            >
              {acceptingAll && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Aceitar todos ({pendingClientes.length})
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-3 w-full max-w-md">
          <TabsTrigger value="relacionamento">Relacionamento</TabsTrigger>
          <TabsTrigger value="gestores">Gestores</TabsTrigger>
          <TabsTrigger value="marcas">Marcas</TabsTrigger>
        </TabsList>

        <TabsContent value="relacionamento">
          <RelacionamentoTab />
        </TabsContent>

        <TabsContent value="gestores">
          <GestoresTab />
        </TabsContent>

        <TabsContent value="marcas">
          <MarcasTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ==================== RELACIONAMENTO TAB ====================
function RelacionamentoTab() {
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    gestorId: "",
    marcaId: "",
  });

  const utils = trpc.useUtils();
  const { data: relacionamentos, isLoading } = trpc.gestorMarca.list.useQuery();
  const { data: gestores } = trpc.gestores.list.useQuery();
  const { data: marcas } = trpc.marcas.list.useQuery();

  const createMutation = trpc.gestorMarca.create.useMutation({
    onSuccess: () => {
      utils.gestorMarca.list.invalidate();
      toast.success("Relacionamento criado com sucesso!");
      resetForm();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = trpc.gestorMarca.update.useMutation({
    onSuccess: () => {
      utils.gestorMarca.list.invalidate();
      toast.success("Relacionamento atualizado com sucesso!");
      resetForm();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = trpc.gestorMarca.delete.useMutation({
    onSuccess: () => {
      utils.gestorMarca.list.invalidate();
      toast.success("Relacionamento excluído com sucesso!");
    },
    onError: (error) => toast.error(error.message),
  });

  const resetForm = () => {
    setFormData({ gestorId: "", marcaId: "" });
    setEditingId(null);
    setIsOpen(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      gestorId: parseInt(formData.gestorId),
      marcaId: parseInt(formData.marcaId),
      ativo: true,
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (item: NonNullable<typeof relacionamentos>[0]) => {
    setFormData({
      gestorId: item.gestorId.toString(),
      marcaId: item.marcaId.toString(),
    });
    setEditingId(item.id);
    setIsOpen(true);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><Link className="h-5 w-5" /> Relacionamento Gestor x Marca</CardTitle>
          <CardDescription>Vincule gestores comerciais às marcas que gerenciam</CardDescription>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => resetForm()}>
              <Plus className="h-4 w-4 mr-2" /> Novo Relacionamento
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar" : "Novo"} Relacionamento</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Marca *</Label>
                <Select value={formData.marcaId} onValueChange={(v) => setFormData({ ...formData, marcaId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a marca..." />
                  </SelectTrigger>
                  <SelectContent>
                    {marcas?.map((m) => (
                      <SelectItem key={m.id} value={m.id.toString()}>{m.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Gestor *</Label>
                <Select value={formData.gestorId} onValueChange={(v) => setFormData({ ...formData, gestorId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o gestor..." />
                  </SelectTrigger>
                  <SelectContent>
                    {gestores?.map((g) => (
                      <SelectItem key={g.id} value={g.id.toString()}>{g.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={resetForm}>Cancelar</Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending || !formData.marcaId || !formData.gestorId}>
                  {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editingId ? "Atualizar" : "Criar"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin" /></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Marca</TableHead>
                <TableHead>Gestor</TableHead>
                <TableHead className="w-[100px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {relacionamentos?.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.marcaNome}</TableCell>
                  <TableCell>{item.gestorNome}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}><Pencil className="h-4 w-4" /></Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon"><Trash2 className="h-4 w-4" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                            <AlertDialogDescription>
                              Tem certeza que deseja excluir o relacionamento entre <strong>{item.marcaNome}</strong> e <strong>{item.gestorNome}</strong>? Esta ação não pode ser desfeita.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteMutation.mutate({ id: item.id })} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {relacionamentos?.length === 0 && (
                <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">Nenhum relacionamento cadastrado</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ==================== GESTORES TAB ====================
function GestoresTab() {
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({ nome: "", email: "" });
  const [searchTerm, setSearchTerm] = useState("");

  const utils = trpc.useUtils();
  const { data: gestores, isLoading } = trpc.gestores.list.useQuery();

  // Filtrar gestores pelo nome
  const filteredGestores = gestores?.filter((g) =>
    g.nome.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const createMutation = trpc.gestores.create.useMutation({
    onSuccess: () => { utils.gestores.list.invalidate(); toast.success("Gestor criado!"); resetForm(); },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = trpc.gestores.update.useMutation({
    onSuccess: () => { utils.gestores.list.invalidate(); toast.success("Gestor atualizado!"); resetForm(); },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = trpc.gestores.delete.useMutation({
    onSuccess: () => { utils.gestores.list.invalidate(); toast.success("Gestor excluído!"); },
    onError: (error) => toast.error(error.message),
  });

  const resetForm = () => { setFormData({ nome: "", email: "" }); setEditingId(null); setIsOpen(false); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) { updateMutation.mutate({ id: editingId, ...formData, ativo: true }); }
    else { createMutation.mutate({ ...formData, ativo: true }); }
  };

  const handleEdit = (item: NonNullable<typeof gestores>[0]) => {
    setFormData({ nome: item.nome, email: item.email || "" });
    setEditingId(item.id);
    setIsOpen(true);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Gestores Comerciais</CardTitle>
          <CardDescription>Cadastre os gestores comerciais da empresa</CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => {
            if (gestores && gestores.length > 0) {
              exportToCsv(gestores, "gestores", [
                { key: "nome", title: "Nome" },
                { key: "email", title: "Email" },
              ]);
            } else {
              toast.error("Não há dados para exportar");
            }
          }}><Download className="h-4 w-4 mr-2" />Exportar CSV</Button>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => resetForm()}><Plus className="h-4 w-4 mr-2" /> Novo Gestor</Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editingId ? "Editar" : "Novo"} Gestor</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input value={formData.nome} onChange={(e) => setFormData({ ...formData, nome: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={resetForm}>Cancelar</Button>
                <Button type="submit">{editingId ? "Atualizar" : "Criar"}</Button>
              </div>
            </form>
          </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <Input
            placeholder="Buscar gestor por nome..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-sm"
          />
        </div>
        {isLoading ? <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin" /></div> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="w-[100px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredGestores?.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.nome}</TableCell>
                  <TableCell>{item.email || "-"}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}><Pencil className="h-4 w-4" /></Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon"><Trash2 className="h-4 w-4" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                            <AlertDialogDescription>
                              Tem certeza que deseja excluir o gestor <strong>{item.nome}</strong>? Esta ação não pode ser desfeita.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteMutation.mutate({ id: item.id })} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredGestores?.length === 0 && <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">{searchTerm ? "Nenhum gestor encontrado" : "Nenhum gestor cadastrado"}</TableCell></TableRow>}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ==================== MARCAS TAB ====================
function MarcasTab() {
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({ nome: "", grupoMarca: "", ramoAtuacao: "", ativo: true });

  const utils = trpc.useUtils();
  const { data: marcas, isLoading } = trpc.marcas.list.useQuery();

  const createMutation = trpc.marcas.create.useMutation({
    onSuccess: () => { utils.marcas.list.invalidate(); toast.success("Marca criada!"); resetForm(); },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = trpc.marcas.update.useMutation({
    onSuccess: () => { utils.marcas.list.invalidate(); toast.success("Marca atualizada!"); resetForm(); },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = trpc.marcas.delete.useMutation({
    onSuccess: () => { utils.marcas.list.invalidate(); toast.success("Marca excluída!"); },
    onError: (error) => toast.error(error.message),
  });

  const resetForm = () => { setFormData({ nome: "", grupoMarca: "", ramoAtuacao: "", ativo: true }); setEditingId(null); setIsOpen(false); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) { updateMutation.mutate({ id: editingId, ...formData }); }
    else { createMutation.mutate(formData); }
  };

  const handleEdit = (item: NonNullable<typeof marcas>[0]) => {
    setFormData({ nome: item.nome, grupoMarca: item.grupoMarca || "", ramoAtuacao: (item as any).ramoAtuacao || "", ativo: item.ativo });
    setEditingId(item.id);
    setIsOpen(true);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><Tag className="h-5 w-5" /> Marcas</CardTitle>
          <CardDescription>Cadastre as marcas da empresa</CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => {
            if (marcas && marcas.length > 0) {
              exportToCsv(marcas, "marcas", [
                { key: "nome", title: "Nome da Marca" },
                { key: "grupoMarca", title: "Grupo da Marca" },
                { key: "ramoAtuacao", title: "Ramo de Atuação" },
                { key: "ativo", title: "Status" },
              ]);
            } else {
              toast.error("Não há dados para exportar");
            }
          }}><Download className="h-4 w-4 mr-2" />Exportar CSV</Button>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => resetForm()}><Plus className="h-4 w-4 mr-2" /> Nova Marca</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editingId ? "Editar" : "Nova"} Marca</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Nome da Marca *</Label>
                  <Input value={formData.nome} onChange={(e) => setFormData({ ...formData, nome: e.target.value })} required />
                </div>
<div className="space-y-2">
                   <Label>Grupo da Marca</Label>
                   <Input value={formData.grupoMarca} onChange={(e) => setFormData({ ...formData, grupoMarca: e.target.value })} placeholder="Ex: Premium, Standard, Economy" />
                 </div>
                 <div className="space-y-2">
                   <Label>Ramo de Atuação</Label>
                   <Input value={formData.ramoAtuacao} onChange={(e) => setFormData({ ...formData, ramoAtuacao: e.target.value })} placeholder="Ex: Calçados, Vestuário, Acessórios" />
                 </div>
                 <div className="flex items-center gap-2">
                  <input type="checkbox" id="ativo-marca" checked={formData.ativo} onChange={(e) => setFormData({ ...formData, ativo: e.target.checked })} />
                  <Label htmlFor="ativo-marca">Ativo</Label>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={resetForm}>Cancelar</Button>
                  <Button type="submit">{editingId ? "Atualizar" : "Criar"}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin" /></div> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome da Marca</TableHead>
                <TableHead>Grupo da Marca</TableHead>
                <TableHead>Ramo de Atuação</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {marcas?.map((item) => (
                <TableRow key={item.id}>
<TableCell className="font-medium">{item.nome}</TableCell>
                   <TableCell>{item.grupoMarca || "-"}</TableCell>
                   <TableCell>{(item as any).ramoAtuacao || "-"}</TableCell>
                   <TableCell><Badge variant={item.ativo ? "default" : "secondary"}>{item.ativo ? "Ativo" : "Inativo"}</Badge></TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}><Pencil className="h-4 w-4" /></Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon"><Trash2 className="h-4 w-4" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                            <AlertDialogDescription>
                              Tem certeza que deseja excluir a marca <strong>{item.nome}</strong>? Esta ação não pode ser desfeita.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteMutation.mutate({ id: item.id })} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {marcas?.length === 0 && <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Nenhuma marca cadastrada</TableCell></TableRow>}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
