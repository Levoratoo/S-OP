import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { trpc } from "@/lib/trpc";
import { Plus, Pencil, Trash2, Loader2, Upload, Download, FileSpreadsheet, CheckCircle2, Archive } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { exportToCsv } from "@/lib/exportCsv";

interface Item {
  id: number;
  nome: string;
  descricao: string | null;
  ordem?: number | null;
  ativo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface ParsedItem {
  nome: string;
  descricao?: string;
  ordem?: number;
  ativo?: boolean;
}

export default function TipoEstoque() {
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({ nome: "", descricao: "", ativo: true });
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const utils = trpc.useUtils();
  
  const { data: items = [], isLoading } = trpc.tiposEstoque.list.useQuery();
  
  const createMutation = trpc.tiposEstoque.create.useMutation({
    onSuccess: () => {
      utils.tiposEstoque.list.invalidate();
      toast.success("Tipo de estoque criado com sucesso!");
      resetForm();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = trpc.tiposEstoque.update.useMutation({
    onSuccess: () => {
      utils.tiposEstoque.list.invalidate();
      toast.success("Tipo de estoque atualizado com sucesso!");
      resetForm();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = trpc.tiposEstoque.delete.useMutation({
    onSuccess: () => {
      utils.tiposEstoque.list.invalidate();
      toast.success("Tipo de estoque excluído com sucesso!");
    },
    onError: (error) => toast.error(error.message),
  });

  const importMutation = trpc.tiposEstoque.importBatch.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.count} itens importados com sucesso!`);
      utils.tiposEstoque.list.invalidate();
      setParsedData([]);
      setFile(null);
    },
    onError: (error) => toast.error(`Erro na importação: ${error.message}`),
  });

  const resetForm = () => {
    setFormData({ nome: "", descricao: "", ativo: true });
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

  const handleEdit = (item: Item) => {
    setFormData({
      nome: item.nome,
      descricao: item.descricao || "",
      ativo: item.ativo,
    });
    setEditingId(item.id);
    setIsOpen(true);
  };

  const handleDelete = (id: number) => {
    if (confirm("Tem certeza que deseja excluir este tipo de estoque?")) {
      deleteMutation.mutate({ id });
    }
  };

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setIsProcessing(true);
    setParsedData([]);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][];

        if (jsonData.length < 2) {
          toast.error("Arquivo vazio ou sem dados");
          setIsProcessing(false);
          return;
        }

        const headers = (jsonData[0] as string[]).map(h => String(h).toLowerCase().trim());
        const nomeIdx = headers.findIndex(h => h.includes("nome") || h === "tipo");
        const descIdx = headers.findIndex(h => h.includes("descri"));
        const ativoIdx = headers.findIndex(h => h.includes("ativo"));

        const rows: ParsedItem[] = [];
        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i] as unknown[];
          if (!row || row.length === 0) continue;

          const nome = String(row[nomeIdx >= 0 ? nomeIdx : 0] || "").trim();
          if (!nome) continue;

          rows.push({
            nome,
            descricao: descIdx >= 0 ? String(row[descIdx] || "").trim() : undefined,
            ativo: ativoIdx >= 0 ? String(row[ativoIdx]).toLowerCase() !== "inativo" && String(row[ativoIdx]).toLowerCase() !== "false" : true,
          });
        }

        setParsedData(rows);
        setIsProcessing(false);
        toast.success(`${rows.length} itens carregados do arquivo`);
      } catch (error) {
        toast.error(`Erro ao processar arquivo: ${error}`);
        setIsProcessing(false);
      }
    };

    reader.readAsArrayBuffer(selectedFile);
  }, []);

  const handleImport = async () => {
    if (parsedData.length === 0) return;
    await importMutation.mutateAsync(parsedData);
  };

  const downloadTemplate = () => {
    const headers = ["Nome", "Descrição", "Ativo"];
    const exampleRows = [["MTS", "Make to Stock", "Sim"], ["MTO", "Make to Order", "Sim"]];
    
    const ws = XLSX.utils.aoa_to_sheet([headers, ...exampleRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "TipoEstoque");
    XLSX.writeFile(wb, "template_tipo_estoque.xlsx");
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
            <Archive className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Tipos de Estoque</h1>
            <p className="text-muted-foreground">Gerencie os tipos de estoque (MTS, MTO)</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="lista" className="space-y-4">
        <TabsList>
          <TabsTrigger value="lista">Lista</TabsTrigger>
          <TabsTrigger value="importar">Importar Excel</TabsTrigger>
        </TabsList>

        <TabsContent value="lista" className="space-y-4">
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => {
              if (items && items.length > 0) {
                exportToCsv(items, "tipo_estoque", [
                  { key: "nome", title: "Nome" },
                  { key: "descricao", title: "Descrição" },
                  { key: "ativo", title: "Ativo" },
                ]);
              } else {
                toast.error("Não há dados para exportar");
              }
            }}><Download className="h-4 w-4 mr-2" />Exportar CSV</Button>
            <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Novo Tipo
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingId ? "Editar" : "Novo"} Tipo de Estoque</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="nome">Nome</Label>
                    <Input
                      id="nome"
                      value={formData.nome}
                      onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="descricao">Descrição</Label>
                    <Input
                      id="descricao"
                      value={formData.descricao}
                      onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="ativo"
                      checked={formData.ativo}
                      onCheckedChange={(checked) => setFormData({ ...formData, ativo: checked })}
                    />
                    <Label htmlFor="ativo">Ativo</Label>
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

          <Card>
            <CardContent className="pt-4">
              {isLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : items.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhum tipo de estoque cadastrado
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[100px]">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item: Item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.nome}</TableCell>
                        <TableCell>{item.descricao || "-"}</TableCell>
                        <TableCell>
                          <Badge variant={item.ativo ? "default" : "secondary"}>
                            {item.ativo ? "Ativo" : "Inativo"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="importar" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Importar Tipos de Estoque</CardTitle>
              <CardDescription>Importe tipos de estoque a partir de um arquivo Excel</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Button variant="outline" onClick={downloadTemplate}>
                  <Download className="h-4 w-4 mr-2" />
                  Baixar Template
                </Button>
                <label>
                  <Button variant="outline" asChild>
                    <span>
                      <Upload className="h-4 w-4 mr-2" />
                      Selecionar Arquivo
                    </span>
                  </Button>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                </label>
              </div>

              {file && (
                <Alert>
                  <FileSpreadsheet className="h-4 w-4" />
                  <AlertTitle>Arquivo selecionado</AlertTitle>
                  <AlertDescription>{file.name}</AlertDescription>
                </Alert>
              )}

              {isProcessing && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processando arquivo...
                </div>
              )}

              {parsedData.length > 0 && (
                <div className="space-y-4">
                  <Alert>
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertTitle>{parsedData.length} itens prontos para importação</AlertTitle>
                  </Alert>

                  <div className="max-h-64 overflow-auto border rounded-md">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nome</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead>Ativo</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {parsedData.slice(0, 10).map((item, idx) => (
                          <TableRow key={idx}>
                            <TableCell>{item.nome}</TableCell>
                            <TableCell>{item.descricao || "-"}</TableCell>
                            <TableCell>{item.ativo !== false ? "Sim" : "Não"}</TableCell>
                          </TableRow>
                        ))}
                        {parsedData.length > 10 && (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center text-muted-foreground">
                              ... e mais {parsedData.length - 10} itens
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  <Button onClick={handleImport} disabled={importMutation.isPending}>
                    {importMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Importar {parsedData.length} itens
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
