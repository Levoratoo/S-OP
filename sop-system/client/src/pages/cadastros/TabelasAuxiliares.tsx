import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { trpc } from "@/lib/trpc";
import { Plus, Pencil, Trash2, Loader2, Upload, Download, FileSpreadsheet, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

type TabelaAuxiliar = "statusCadastro" | "tiposNegocio" | "tiposEstoque" | "linhas" | "modelos" | "tamanhos";

interface TabelaConfig {
  titulo: string;
  descricao: string;
  exemplos: string[];
}

const TABELAS_CONFIG: Record<TabelaAuxiliar, TabelaConfig> = {
  statusCadastro: {
    titulo: "Status",
    descricao: "Status de cadastro (Ativo, Inativo)",
    exemplos: ["Ativo", "Inativo"],
  },
  tiposNegocio: {
    titulo: "Tipos de Negócio",
    descricao: "Tipos de negócio (JIT, PRG, VAR)",
    exemplos: ["JIT", "PRG", "VAR"],
  },
  tiposEstoque: {
    titulo: "Tipos de Estoque",
    descricao: "Tipos de estoque (MTS, MTO)",
    exemplos: ["MTS", "MTO"],
  },
  linhas: {
    titulo: "Linhas",
    descricao: "Linhas de produto",
    exemplos: ["Adicionais", "Automática", "Classic", "Elegance", "Evolution", "Guardanapo", "Saco Fundo Q", "Saco Fundo V", "Serviço"],
  },
  modelos: {
    titulo: "Modelos",
    descricao: "Modelos de produto",
    exemplos: ["Adicionais", "Caixa", "Saco", "Sacola", "Serviço", "Envelope"],
  },
  tamanhos: {
    titulo: "Tamanhos",
    descricao: "Tamanhos de produto (PP, P, M, G, GG)",
    exemplos: ["PP", "P", "M", "G", "GG"],
  },
};

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

function TabelaCadastro({ tabela }: { tabela: TabelaAuxiliar }) {
  const config = TABELAS_CONFIG[tabela];
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({ nome: "", descricao: "", ativo: true });
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const utils = trpc.useUtils();
  
  // Dynamic queries based on tabela
  // @ts-ignore - Dynamic routing based on tabela prop
  const { data: items, isLoading } = trpc[tabela].list.useQuery() as { data: Item[] | undefined; isLoading: boolean };
  
  const createMutation = trpc[tabela].create.useMutation({
    onSuccess: () => {
      utils[tabela].list.invalidate();
      toast.success(`${config.titulo} criado com sucesso!`);
      resetForm();
    },
    onError: (error: { message: string }) => toast.error(error.message),
  });

  const updateMutation = trpc[tabela].update.useMutation({
    onSuccess: () => {
      utils[tabela].list.invalidate();
      toast.success(`${config.titulo} atualizado com sucesso!`);
      resetForm();
    },
    onError: (error: { message: string }) => toast.error(error.message),
  });

  const deleteMutation = trpc[tabela].delete.useMutation({
    onSuccess: () => {
      utils[tabela].list.invalidate();
      toast.success(`${config.titulo} excluído com sucesso!`);
    },
    onError: (error: { message: string }) => toast.error(error.message),
  });

  const importMutation = trpc[tabela].importBatch.useMutation({
    onSuccess: (result: { count: number }) => {
      toast.success(`${result.count} itens importados com sucesso!`);
      utils[tabela].list.invalidate();
      setParsedData([]);
      setFile(null);
    },
    onError: (error: { message: string }) => toast.error(`Erro na importação: ${error.message}`),
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
        const nomeIdx = headers.findIndex(h => h.includes("nome") || h === "status" || h === "tipo" || h === "linha" || h === "modelo");
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
    const exampleRows = config.exemplos.map(ex => [ex, `Descrição de ${ex}`, "Sim"]);
    
    const ws = XLSX.utils.aoa_to_sheet([headers, ...exampleRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, config.titulo);
    XLSX.writeFile(wb, `template_${tabela}.xlsx`);
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Tabs defaultValue="lista" className="space-y-4">
      <TabsList>
        <TabsTrigger value="lista">Lista</TabsTrigger>
        <TabsTrigger value="importar">Importar Excel</TabsTrigger>
      </TabsList>

      <TabsContent value="lista" className="space-y-4">
        <div className="flex justify-end">
          <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Novo
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingId ? "Editar" : "Novo"} {config.titulo}</DialogTitle>
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
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[80px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-4">
                        Nenhum item cadastrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    items?.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.nome}</TableCell>
                        <TableCell className="text-muted-foreground">{item.descricao || "-"}</TableCell>
                        <TableCell>
                          <Badge variant={item.ativo ? "default" : "secondary"}>
                            {item.ativo ? "Ativo" : "Inativo"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" onClick={() => handleEdit(item)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="icon" variant="ghost">
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Tem certeza que deseja excluir <strong>{item.nome}</strong>? Esta ação não pode ser desfeita.
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
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="importar" className="space-y-4">
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={downloadTemplate}>
            <Download className="h-4 w-4 mr-2" />
            Baixar Template
          </Button>
        </div>

        <Card>
          <CardContent className="pt-4">
            <div className="border-2 border-dashed rounded-lg p-6 text-center">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                className="hidden"
                id={`file-upload-${tabela}`}
                disabled={isProcessing}
              />
              <label htmlFor={`file-upload-${tabela}`} className="cursor-pointer">
                <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="font-medium">
                  {file ? file.name : "Clique para selecionar arquivo"}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  .xlsx, .xls, .csv
                </p>
              </label>
            </div>

            {isProcessing && (
              <div className="flex items-center gap-2 mt-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Processando...</span>
              </div>
            )}
          </CardContent>
        </Card>

        {parsedData.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  Preview ({parsedData.length} itens)
                </span>
                <Button size="sm" onClick={handleImport} disabled={importMutation.isPending}>
                  {importMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Importar
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Ativo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedData.slice(0, 10).map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{row.nome}</TableCell>
                      <TableCell className="text-muted-foreground">{row.descricao || "-"}</TableCell>
                      <TableCell>
                        <Badge variant={row.ativo !== false ? "default" : "secondary"}>
                          {row.ativo !== false ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {parsedData.length > 10 && (
                <p className="text-sm text-muted-foreground mt-2 text-center">
                  ... e mais {parsedData.length - 10} itens
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </TabsContent>
    </Tabs>
  );
}

export default function TabelasAuxiliares() {
  const [activeTab, setActiveTab] = useState<TabelaAuxiliar>("statusCadastro");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Tabelas Auxiliares</h1>
        <p className="text-muted-foreground">Gerencie as tabelas de referência do sistema</p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabelaAuxiliar)}>
        <TabsList className="grid grid-cols-6 w-full">
          <TabsTrigger value="statusCadastro">Status</TabsTrigger>
          <TabsTrigger value="tiposNegocio">Tipo Negócio</TabsTrigger>
          <TabsTrigger value="tiposEstoque">Tipo Estoque</TabsTrigger>
          <TabsTrigger value="linhas">Linhas</TabsTrigger>
          <TabsTrigger value="modelos">Modelos</TabsTrigger>
          <TabsTrigger value="tamanhos">Tamanhos</TabsTrigger>
        </TabsList>

        {Object.keys(TABELAS_CONFIG).map((key) => (
          <TabsContent key={key} value={key}>
            <Card>
              <CardHeader>
                <CardTitle>{TABELAS_CONFIG[key as TabelaAuxiliar].titulo}</CardTitle>
                <CardDescription>{TABELAS_CONFIG[key as TabelaAuxiliar].descricao}</CardDescription>
              </CardHeader>
              <CardContent>
                <TabelaCadastro tabela={key as TabelaAuxiliar} />
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
