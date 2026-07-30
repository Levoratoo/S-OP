import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { Plus, Pencil, Trash2, Loader2, ArrowRight, Upload, Download, Search } from "lucide-react";
import { exportToCsv } from "@/lib/exportCsv";
import { toast } from "sonner";
import * as XLSX from "xlsx";

export default function DeParaCodigos() {
  const [activeTab, setActiveTab] = useState("lista");
  
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">De-Para de Códigos</h1>
        <p className="text-muted-foreground">Gerencie a migração de códigos SKU para consolidar histórico de vendas</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="lista">Lista De-Para</TabsTrigger>
          <TabsTrigger value="importar">Importar Excel</TabsTrigger>
        </TabsList>

        <TabsContent value="lista">
          <ListaTab />
        </TabsContent>

        <TabsContent value="importar">
          <ImportarTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ==================== LISTA TAB ====================
function ListaTab() {
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [formData, setFormData] = useState({
    skuAntigo: "",
    skuNovo: "",
  });

  const utils = trpc.useUtils();
  const { data: deParaList, isLoading } = trpc.deParaCodigos.list.useQuery();

  const createMutation = trpc.deParaCodigos.create.useMutation({
    onSuccess: () => {
      utils.deParaCodigos.list.invalidate();
      toast.success("De-Para criado com sucesso!");
      resetForm();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = trpc.deParaCodigos.update.useMutation({
    onSuccess: () => {
      utils.deParaCodigos.list.invalidate();
      toast.success("De-Para atualizado com sucesso!");
      resetForm();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = trpc.deParaCodigos.delete.useMutation({
    onSuccess: () => {
      utils.deParaCodigos.list.invalidate();
      toast.success("De-Para excluído com sucesso!");
    },
    onError: (error) => toast.error(error.message),
  });

  const resetForm = () => {
    setFormData({
      skuAntigo: "",
      skuNovo: "",
    });
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

  const handleEdit = (item: NonNullable<typeof deParaList>[0]) => {
    setFormData({
      skuAntigo: item.skuAntigo,
      skuNovo: item.skuNovo,
    });
    setEditingId(item.id);
    setIsOpen(true);
  };

  const filteredList = deParaList?.filter(item => 
    item.skuAntigo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.skuNovo.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const handleExport = () => {
    if (!deParaList || deParaList.length === 0) {
      toast.error("Nenhum dado para exportar");
      return;
    }
    exportToCsv(deParaList, "de-para-codigos", [
      { key: "skuAntigo", title: "SKU Antigo" },
      { key: "skuNovo", title: "SKU Novo" },
    ]);
    toast.success("Arquivo exportado com sucesso!");
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Mapeamento De-Para</CardTitle>
          <CardDescription>
            Quando um código antigo é consultado, o sistema retorna o código atual seguindo a cadeia de migrações
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" /> Exportar CSV
          </Button>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => resetForm()}>
                <Plus className="h-4 w-4 mr-2" /> Novo De-Para
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingId ? "Editar" : "Novo"} De-Para</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>SKU Antigo *</Label>
                  <Input 
                    value={formData.skuAntigo} 
                    onChange={(e) => setFormData({ ...formData, skuAntigo: e.target.value })} 
                    placeholder="Ex: 1.00.000001"
                    required 
                  />
                </div>
                <div className="space-y-2">
                  <Label>SKU Novo *</Label>
                  <Input 
                    value={formData.skuNovo} 
                    onChange={(e) => setFormData({ ...formData, skuNovo: e.target.value })} 
                    placeholder="Ex: 1.00.000002"
                    required 
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={resetForm}>Cancelar</Button>
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                    {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {editingId ? "Atualizar" : "Criar"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por SKU..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin" /></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU Antigo</TableHead>
                <TableHead></TableHead>
                <TableHead>SKU Novo</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredList.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    {searchTerm ? "Nenhum resultado encontrado" : "Nenhum mapeamento cadastrado"}
                  </TableCell>
                </TableRow>
              ) : (
                filteredList.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono">{item.skuAntigo}</TableCell>
                    <TableCell className="text-center"><ArrowRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                    <TableCell className="font-mono">{item.skuNovo}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                              <AlertDialogDescription>
                                Tem certeza que deseja excluir o mapeamento {item.skuAntigo} → {item.skuNovo}? Esta ação não pode ser desfeita.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteMutation.mutate({ id: item.id })} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                Excluir
                              </AlertDialogAction>
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
  );
}

// ==================== IMPORTAR TAB ====================
function ImportarTab() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ skuAntigo: string; skuNovo: string }[]>([]);
  const utils = trpc.useUtils();

  const importMutation = trpc.deParaCodigos.importBatch.useMutation({
    onSuccess: (result) => {
      utils.deParaCodigos.list.invalidate();
      toast.success(`${result.count} mapeamentos importados com sucesso!`);
      setFile(null);
      setPreview([]);
    },
    onError: (error) => toast.error(error.message),
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);

    const reader = new FileReader();
    reader.onload = (event) => {
      const data = new Uint8Array(event.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json<Record<string, string>>(worksheet);

      const mappedData = jsonData.map((row) => ({
        skuAntigo: row["SKU Antigo"] || row["sku_antigo"] || row["skuAntigo"] || row["Código Antigo"] || row["codigoAntigo"] || "",
        skuNovo: row["SKU Novo"] || row["sku_novo"] || row["skuNovo"] || row["Código Novo"] || row["codigoNovo"] || "",
      })).filter(item => item.skuAntigo && item.skuNovo);

      setPreview(mappedData);
    };
    reader.readAsArrayBuffer(selectedFile);
  };

  const handleImport = () => {
    if (preview.length === 0) {
      toast.error("Nenhum dado válido para importar");
      return;
    }
    importMutation.mutate(preview);
  };

  const downloadTemplate = () => {
    const template = [{ "SKU Antigo": "1.00.000001", "SKU Novo": "1.00.000002" }];
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "De-Para");
    XLSX.writeFile(wb, "template-de-para.xlsx");
    toast.success("Template baixado!");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Importar De-Para via Excel</CardTitle>
        <CardDescription>
          Faça upload de um arquivo Excel com as colunas "SKU Antigo" e "SKU Novo"
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-4">
          <Button variant="outline" onClick={downloadTemplate}>
            <Download className="h-4 w-4 mr-2" /> Baixar Template
          </Button>
          <div>
            <Input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              className="max-w-xs"
            />
          </div>
        </div>

        {preview.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Preview ({preview.length} registros)</h3>
              <Button onClick={handleImport} disabled={importMutation.isPending}>
                {importMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <Upload className="h-4 w-4 mr-2" /> Importar
              </Button>
            </div>
            <div className="max-h-64 overflow-auto border rounded">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU Antigo</TableHead>
                    <TableHead></TableHead>
                    <TableHead>SKU Novo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.slice(0, 10).map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-mono">{item.skuAntigo}</TableCell>
                      <TableCell className="text-center"><ArrowRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                      <TableCell className="font-mono">{item.skuNovo}</TableCell>
                    </TableRow>
                  ))}
                  {preview.length > 10 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground">
                        ... e mais {preview.length - 10} registros
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
