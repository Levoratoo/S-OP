import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { trpc } from "@/lib/trpc";
import { Plus, Pencil, Trash2, Loader2, Download, GitBranch, Settings, Search } from "lucide-react";
import { exportToCsv } from "@/lib/exportCsv";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export default function Fluxos() {
  const [isOpen, setIsOpen] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [selectedFluxo, setSelectedFluxo] = useState<{ id: number; nome: string } | null>(null);
  const [selectedRecursos, setSelectedRecursos] = useState<number[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [formData, setFormData] = useState({ 
    nome: "", 
    descricao: "",
    ativo: true,
    recursosIds: [] as number[]
  });

  const utils = trpc.useUtils();
  const { data: fluxos, isLoading } = trpc.fluxos.list.useQuery();
  const { data: fluxosComRecursos } = trpc.fluxos.listComRecursos.useQuery();
  const { data: recursos } = trpc.recursos.list.useQuery();
  const { data: fluxoRecursos, refetch: refetchFluxoRecursos } = trpc.fluxos.getRecursos.useQuery(
    { fluxoId: selectedFluxo?.id || 0 },
    { enabled: !!selectedFluxo }
  );
  
  const createMutation = trpc.fluxos.create.useMutation({
    onSuccess: (newFluxo) => { 
      // Após criar o fluxo, associar os recursos selecionados
      if (formData.recursosIds.length > 0 && newFluxo) {
        setRecursosMutation.mutate({
          fluxoId: newFluxo.id,
          recursoIds: formData.recursosIds,
        });
      }
      utils.fluxos.list.invalidate(); 
      utils.fluxos.listComRecursos.invalidate();
      toast.success("Fluxo cadastrado!"); 
      resetForm(); 
    },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = trpc.fluxos.update.useMutation({
    onSuccess: () => { 
      utils.fluxos.list.invalidate(); 
      utils.fluxos.listComRecursos.invalidate();
      toast.success("Fluxo atualizado!"); 
      resetForm(); 
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = trpc.fluxos.delete.useMutation({
    onSuccess: () => { 
      utils.fluxos.list.invalidate(); 
      utils.fluxos.listComRecursos.invalidate();
      toast.success("Fluxo excluído!"); 
      setDeleteId(null); 
    },
    onError: (error) => toast.error(error.message),
  });

  const setRecursosMutation = trpc.fluxos.setRecursos.useMutation({
    onSuccess: () => { 
      refetchFluxoRecursos();
      utils.fluxos.listComRecursos.invalidate();
      toast.success("Recursos atualizados!"); 
    },
    onError: (error) => toast.error(error.message),
  });

  const resetForm = () => {
    setFormData({ nome: "", descricao: "", ativo: true, recursosIds: [] });
    setEditingId(null);
    setIsOpen(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      updateMutation.mutate({ id: editingId, nome: formData.nome, descricao: formData.descricao, ativo: formData.ativo });
      // Atualizar recursos também
      if (formData.recursosIds.length >= 0) {
        setRecursosMutation.mutate({
          fluxoId: editingId,
          recursoIds: formData.recursosIds,
        });
      }
    } else {
      createMutation.mutate({ nome: formData.nome, descricao: formData.descricao, ativo: formData.ativo });
    }
  };

  const handleEdit = (fluxo: NonNullable<typeof fluxos>[0]) => {
    // Buscar recursos associados a este fluxo
    const fluxoComRecursos = fluxosComRecursos?.find(f => f.id === fluxo.id);
    const recursosDoFluxo = fluxoComRecursos?.recursos?.map((r: any) => r.id) || [];
    
    setFormData({
      nome: fluxo.nome,
      descricao: fluxo.descricao || "",
      ativo: fluxo.ativo,
      recursosIds: recursosDoFluxo,
    });
    setEditingId(fluxo.id);
    setIsOpen(true);
  };

  const handleOpenConfig = (fluxo: { id: number; nome: string }) => {
    setSelectedFluxo(fluxo);
    setIsConfigOpen(true);
  };

  // Quando abre o dialog de configuração, carrega os recursos selecionados
  useEffect(() => {
    if (fluxoRecursos && isConfigOpen) {
      setSelectedRecursos(fluxoRecursos.map(fr => fr.recursoId));
    }
  }, [fluxoRecursos, isConfigOpen]);

  const handleToggleRecurso = (recursoId: number) => {
    setSelectedRecursos(prev => 
      prev.includes(recursoId) 
        ? prev.filter(id => id !== recursoId)
        : [...prev, recursoId]
    );
  };

  const handleToggleRecursoForm = (recursoId: number) => {
    setFormData(prev => ({
      ...prev,
      recursosIds: prev.recursosIds.includes(recursoId)
        ? prev.recursosIds.filter(id => id !== recursoId)
        : [...prev.recursosIds, recursoId]
    }));
  };

  const handleSaveRecursos = () => {
    if (!selectedFluxo) return;
    setRecursosMutation.mutate({
      fluxoId: selectedFluxo.id,
      recursoIds: selectedRecursos,
    });
  };

  // Agrupar recursos por tipo para exibição
  const recursosAgrupados = useMemo(() => {
    if (!recursos) return {};
    return recursos.reduce((acc, recurso) => {
      const tipo = recurso.tipo;
      if (!acc[tipo]) acc[tipo] = [];
      acc[tipo].push(recurso);
      return acc;
    }, {} as Record<string, typeof recursos>);
  }, [recursos]);

  // Filtrar fluxos pela busca
  const fluxosFiltrados = useMemo(() => {
    if (!fluxos) return [];
    if (!searchTerm) return fluxos;
    return fluxos.filter(f => 
      f.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (f.descricao && f.descricao.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [fluxos, searchTerm]);

  // Obter contagem de recursos por fluxo
  const getRecursosCount = (fluxoId: number) => {
    const fluxo = fluxosComRecursos?.find(f => f.id === fluxoId);
    return fluxo?.recursos?.length || 0;
  };

  // Obter nomes dos recursos do fluxo
  const getRecursosNomes = (fluxoId: number) => {
    const fluxo = fluxosComRecursos?.find(f => f.id === fluxoId);
    if (!fluxo?.recursos?.length) return "-";
    const nomes = fluxo.recursos.slice(0, 5).map((r: any) => r.nome);
    if (fluxo.recursos.length > 5) {
      return nomes.join(", ") + ` (+${fluxo.recursos.length - 5})`;
    }
    return nomes.join(", ");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fluxos</h1>
          <p className="text-muted-foreground">Configure os fluxos de produção e seus recursos</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => {
            if (fluxos && fluxos.length > 0) {
              exportToCsv(fluxos, "fluxos", [
                { key: "nome", title: "Nome" },
                { key: "descricao", title: "Descrição" },
                { key: "ativo", title: "Ativo" },
              ]);
            } else {
              toast.error("Não há dados para exportar");
            }
          }}><Download className="h-4 w-4 mr-2" />Exportar CSV</Button>
          <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Novo Fluxo</Button></DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
              <DialogHeader><DialogTitle>{editingId ? "Editar Fluxo" : "Cadastrar Fluxo"}</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="space-y-2">
                    <Label>Nome do Fluxo *</Label>
                    <Input 
                      placeholder="Ex: Fluxo 01, Fluxo 02" 
                      value={formData.nome} 
                      onChange={(e) => setFormData({ ...formData, nome: e.target.value })} 
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Descrição</Label>
                    <Input 
                      placeholder="Descrição do fluxo" 
                      value={formData.descricao} 
                      onChange={(e) => setFormData({ ...formData, descricao: e.target.value })} 
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 mb-4">
                  <Switch 
                    checked={formData.ativo} 
                    onCheckedChange={(checked) => setFormData({ ...formData, ativo: checked })} 
                  />
                  <Label>Ativo</Label>
                </div>
                
                {/* Seleção de Recursos */}
                <div className="flex-1 overflow-hidden border rounded-lg">
                  <div className="bg-muted/50 p-3 border-b">
                    <Label className="font-semibold">Recursos do Fluxo ({formData.recursosIds.length} selecionados)</Label>
                    <p className="text-xs text-muted-foreground mt-1">Selecione os recursos que fazem parte deste fluxo</p>
                  </div>
                  <ScrollArea className="h-[300px] p-3">
                    {Object.entries(recursosAgrupados).map(([tipo, recursosDoTipo]) => (
                      <div key={tipo} className="mb-4">
                        <h4 className="font-medium text-sm text-muted-foreground mb-2">{tipo}</h4>
                        <div className="grid grid-cols-3 gap-2">
                          {recursosDoTipo.map(recurso => (
                            <div 
                              key={recurso.id} 
                              className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-colors text-sm ${
                                formData.recursosIds.includes(recurso.id) 
                                  ? "bg-primary/10 border-primary" 
                                  : "hover:bg-muted"
                              }`}
                              onClick={() => handleToggleRecursoForm(recurso.id)}
                            >
                              <Checkbox 
                                checked={formData.recursosIds.includes(recurso.id)}
                                onCheckedChange={() => handleToggleRecursoForm(recurso.id)}
                              />
                              <span className="truncate">{recurso.nome}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </ScrollArea>
                </div>
                
                <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
                  <Button type="button" variant="outline" onClick={resetForm}>Cancelar</Button>
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                    {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {editingId ? "Atualizar" : "Salvar"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Dialog de confirmação de exclusão */}
      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este fluxo? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <GitBranch className="h-5 w-5" />
              Fluxos de Produção
            </CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Buscar fluxo..." 
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div> : (
            <div className="max-h-[600px] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="w-[120px]">Nome</TableHead>
                    <TableHead>Recursos</TableHead>
                    <TableHead className="text-center w-[80px]">Qtd</TableHead>
                    <TableHead className="text-center w-[80px]">Status</TableHead>
                    <TableHead className="w-[100px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fluxosFiltrados?.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum fluxo cadastrado</TableCell></TableRow>
                  ) : fluxosFiltrados?.map((fluxo) => (
                    <TableRow key={fluxo.id}>
                      <TableCell className="font-medium">{fluxo.nome}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[400px] truncate">
                        {getRecursosNomes(fluxo.id)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline">{getRecursosCount(fluxo.id)}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={fluxo.ativo ? "default" : "secondary"}>
                          {fluxo.ativo ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" onClick={() => handleOpenConfig(fluxo)} title="Configurar Recursos">
                            <Settings className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => handleEdit(fluxo)}><Pencil className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" onClick={() => setDeleteId(fluxo.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de Configuração de Recursos */}
      <Dialog open={isConfigOpen} onOpenChange={(open) => { setIsConfigOpen(open); if (!open) setSelectedFluxo(null); }}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configurar Recursos - {selectedFluxo?.nome}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground">
              Selecione os recursos que fazem parte deste fluxo de produção. Clique para marcar/desmarcar.
            </p>
            
            {Object.entries(recursosAgrupados).map(([tipo, recursosDoTipo]) => (
              <div key={tipo} className="space-y-3">
                <h3 className="font-semibold text-sm border-b pb-2">{tipo}</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {recursosDoTipo.map(recurso => (
                    <div 
                      key={recurso.id} 
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedRecursos.includes(recurso.id) 
                          ? "bg-primary/10 border-primary" 
                          : "hover:bg-muted"
                      }`}
                      onClick={() => handleToggleRecurso(recurso.id)}
                    >
                      <Checkbox 
                        checked={selectedRecursos.includes(recurso.id)}
                        onCheckedChange={() => handleToggleRecurso(recurso.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{recurso.nome}</p>
                        <p className="text-xs text-muted-foreground">{recurso.linhaProducao || "-"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            
            <div className="flex justify-between items-center pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                {selectedRecursos.length} recurso(s) selecionado(s)
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setIsConfigOpen(false)}>Cancelar</Button>
                <Button 
                  onClick={handleSaveRecursos}
                  disabled={setRecursosMutation.isPending}
                >
                  {setRecursosMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Salvar Recursos
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
