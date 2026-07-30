import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import * as XLSX from "xlsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { 
  Tag, 
  Search, 
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  Building2,
  Upload,
  FileSpreadsheet,
  Check,
  X,
  AlertCircle,
  Download,
  Filter
} from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function GerenciamentoMarcas() {
  const [searchTerm, setSearchTerm] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedMarca, setSelectedMarca] = useState<any>(null);
  const [formData, setFormData] = useState({ nome: "", grupoMarca: "", ativo: true });
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importData, setImportData] = useState<{ nome: string; grupoMarca?: string; ativo?: boolean; valid: boolean; error?: string }[]>([]);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  // Queries
  const { data: marcas = [], isLoading, refetch } = trpc.marcas.list.useQuery();

  // Mutations
  const createMutation = trpc.marcas.create.useMutation({
    onSuccess: () => {
      toast.success("Marca criada com sucesso!");
      refetch();
      setCreateDialogOpen(false);
      setFormData({ nome: "", grupoMarca: "", ativo: true });
    },
    onError: (error: any) => {
      toast.error("Erro ao criar marca: " + error.message);
    }
  });

  const updateMutation = trpc.marcas.update.useMutation({
    onSuccess: () => {
      toast.success("Marca atualizada com sucesso!");
      refetch();
      setEditDialogOpen(false);
      setSelectedMarca(null);
    },
    onError: (error: any) => {
      toast.error("Erro ao atualizar marca: " + error.message);
    }
  });

  const deleteMutation = trpc.marcas.delete.useMutation({
    onSuccess: () => {
      toast.success("Marca excluída com sucesso!");
      refetch();
      setDeleteDialogOpen(false);
      setSelectedMarca(null);
    },
    onError: (error: any) => {
      toast.error("Erro ao excluir marca: " + error.message);
    }
  });

  const importBatchMutation = trpc.marcas.importBatch.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.count} marca(s) importada(s) com sucesso!`);
      refetch();
      setImportDialogOpen(false);
      setImportData([]);
      setImporting(false);
    },
    onError: (error: any) => {
      toast.error("Erro ao importar marcas: " + error.message);
      setImporting(false);
    }
  });

  // Filtrar marcas
  const marcasFiltradas = marcas.filter((m: any) => {
    const matchesSearch = m.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.grupoMarca?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" ||
      (statusFilter === "active" && m.ativo !== false) ||
      (statusFilter === "inactive" && m.ativo === false);
    return matchesSearch && matchesStatus;
  });

  // Handlers
  const handleCreate = () => {
    if (!formData.nome.trim()) {
      toast.error("Nome da marca é obrigatório");
      return;
    }
    createMutation.mutate(formData);
  };

  const handleEdit = (marca: any) => {
    setSelectedMarca(marca);
    setFormData({
      nome: marca.nome || "",
      grupoMarca: marca.grupoMarca || "",
      ativo: marca.ativo !== false
    });
    setEditDialogOpen(true);
  };

  const handleUpdate = () => {
    if (!selectedMarca) return;
    if (!formData.nome.trim()) {
      toast.error("Nome da marca é obrigatório");
      return;
    }
    updateMutation.mutate({
      id: selectedMarca.id,
      nome: formData.nome,
      grupoMarca: formData.grupoMarca,
      ativo: formData.ativo
    });
  };

  const handleDelete = (marca: any) => {
    setSelectedMarca(marca);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (selectedMarca) {
      deleteMutation.mutate({ id: selectedMarca.id });
    }
  };

  // Handlers de importação
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

        // Processar e validar dados
        const processedData = jsonData.map((row) => {
          const nome = String(row.nome || row.Nome || row.NOME || "").trim();
          const grupoMarca = String(row.grupoMarca || row.GrupoMarca || row.GRUPOMARCA || row.grupo_marca || "").trim();
          const ativoRaw = row.ativo ?? row.Ativo ?? row.ATIVO ?? true;
          const ativo = ativoRaw === true || ativoRaw === "true" || ativoRaw === "sim" || ativoRaw === "Sim" || ativoRaw === "SIM" || ativoRaw === 1 || ativoRaw === "1";

          // Validar
          let valid = true;
          let error = "";
          if (!nome) {
            valid = false;
            error = "Nome é obrigatório";
          } else if (marcas.some((m: any) => m.nome.toLowerCase() === nome.toLowerCase())) {
            valid = false;
            error = "Marca já existe";
          }

          return { nome, grupoMarca: grupoMarca || undefined, ativo, valid, error };
        });

        setImportData(processedData);
        setImportDialogOpen(true);
      } catch (error) {
        toast.error("Erro ao ler arquivo. Verifique o formato.");
      }
    };
    reader.readAsBinaryString(file);
    
    // Limpar input para permitir selecionar o mesmo arquivo novamente
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleImport = () => {
    const validData = importData.filter(d => d.valid);
    if (validData.length === 0) {
      toast.error("Nenhuma marca válida para importar");
      return;
    }
    setImporting(true);
    importBatchMutation.mutate(validData.map(({ nome, grupoMarca, ativo }) => ({ nome, grupoMarca, ativo })));
  };

  const downloadTemplate = () => {
    const template = [
      { nome: "Exemplo Marca 1", grupoMarca: "Premium", ativo: "sim" },
      { nome: "Exemplo Marca 2", grupoMarca: "Standard", ativo: "sim" },
    ];
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Marcas");
    XLSX.writeFile(wb, "modelo_importacao_marcas.xlsx");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Tag className="h-6 w-6 text-indigo-600" />
            Gerenciamento de Marcas
          </h1>
          <p className="text-gray-500 mt-1">
            Gerencie as marcas disponíveis para associação aos usuários
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => { setFormData({ nome: "", grupoMarca: "", ativo: true }); setCreateDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Marca
          </Button>
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4 mr-2" />
            Importar
          </Button>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept=".xlsx,.xls,.csv"
            className="hidden"
          />
        </div>
      </div>

      {/* Barra de busca e filtros */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar por nome ou descrição..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={(value: "all" | "active" | "inactive") => setStatusFilter(value)}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <Filter className="h-4 w-4 mr-2 text-gray-400" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="active">Ativas</SelectItem>
                <SelectItem value="inactive">Inativas</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Lista de marcas */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Marcas Cadastradas</CardTitle>
          <CardDescription>
            {marcasFiltradas.length} marca(s) encontrada(s)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : marcasFiltradas.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Building2 className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p>Nenhuma marca encontrada</p>
              <p className="text-sm mt-1">Clique em "Nova Marca" para adicionar</p>
            </div>
          ) : (
            <div className="space-y-3">
              {marcasFiltradas.map((marca: any) => (
                <div 
                  key={marca.id}
                  className={`flex items-center justify-between p-4 rounded-lg border ${
                    marca.ativo !== false ? 'bg-white' : 'bg-gray-50 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      marca.ativo !== false ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-200 text-gray-500'
                    }`}>
                      <Tag className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-medium text-gray-900 flex items-center gap-2">
                        {marca.nome}
                        {marca.ativo === false && (
                          <Badge variant="destructive" className="text-xs">Inativa</Badge>
                        )}
                      </div>
                      {marca.grupoMarca && (
                        <div className="text-sm text-gray-500">{marca.grupoMarca}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(marca)}
                      title="Editar marca"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(marca)}
                      title="Excluir marca"
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog: Criar Marca */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-indigo-600" />
              Nova Marca
            </DialogTitle>
            <DialogDescription>
              Cadastre uma nova marca no sistema
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="create-nome">Nome *</Label>
              <Input
                id="create-nome"
                placeholder="Nome da marca"
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-grupoMarca">Grupo da Marca</Label>
              <Input
                id="create-grupoMarca"
                placeholder="Ex: Premium, Standard, Economy"
                value={formData.grupoMarca}
                onChange={(e) => setFormData({ ...formData, grupoMarca: e.target.value })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="create-ativo">Marca ativa</Label>
              <Switch
                id="create-ativo"
                checked={formData.ativo}
                onCheckedChange={(checked) => setFormData({ ...formData, ativo: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Criando..." : "Criar Marca"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Editar Marca */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-indigo-600" />
              Editar Marca
            </DialogTitle>
            <DialogDescription>
              Altere os dados da marca
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-nome">Nome *</Label>
              <Input
                id="edit-nome"
                placeholder="Nome da marca"
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-grupoMarca">Grupo da Marca</Label>
              <Input
                id="edit-grupoMarca"
                placeholder="Ex: Premium, Standard, Economy"
                value={formData.grupoMarca}
                onChange={(e) => setFormData({ ...formData, grupoMarca: e.target.value })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-ativo">Marca ativa</Label>
              <Switch
                id="edit-ativo"
                checked={formData.ativo}
                onCheckedChange={(checked) => setFormData({ ...formData, ativo: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog: Confirmar Exclusão */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a marca <strong>{selectedMarca?.nome}</strong>?
              <br />
              Esta ação não pode ser desfeita e pode afetar usuários associados a esta marca.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog: Importar Marcas */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-indigo-600" />
              Importar Marcas
            </DialogTitle>
            <DialogDescription>
              Revise os dados antes de confirmar a importação
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-auto py-4">
            {importData.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <FileSpreadsheet className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                <p>Nenhum dado carregado</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">
                    {importData.length} registro(s) encontrado(s)
                  </span>
                  <div className="flex gap-4">
                    <span className="flex items-center gap-1 text-green-600">
                      <Check className="h-4 w-4" />
                      {importData.filter(d => d.valid).length} válido(s)
                    </span>
                    {importData.filter(d => !d.valid).length > 0 && (
                      <span className="flex items-center gap-1 text-red-600">
                        <X className="h-4 w-4" />
                        {importData.filter(d => !d.valid).length} inválido(s)
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">Status</TableHead>
                        <TableHead>Nome</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead className="w-20">Ativo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importData.map((item, index) => (
                        <TableRow key={index} className={!item.valid ? "bg-red-50" : ""}>
                          <TableCell>
                            {item.valid ? (
                              <Check className="h-4 w-4 text-green-600" />
                            ) : (
                              <div className="flex items-center gap-1" title={item.error}>
                                <AlertCircle className="h-4 w-4 text-red-500" />
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <div>
                              {item.nome || <span className="text-gray-400 italic">Vazio</span>}
                              {item.error && (
                                <div className="text-xs text-red-500">{item.error}</div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-gray-600 text-sm">
                            {item.grupoMarca || "-"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={item.ativo ? "default" : "secondary"}>
                              {item.ativo ? "Sim" : "Não"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
          
          <DialogFooter className="flex-shrink-0 border-t pt-4">
            <Button variant="outline" onClick={downloadTemplate} className="mr-auto">
              <Download className="h-4 w-4 mr-2" />
              Baixar Modelo
            </Button>
            <Button variant="outline" onClick={() => { setImportDialogOpen(false); setImportData([]); }}>
              Cancelar
            </Button>
            <Button 
              onClick={handleImport} 
              disabled={importing || importData.filter(d => d.valid).length === 0}
            >
              {importing ? "Importando..." : `Importar ${importData.filter(d => d.valid).length} marca(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
