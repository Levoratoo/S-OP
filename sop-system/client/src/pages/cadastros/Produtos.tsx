import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { Plus, Pencil, Trash2, Loader2, Upload, Download, FileSpreadsheet, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { exportToCsv } from "@/lib/exportCsv";

// Mapeamento de colunas do Excel para campos do banco
const COLUMN_MAPPING: Record<string, string> = {
  "Cod Item": "codItem",
  "Cod. Item": "codItem",
  "CodItem": "codItem",
  "Descrição": "descricao",
  "Descricao": "descricao",
  "Status": "status",
  "Tipo Negocio": "tipoNegocio",
  "Tipo Negócio": "tipoNegocio",
  "TipoNegocio": "tipoNegocio",
  "Tipo Estoque": "tipoEstoque",
  "TipoEstoque": "tipoEstoque",
  "Linha": "linha",
  "Linha Produto": "linha",
  "Modelo": "modelo",
  "Tamanho": "tamanho",
  "A X L X P": "axlxp",
  "AXLXP": "axlxp",
  "Marca": "marca",
  "Grupo": "grupo",
  "Ramo Atuação": "ramoAtuacao",
  "Ramo Atuacao": "ramoAtuacao",
  "RamoAtuacao": "ramoAtuacao",
  "Valor Venda": "valorVenda",
  "ValorVenda": "valorVenda",
  "Valor Custo": "valorCusto",
  "ValorCusto": "valorCusto",
  "Qtde Pallet": "qtdePallet",
  "QtdePallet": "qtdePallet",
  "Lote Economico Viável": "loteEconomicoViavel",
  "Lote Economico Viavel": "loteEconomicoViavel",
  "LoteEconomicoViavel": "loteEconomicoViavel",
  "Fluxo": "fluxo",
  "Caminho": "caminho",
  "Pista": "pista",
};

interface ParsedProduto {
  codItem?: string;
  descricao?: string;
  status?: "ATIVO" | "INATIVO";
  tipoNegocio?: string;
  tipoEstoque?: "MTS" | "MTO";
  linha?: string;
  modelo?: string;
  tamanho?: string;
  axlxp?: string;
  marca?: string;
  grupo?: string;
  ramoAtuacao?: string;
  valorVenda?: string;
  valorCusto?: string;
  qtdePallet?: number;
  loteEconomicoViavel?: number;
  fluxo?: string;
  caminho?: string;
  pista?: number;
}

export default function Produtos() {
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    codItem: "",
    descricao: "",
    status: "ATIVO" as "ATIVO" | "INATIVO",
    statusId: "" as string,
    tipoNegocio: "",
    tipoNegocioId: "" as string,
    tipoEstoque: "MTS" as "MTS" | "MTO",
    tipoEstoqueId: "" as string,
    linha: "",
    linhaId: "" as string,
    modelo: "",
    modeloId: "" as string,
    tamanho: "",
    tamanhoId: "" as string,
    axlxp: "",
    marca: "",
    marcaId: "" as string,
    grupo: "",
    ramoAtuacao: "",
    valorVenda: "",
    valorCusto: "",
    qtdePallet: "",
    loteEconomicoViavel: "",
    fluxo: "",
    fluxoId: "" as string,
    caminho: "",
    pista: "",
    projetarEstatistica: true,
  });

  // Filter states
  const [searchTerm, setSearchTerm] = useState("");
  const [filterFluxo, setFilterFluxo] = useState<string>("all");

  // Import states
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedProduto[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importProgress, setImportProgress] = useState(0);

  const utils = trpc.useUtils();
  const { data: produtos, isLoading } = trpc.produtos.list.useQuery();
  const { data: pendingSkus = [], isLoading: loadingPendingSkus } =
    trpc.cadastrosSistema.pendingSkusFromFaturamento.useQuery();
  
  // Carregar dados das tabelas auxiliares
  const { data: statusList } = trpc.statusCadastro.list.useQuery();
  const { data: tiposNegocioList } = trpc.tiposNegocio.list.useQuery();
  const { data: tiposEstoqueList } = trpc.tiposEstoque.list.useQuery();
  const { data: linhasList } = trpc.linhas.list.useQuery();
  const { data: modelosList } = trpc.modelos.list.useQuery();
  const { data: tamanhosList } = trpc.tamanhos.list.useQuery();
  const { data: marcasList } = trpc.marcas.list.useQuery();
  const { data: fluxosComRecursos } = trpc.fluxos.listComRecursos.useQuery();

  const acceptPendingSkuMutation = trpc.cadastrosSistema.acceptPendingSku.useMutation({
    onSuccess: () => {
      utils.cadastrosSistema.pendingSkusFromFaturamento.invalidate();
      utils.produtos.list.invalidate();
      toast.success("SKU aceito e cadastrado!");
    },
    onError: (error) => toast.error(error.message),
  });

  // Filtrar produtos por busca e fluxo
  const filteredProdutos = produtos?.filter((produto) => {
    const matchesSearch = searchTerm === "" || 
      produto.codItem?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      produto.descricao?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      produto.marca?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesFluxo = filterFluxo === "all" || produto.fluxo === filterFluxo;
    
    return matchesSearch && matchesFluxo;
  });

  // Obter lista única de fluxos para o filtro
  const uniqueFluxos = Array.from(new Set((produtos?.map(p => p.fluxo).filter((f): f is string => Boolean(f))) || []));
  
  const createMutation = trpc.produtos.create.useMutation({
    onSuccess: () => {
      utils.produtos.list.invalidate();
      toast.success("Produto criado com sucesso!");
      resetForm();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = trpc.produtos.update.useMutation({
    onSuccess: () => {
      utils.produtos.list.invalidate();
      toast.success("Produto atualizado com sucesso!");
      resetForm();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = trpc.produtos.delete.useMutation({
    onSuccess: () => {
      utils.produtos.list.invalidate();
      toast.success("Produto excluído com sucesso!");
    },
    onError: (error) => toast.error(error.message),
  });

  const importMutation = trpc.produtos.importBatch.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.count} produtos importados com sucesso!`);
      utils.produtos.list.invalidate();
      setParsedData([]);
      setFile(null);
      setImportProgress(100);
    },
    onError: (error) => {
      toast.error(`Erro na importação: ${error.message}`);
      setImportProgress(0);
    },
  });

  const resetForm = () => {
    setFormData({
      codItem: "", descricao: "", status: "ATIVO", statusId: "", tipoNegocio: "", tipoNegocioId: "",
      tipoEstoque: "MTS", tipoEstoqueId: "", linha: "", linhaId: "", modelo: "", modeloId: "",
      tamanho: "", tamanhoId: "", axlxp: "", marca: "", marcaId: "", grupo: "", ramoAtuacao: "",
      valorVenda: "", valorCusto: "", qtdePallet: "", loteEconomicoViavel: "", fluxo: "", fluxoId: "", caminho: "", pista: "",
      projetarEstatistica: true,
    });
    setEditingId(null);
    setIsOpen(false);
  };

  // Função para atualizar campo texto quando seleciona no dropdown
  const handleStatusChange = (value: string) => {
    const selected = statusList?.find(s => s.id.toString() === value);
    setFormData({ 
      ...formData, 
      statusId: value,
      status: selected?.nome?.toUpperCase() === "INATIVO" ? "INATIVO" : "ATIVO"
    });
  };

  const handleTipoNegocioChange = (value: string) => {
    const selected = tiposNegocioList?.find(s => s.id.toString() === value);
    setFormData({ 
      ...formData, 
      tipoNegocioId: value,
      tipoNegocio: selected?.nome || ""
    });
  };

  const handleTipoEstoqueChange = (value: string) => {
    const selected = tiposEstoqueList?.find(s => s.id.toString() === value);
    setFormData({ 
      ...formData, 
      tipoEstoqueId: value,
      tipoEstoque: selected?.nome?.toUpperCase() === "MTO" ? "MTO" : "MTS"
    });
  };

  const handleLinhaChange = (value: string) => {
    const selected = linhasList?.find(s => s.id.toString() === value);
    setFormData({ 
      ...formData, 
      linhaId: value,
      linha: selected?.nome || ""
    });
  };

  const handleModeloChange = (value: string) => {
    const selected = modelosList?.find(s => s.id.toString() === value);
    setFormData({ 
      ...formData, 
      modeloId: value,
      modelo: selected?.nome || ""
    });
  };

  const handleTamanhoChange = (value: string) => {
    const selected = tamanhosList?.find(s => s.id.toString() === value);
    setFormData({ 
      ...formData, 
      tamanhoId: value,
      tamanho: selected?.nome || ""
    });
  };

  const handleMarcaChange = (value: string) => {
    const selected = marcasList?.find(s => s.id.toString() === value);
    setFormData({ 
      ...formData, 
      marcaId: value,
      marca: selected?.nome || "",
      grupo: selected?.grupoMarca || "",
      ramoAtuacao: (selected as any)?.ramoAtuacao || ""
    });
  };

  // Handler para seleção de Fluxo - preenche automaticamente o campo Caminho
  const handleFluxoChange = (value: string) => {
    const selected = fluxosComRecursos?.find(f => f.id.toString() === value);
    const recursosNomes = selected?.recursos?.map((r: any) => r.nome).join(", ") || "";
    setFormData({ 
      ...formData, 
      fluxoId: value,
      fluxo: selected?.nome || "",
      caminho: recursosNomes
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      ...formData,
      statusId: formData.statusId ? parseInt(formData.statusId) : undefined,
      tipoNegocioId: formData.tipoNegocioId ? parseInt(formData.tipoNegocioId) : undefined,
      tipoEstoqueId: formData.tipoEstoqueId ? parseInt(formData.tipoEstoqueId) : undefined,
      linhaId: formData.linhaId ? parseInt(formData.linhaId) : undefined,
      modeloId: formData.modeloId ? parseInt(formData.modeloId) : undefined,
      tamanhoId: formData.tamanhoId ? parseInt(formData.tamanhoId) : undefined,
      marcaId: formData.marcaId ? parseInt(formData.marcaId) : undefined,
      valorVenda: formData.valorVenda || undefined,
      valorCusto: formData.valorCusto || undefined,
      qtdePallet: formData.qtdePallet ? parseInt(formData.qtdePallet) : undefined,
      loteEconomicoViavel: formData.loteEconomicoViavel ? parseInt(formData.loteEconomicoViavel) : undefined,
      pista: formData.pista ? parseInt(formData.pista) : undefined,
      fluxoId: formData.fluxoId ? parseInt(formData.fluxoId) : undefined,
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (produto: NonNullable<typeof produtos>[0]) => {
    setFormData({
      codItem: produto.codItem || "",
      descricao: produto.descricao || "",
      status: produto.status,
      statusId: produto.statusId?.toString() || "",
      tipoNegocio: produto.tipoNegocio || "",
      tipoNegocioId: produto.tipoNegocioId?.toString() || "",
      tipoEstoque: produto.tipoEstoque || "MTS",
      tipoEstoqueId: produto.tipoEstoqueId?.toString() || "",
      linha: produto.linha || "",
      linhaId: produto.linhaId?.toString() || "",
      modelo: produto.modelo || "",
      modeloId: produto.modeloId?.toString() || "",
      tamanho: produto.tamanho || "",
      tamanhoId: produto.tamanhoId?.toString() || "",
      axlxp: produto.axlxp || "",
      marca: produto.marca || "",
      marcaId: produto.marcaId?.toString() || "",
      grupo: produto.grupo || "",
      ramoAtuacao: produto.ramoAtuacao || "",
      valorVenda: produto.valorVenda || "",
      valorCusto: produto.valorCusto || "",
      qtdePallet: produto.qtdePallet?.toString() || "",
      loteEconomicoViavel: produto.loteEconomicoViavel?.toString() || "",
      fluxo: produto.fluxo || "",
      fluxoId: (produto as any).fluxoId?.toString() || "",
      caminho: produto.caminho || "",
      pista: produto.pista?.toString() || "",
      projetarEstatistica: produto.projetarEstatistica !== false,
    });
    setEditingId(produto.id);
    setIsOpen(true);
  };

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setErrors([]);
    setIsProcessing(true);
    setParsedData([]);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = event.target?.result;
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][];

        if (jsonData.length < 2) {
          setErrors(["Arquivo vazio ou sem dados"]);
          setIsProcessing(false);
          return;
        }

        const headers = jsonData[0] as string[];
        const rows: ParsedProduto[] = [];

        const parseNumber = (value: unknown): string => {
          if (value === null || value === undefined || value === "") return "";
          const num = Number(value);
          return isNaN(num) ? String(value).replace(",", ".") : num.toString();
        };

        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i] as unknown[];
          if (!row || row.length === 0) continue;

          const parsedRow: ParsedProduto = {};

          headers.forEach((header, index) => {
            const field = COLUMN_MAPPING[header?.trim()];
            if (!field) return;

            const value = row[index];
            if (value === null || value === undefined || value === "") return;

            switch (field) {
              case "codItem":
              case "descricao":
              case "tipoNegocio":
              case "linha":
              case "modelo":
              case "tamanho":
              case "axlxp":
              case "marca":
              case "grupo":
              case "ramoAtuacao":
              case "fluxo":
              case "caminho":
                (parsedRow as Record<string, unknown>)[field] = String(value).trim();
                break;
              case "status":
                const statusVal = String(value).toUpperCase();
                parsedRow.status = statusVal === "INATIVO" ? "INATIVO" : "ATIVO";
                break;
              case "tipoEstoque":
                const estoqueVal = String(value).toUpperCase();
                parsedRow.tipoEstoque = estoqueVal === "MTO" ? "MTO" : "MTS";
                break;
              case "valorVenda":
              case "valorCusto":
                (parsedRow as Record<string, unknown>)[field] = parseNumber(value);
                break;
              case "qtdePallet":
              case "loteEconomicoViavel":
              case "pista":
                const numVal = parseInt(parseNumber(value));
                if (!isNaN(numVal)) {
                  (parsedRow as Record<string, unknown>)[field] = numVal;
                }
                break;
            }
          });

          if (parsedRow.codItem || parsedRow.descricao) {
            rows.push(parsedRow);
          }
        }

        setParsedData(rows);
        setIsProcessing(false);
        toast.success(`${rows.length} produtos carregados do arquivo`);
      } catch (error) {
        setErrors([`Erro ao processar arquivo: ${error}`]);
        setIsProcessing(false);
      }
    };

    reader.readAsArrayBuffer(selectedFile);
  }, []);

  const handleImport = async () => {
    if (parsedData.length === 0) return;
    setImportProgress(10);
    await importMutation.mutateAsync(parsedData);
  };

  const downloadTemplate = () => {
    const headers = [
      "Cod Item", "Descrição", "Status", "Tipo Negocio", "Tipo Estoque", "Linha", "Modelo",
      "Tamanho", "A X L X P", "Marca", "Grupo", "Ramo Atuação", "Valor Venda", "Valor Custo",
      "Qtde Pallet", "Lote Economico Viável", "Fluxo", "Caminho", "Pista"
    ];
    const exampleRow = [
      "99.99.999999", "Sacola Classic P", "Ativo", "VAR", "MTS", "Classic", "Sacola",
      "P", "165 x 130 x 65", "Marca X", "Grupo A", "Varejo", "10.50", "5.25",
      "100", "500", "Fluxo 1", "Caminho A", "1"
    ];
    
    const ws = XLSX.utils.aoa_to_sheet([headers, exampleRow]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Produtos");
    XLSX.writeFile(wb, "template_produtos.xlsx");
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  const pendingSkusPreview = pendingSkus.slice(0, 50);
  const acceptingCod = acceptPendingSkuMutation.isPending
    ? acceptPendingSkuMutation.variables?.codMaterial
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Produtos</h1>
          <p className="text-muted-foreground">Gerencie o cadastro de produtos</p>
        </div>
      </div>

      {(loadingPendingSkus || pendingSkus.length > 0) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              SKUs pendentes do Faturamento
              {!loadingPendingSkus && (
                <Badge variant="secondary">{pendingSkus.length}</Badge>
              )}
            </CardTitle>
            <CardDescription>
              SKUs presentes no faturamento que ainda não estão no cadastro de produtos
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingPendingSkus ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : pendingSkus.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">Nenhum SKU pendente</p>
            ) : (
              <div className="rounded-md border max-h-80 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Marca</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="w-[120px]">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingSkusPreview.map((sku) => (
                      <TableRow key={sku.codMaterial}>
                        <TableCell className="font-mono text-sm">{sku.codMaterial}</TableCell>
                        <TableCell>{sku.marca || "-"}</TableCell>
                        <TableCell className="max-w-md truncate">{sku.descricaoItem || "-"}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={acceptPendingSkuMutation.isPending}
                            onClick={() =>
                              acceptPendingSkuMutation.mutate({ codMaterial: sku.codMaterial })
                            }
                          >
                            {acceptingCod === sku.codMaterial ? (
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
                {pendingSkus.length > 50 && (
                  <p className="text-xs text-muted-foreground px-3 py-2 border-t">
                    Exibindo 50 de {pendingSkus.length} SKUs pendentes
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="lista" className="space-y-4">
        <TabsList>
          <TabsTrigger value="lista">Lista de Produtos</TabsTrigger>
          <TabsTrigger value="importar">Importar Excel</TabsTrigger>
        </TabsList>

        <TabsContent value="lista" className="space-y-4">
          {/* Barra de filtros */}
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Input
                placeholder="Buscar por código, descrição ou marca..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-sm"
              />
            </div>
            <div className="w-48">
              <Select value={filterFluxo} onValueChange={setFilterFluxo}>
                <SelectTrigger>
                  <SelectValue placeholder="Filtrar por fluxo..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os fluxos</SelectItem>
                  {uniqueFluxos.sort().map((fluxo) => (
                    <SelectItem key={fluxo} value={fluxo}>
                      {fluxo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => {
              if (produtos && produtos.length > 0) {
                exportToCsv(produtos, "produtos", [
                  { key: "codItem", title: "Código Item" },
                  { key: "descricao", title: "Descrição" },
                  { key: "status", title: "Status" },
                  { key: "tipoNegocio", title: "Tipo Negócio" },
                  { key: "tipoEstoque", title: "Tipo Estoque" },
                  { key: "linha", title: "Linha" },
                  { key: "modelo", title: "Modelo" },
                  { key: "tamanho", title: "Tamanho" },
                  { key: "marca", title: "Marca" },
                ]);
              } else {
                toast.error("Não há dados para exportar");
              }
            }}><Download className="h-4 w-4 mr-2" />Exportar CSV</Button>
            <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Novo Produto
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingId ? "Editar Produto" : "Novo Produto"}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="codItem">Código Item</Label>
                      <Input
                        id="codItem"
                        placeholder="99.99.999999"
                        value={formData.codItem}
                        onChange={(e) => setFormData({ ...formData, codItem: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2 col-span-2">
                      <Label htmlFor="descricao">Descrição</Label>
                      <Input
                        id="descricao"
                        value={formData.descricao}
                        onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="status">Status</Label>
                      <Select value={formData.statusId} onValueChange={handleStatusChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent>
                          {statusList?.map((status) => (
                            <SelectItem key={status.id} value={status.id.toString()}>
                              {status.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="tipoNegocio">Tipo Negócio</Label>
                      <Select value={formData.tipoNegocioId} onValueChange={handleTipoNegocioChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent>
                          {tiposNegocioList?.map((tipo) => (
                            <SelectItem key={tipo.id} value={tipo.id.toString()}>
                              {tipo.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="tipoEstoque">Tipo Estoque</Label>
                      <Select value={formData.tipoEstoqueId} onValueChange={handleTipoEstoqueChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent>
                          {tiposEstoqueList?.map((tipo) => (
                            <SelectItem key={tipo.id} value={tipo.id.toString()}>
                              {tipo.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="linha">Linha</Label>
                      <Select value={formData.linhaId} onValueChange={handleLinhaChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent>
                          {linhasList?.map((linha) => (
                            <SelectItem key={linha.id} value={linha.id.toString()}>
                              {linha.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="modelo">Modelo</Label>
                      <Select value={formData.modeloId} onValueChange={handleModeloChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent>
                          {modelosList?.map((modelo) => (
                            <SelectItem key={modelo.id} value={modelo.id.toString()}>
                              {modelo.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="tamanho">Tamanho</Label>
                      <Select value={formData.tamanhoId} onValueChange={handleTamanhoChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent>
                          {tamanhosList?.map((tamanho) => (
                            <SelectItem key={tamanho.id} value={tamanho.id.toString()}>
                              {tamanho.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="axlxp">A x L x P</Label>
                      <Input
                        id="axlxp"
                        placeholder="165 x 130 x 65"
                        value={formData.axlxp}
                        onChange={(e) => setFormData({ ...formData, axlxp: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="marca">Marca</Label>
                      <Select value={formData.marcaId} onValueChange={handleMarcaChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent>
                          {marcasList?.map((marca) => (
                            <SelectItem key={marca.id} value={marca.id.toString()}>
                              {marca.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="grupo">Grupo <span className="text-xs text-muted-foreground">(preenchido pela marca)</span></Label>
                      <Input
                        id="grupo"
                        value={formData.grupo}
                        readOnly
                        className="bg-muted"
                        placeholder="Selecione uma marca"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ramoAtuacao">Ramo Atuação <span className="text-xs text-muted-foreground">(preenchido pela marca)</span></Label>
                      <Input
                        id="ramoAtuacao"
                        value={formData.ramoAtuacao}
                        readOnly
                        className="bg-muted"
                        placeholder="Selecione uma marca"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="fluxo">Fluxo</Label>
                      <Select value={formData.fluxoId} onValueChange={handleFluxoChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o fluxo..." />
                        </SelectTrigger>
                        <SelectContent>
                          {fluxosComRecursos?.map((fluxo) => (
                            <SelectItem key={fluxo.id} value={fluxo.id.toString()}>
                              {fluxo.nome} ({fluxo.recursos?.length || 0} recursos)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="valorVenda">Valor Venda</Label>
                      <Input
                        id="valorVenda"
                        type="number"
                        step="0.01"
                        value={formData.valorVenda}
                        onChange={(e) => setFormData({ ...formData, valorVenda: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="valorCusto">Valor Custo</Label>
                      <Input
                        id="valorCusto"
                        type="number"
                        step="0.01"
                        value={formData.valorCusto}
                        onChange={(e) => setFormData({ ...formData, valorCusto: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="qtdePallet">Qtde Pallet</Label>
                      <Input
                        id="qtdePallet"
                        type="number"
                        value={formData.qtdePallet}
                        onChange={(e) => setFormData({ ...formData, qtdePallet: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="loteEconomicoViavel">Lote Econômico</Label>
                      <Input
                        id="loteEconomicoViavel"
                        type="number"
                        value={formData.loteEconomicoViavel}
                        onChange={(e) => setFormData({ ...formData, loteEconomicoViavel: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="caminho">Caminho <span className="text-xs text-muted-foreground">(preenchido pelo fluxo)</span></Label>
                      <Input
                        id="caminho"
                        value={formData.caminho}
                        readOnly
                        className="bg-muted"
                        placeholder="Selecione um fluxo"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pista">Pista</Label>
                      <Input
                        id="pista"
                        type="number"
                        value={formData.pista}
                        onChange={(e) => setFormData({ ...formData, pista: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3 rounded-md border p-3">
                    <Switch
                      id="projetarEstatistica"
                      checked={formData.projetarEstatistica}
                      onCheckedChange={checked =>
                        setFormData({ ...formData, projetarEstatistica: checked })
                      }
                    />
                    <div>
                      <Label htmlFor="projetarEstatistica">Projetar estatística</Label>
                      <p className="text-xs text-muted-foreground">
                        Se desligado, o SKU fica fora do motor estatístico (Passo 1/3).
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="outline" onClick={resetForm}>
                      Cancelar
                    </Button>
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
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Tipo Negócio</TableHead>
                      <TableHead>Tipo Estoque</TableHead>
                      <TableHead>Linha</TableHead>
                      <TableHead>Modelo</TableHead>
                      <TableHead>Fluxo</TableHead>
                      <TableHead>Projetar</TableHead>
                      <TableHead className="w-[100px]">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProdutos?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                          {searchTerm || filterFluxo !== "all" ? "Nenhum produto encontrado com os filtros aplicados" : "Nenhum produto cadastrado"}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredProdutos?.map((produto) => (
                        <TableRow key={produto.id}>
                          <TableCell className="font-mono">{produto.codItem || "-"}</TableCell>
                          <TableCell>{produto.descricao || produto.nome || "-"}</TableCell>
                          <TableCell>
                            <Badge variant={produto.status === "ATIVO" ? "default" : "secondary"}>
                              {produto.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{produto.tipoNegocio || "-"}</TableCell>
                          <TableCell>{produto.tipoEstoque || "-"}</TableCell>
                          <TableCell>{produto.linha || "-"}</TableCell>
                          <TableCell>{produto.modelo || "-"}</TableCell>
                          <TableCell>{produto.fluxo || "-"}</TableCell>
                          <TableCell>
                            <Badge variant={produto.projetarEstatistica !== false ? "default" : "secondary"}>
                              {produto.projetarEstatistica !== false ? "Sim" : "Não"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button variant="ghost" size="icon" onClick={() => handleEdit(produto)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="icon">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Tem certeza que deseja excluir o produto <strong>{produto.codItem}</strong>? Esta ação não pode ser desfeita.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => deleteMutation.mutate({ id: produto.id })} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
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
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                Importar Produtos via Excel
              </CardTitle>
              <CardDescription>
                Faça upload de um arquivo Excel (.xlsx, .xls) ou CSV com os dados dos produtos
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <Button variant="outline" onClick={downloadTemplate}>
                  <Download className="h-4 w-4 mr-2" />
                  Baixar Template
                </Button>
                <div className="flex-1">
                  <Input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileChange}
                    className="cursor-pointer"
                  />
                </div>
              </div>

              {isProcessing && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processando arquivo...
                </div>
              )}

              {errors.length > 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Erros encontrados</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc list-inside">
                      {errors.map((error, i) => (
                        <li key={i}>{error}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {parsedData.length > 0 && (
                <>
                  <Alert>
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertTitle>Arquivo processado</AlertTitle>
                    <AlertDescription>
                      {parsedData.length} produtos prontos para importação
                    </AlertDescription>
                  </Alert>

                  <div className="border rounded-lg overflow-auto max-h-[400px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Código</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Tipo Negócio</TableHead>
                          <TableHead>Tipo Estoque</TableHead>
                          <TableHead>Linha</TableHead>
                          <TableHead>Modelo</TableHead>
                          <TableHead>Fluxo</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {parsedData.slice(0, 10).map((row, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-mono">{row.codItem || "-"}</TableCell>
                            <TableCell>{row.descricao || "-"}</TableCell>
                            <TableCell>{row.status || "-"}</TableCell>
                            <TableCell>{row.tipoNegocio || "-"}</TableCell>
                            <TableCell>{row.tipoEstoque || "-"}</TableCell>
                            <TableCell>{row.linha || "-"}</TableCell>
                            <TableCell>{row.modelo || "-"}</TableCell>
                            <TableCell>{row.fluxo || "-"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {parsedData.length > 10 && (
                    <p className="text-sm text-muted-foreground">
                      Mostrando 10 de {parsedData.length} registros
                    </p>
                  )}

                  {importProgress > 0 && importProgress < 100 && (
                    <Progress value={importProgress} className="w-full" />
                  )}

                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setParsedData([]);
                        setFile(null);
                      }}
                    >
                      Cancelar
                    </Button>
                    <Button onClick={handleImport} disabled={importMutation.isPending}>
                      {importMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      <Upload className="h-4 w-4 mr-2" />
                      Importar {parsedData.length} Produtos
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
