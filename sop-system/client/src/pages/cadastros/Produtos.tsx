import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { textMatchesSearch } from "@shared/text-search";
import { trpc } from "@/lib/trpc";
import { Plus, Pencil, Trash2, Loader2, Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { formatPreco4, rotuloOrigemPrecoCadastro } from "@shared/pv-preco-round";
import { exportToCsv } from "@/lib/exportCsv";
import { ProdutoFatoresSazonaisSection } from "@/components/ProdutoFatoresSazonaisSection";
import { PendingSkuDeParaAcceptDialog } from "@/components/cadastros/PendingSkuDeParaAcceptDialog";
import { FATOR_MESES_LABEL } from "@shared/sku-fator-sazonalidade";
import * as XLSX from "xlsx";

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
  const [filterFator, setFilterFator] = useState<"all" | "com" | "sem">("all");
  const [somenteSemPreco, setSomenteSemPreco] = useState(false);

  const utils = trpc.useUtils();
  const { data: produtos, isLoading } = trpc.produtos.list.useQuery();
  const { data: idsComFator = [] } = trpc.produtos.idsComFatorSazonal.useQuery();
  const comFatorSet = useMemo(() => new Set(idsComFator), [idsComFator]);

  const importFatoresMutation = trpc.produtos.importSazonalidadeFatores.useMutation({
    onSuccess: result => {
      utils.produtos.idsComFatorSazonal.invalidate();
      toast.success(`${result.atualizados} SKU(s) com fatores importados`);
      if (result.erros.length) {
        toast.error(`${result.erros.length} linha(s) com erro — veja o console`);
        console.warn("[import fatores]", result.erros);
      }
    },
    onError: e => toast.error(e.message),
  });
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

  const acceptPendingSkusWithDeParaMutation =
    trpc.cadastrosSistema.acceptPendingSkusWithDePara.useMutation({
      onSuccess: result => {
        utils.cadastrosSistema.pendingSkusFromFaturamento.invalidate();
        utils.produtos.list.invalidate();
        utils.deParaCodigos.list.invalidate();
        utils.deParaCodigos.listEnriched.invalidate();
        setSelectedPendingSkus(new Set());
        setAcceptDialogSkus(null);
        toast.success(
          `${result.criados} SKU(s) cadastrados` +
            (result.deParaCriados ? ` · ${result.deParaCriados} De-Para` : "") +
            (result.erros.length ? ` · ${result.erros.length} com erro` : "")
        );
      },
      onError: error => toast.error(error.message),
    });

  const [pendingSkuSearch, setPendingSkuSearch] = useState("");
  const [selectedPendingSkus, setSelectedPendingSkus] = useState<Set<string>>(new Set());
  const [acceptDialogSkus, setAcceptDialogSkus] = useState<
    Array<{ codMaterial: string; marca?: string | null; descricaoItem?: string | null }> | null
  >(null);

  const filteredPendingSkus = useMemo(() => {
    const term = pendingSkuSearch.trim();
    if (!term) return pendingSkus;
    return pendingSkus.filter(sku =>
      textMatchesSearch(
        [sku.codMaterial, sku.marca, sku.descricaoItem].filter(Boolean).join(" "),
        term
      )
    );
  }, [pendingSkus, pendingSkuSearch]);

  const allFilteredPendingSelected =
    filteredPendingSkus.length > 0 &&
    filteredPendingSkus.every(s => selectedPendingSkus.has(s.codMaterial));

  // Filtrar produtos por busca e fluxo
  const filteredProdutos = produtos?.filter((produto) => {
    const matchesSearch = searchTerm === "" || 
      produto.codItem?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      produto.descricao?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      produto.marca?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesFluxo = filterFluxo === "all" || produto.fluxo === filterFluxo;
    const temFator = comFatorSet.has(produto.id);
    const matchesFator =
      filterFator === "all" || (filterFator === "com" ? temFator : !temFator);
    const preco = Number(produto.precoUnitario || produto.valorVenda || 0);
    const matchesPreco = !somenteSemPreco || preco <= 0;

    return matchesSearch && matchesFluxo && matchesFator && matchesPreco;
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

  const handleImportFatores = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      const rows: Array<{ sku: string; fatores: number[] }> = [];
      for (const row of json) {
        const sku = String(
          row.SKU ?? row.sku ?? row["Cod Item"] ?? row.CodItem ?? Object.values(row)[0] ?? ""
        ).trim();
        if (!sku) continue;
        const fatores: number[] = [];
        for (let i = 0; i < 12; i++) {
          const label = FATOR_MESES_LABEL[i];
          const raw =
            row[label] ??
            row[label.toLowerCase()] ??
            row[`M${i + 1}`] ??
            row[`m${i + 1}`];
          const n = Number(String(raw ?? "0").replace(",", "."));
          fatores.push(Number.isFinite(n) ? n : 0);
        }
        rows.push({ sku, fatores });
      }
      if (rows.length === 0) {
        toast.error("Nenhuma linha no arquivo.");
        return;
      }
      importFatoresMutation.mutate(rows);
    } catch (e) {
      toast.error(`Falha ao ler planilha: ${String(e)}`);
    }
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
      valorVenda: produto.precoUnitario
        ? formatPreco4(Number(produto.precoUnitario)).replace(/\./g, "").replace(",", ".")
        : produto.valorVenda || "",
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

  const isPending = createMutation.isPending || updateMutation.isPending;

  const openPendingAcceptDialog = (mode: "selected" | "filtered" | "single", sku?: (typeof pendingSkus)[0]) => {
    if (mode === "single" && sku) {
      setAcceptDialogSkus([sku]);
      return;
    }
    const list =
      mode === "selected" && selectedPendingSkus.size > 0
        ? pendingSkus.filter(s => selectedPendingSkus.has(s.codMaterial))
        : filteredPendingSkus;
    if (!list.length) {
      toast.error("Nenhum SKU para aceitar.");
      return;
    }
    setAcceptDialogSkus(list);
  };

  return (
    <div className="min-w-0 max-w-full space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Produtos</h1>
          <p className="text-muted-foreground">
            Gerencie o cadastro de produtos. A única importação manual do S&amp;OP é o Excel do CRM na Colaboração
            Comercial.
          </p>
        </div>
      </div>

      {(loadingPendingSkus || pendingSkus.length > 0) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              SKUs novos (Faturamento)
              {!loadingPendingSkus && (
                <Badge variant="secondary">{pendingSkus.length}</Badge>
              )}
            </CardTitle>
            <CardDescription>
              Códigos em Bases/Faturamento que ainda não estão em Produtos. Aceite para liberar em
              Skus Projetar e De-Para (mesma regra do aceite individual).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label htmlFor="pending-sku-search">Filtrar lista</Label>
                <Input
                  id="pending-sku-search"
                  className="w-72"
                  placeholder="Código, marca ou descrição…"
                  value={pendingSkuSearch}
                  onChange={e => setPendingSkuSearch(e.target.value)}
                />
              </div>
              <p className="text-sm text-muted-foreground pb-2">
                {filteredPendingSkus.length.toLocaleString("pt-BR")} de{" "}
                {pendingSkus.length.toLocaleString("pt-BR")} pendente(s)
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={
                  filteredPendingSkus.length === 0 || acceptPendingSkusWithDeParaMutation.isPending
                }
                onClick={() => openPendingAcceptDialog("filtered")}
              >
                Aceitar todos (filtro atual)
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={
                  selectedPendingSkus.size === 0 || acceptPendingSkusWithDeParaMutation.isPending
                }
                onClick={() => openPendingAcceptDialog("selected")}
              >
                Aceitar selecionados ({selectedPendingSkus.size})
              </Button>
            </div>
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
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allFilteredPendingSelected}
                          onCheckedChange={checked => {
                            if (!checked) {
                              setSelectedPendingSkus(prev => {
                                const next = new Set(prev);
                                filteredPendingSkus.forEach(s => next.delete(s.codMaterial));
                                return next;
                              });
                              return;
                            }
                            setSelectedPendingSkus(prev => {
                              const next = new Set(prev);
                              filteredPendingSkus.forEach(s => next.add(s.codMaterial));
                              return next;
                            });
                          }}
                          aria-label="Selecionar todos filtrados"
                        />
                      </TableHead>
                      <TableHead>Código</TableHead>
                      <TableHead>Marca</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="w-[120px]">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPendingSkus.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                          {pendingSkuSearch.trim()
                            ? "Nenhum SKU encontrado neste filtro"
                            : "Nenhum SKU pendente"}
                        </TableCell>
                      </TableRow>
                    ) : (
                    filteredPendingSkus.map((sku) => (
                      <TableRow key={sku.codMaterial}>
                        <TableCell>
                          <Checkbox
                            checked={selectedPendingSkus.has(sku.codMaterial)}
                            onCheckedChange={checked => {
                              setSelectedPendingSkus(prev => {
                                const next = new Set(prev);
                                if (checked) next.add(sku.codMaterial);
                                else next.delete(sku.codMaterial);
                                return next;
                              });
                            }}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-sm">{sku.codMaterial}</TableCell>
                        <TableCell>{sku.marca || "-"}</TableCell>
                        <TableCell className="max-w-md truncate">{sku.descricaoItem || "-"}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={acceptPendingSkusWithDeParaMutation.isPending}
                            onClick={() => openPendingAcceptDialog("single", sku)}
                          >
                            Aceitar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}

            <PendingSkuDeParaAcceptDialog
              open={acceptDialogSkus !== null}
              onOpenChange={open => !open && setAcceptDialogSkus(null)}
              skus={acceptDialogSkus ?? []}
              mode="produtos"
              isPending={acceptPendingSkusWithDeParaMutation.isPending}
              onConfirm={items => acceptPendingSkusWithDeParaMutation.mutate({ items })}
            />
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
          {/* Barra de filtros */}
          <div className="flex flex-wrap items-center gap-3">
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
            <Button type="button" variant={somenteSemPreco ? "default" : "outline"} onClick={() => setSomenteSemPreco(v => !v)}>
              Sem preço (
              {(produtos ?? []).filter(p => p.status === "ATIVO" && Number(p.precoUnitario || p.valorVenda || 0) <= 0).length}
              )
            </Button>
            <Select
              value={filterFator}
              onValueChange={v => setFilterFator(v as "all" | "com" | "sem")}
            >
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Fator %" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Fator: todos</SelectItem>
                <SelectItem value="com">Com fator %</SelectItem>
                <SelectItem value="sem">Sem fator %</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent">
              <Upload className="h-4 w-4" />
              Importar fatores % (SKU + Jan…Dez)
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) void handleImportFatores(f);
                  e.target.value = "";
                }}
              />
            </Label>
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
                  { key: "precoUnitario", title: "Preço unitário" },
                  { key: "precoOrigem", title: "Origem preço" },
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
                        step="0.0001"
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

                  <ProdutoFatoresSazonaisSection produtoId={editingId} enabled={isOpen} />

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
            <CardContent className="min-w-0 p-0">
              <div className="w-full min-w-0 max-w-full overflow-x-auto">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Preço unitário</TableHead>
                      <TableHead>Origem preço</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Tipo Negócio</TableHead>
                      <TableHead>Tipo Estoque</TableHead>
                      <TableHead>Linha</TableHead>
                      <TableHead>Modelo</TableHead>
                      <TableHead>Fluxo</TableHead>
                      <TableHead>Fator %</TableHead>
                      <TableHead>Projetar</TableHead>
                      <TableHead className="w-[100px]">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProdutos?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                          {searchTerm || filterFluxo !== "all" ? "Nenhum produto encontrado com os filtros aplicados" : "Nenhum produto cadastrado"}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredProdutos?.map((produto) => (
                        <TableRow key={produto.id}>
                          <TableCell className="font-mono">{produto.codItem || "-"}</TableCell>
                          <TableCell className="tabular-nums">
                            {Number(produto.precoUnitario || 0) > 0 ? formatPreco4(Number(produto.precoUnitario)) : "—"}
                          </TableCell>
                          <TableCell
                            title={
                              produto.precoAtualizadoEm
                                ? `Atualizado em ${new Date(produto.precoAtualizadoEm).toLocaleString("pt-BR")}`
                                : undefined
                            }
                          >
                            {rotuloOrigemPrecoCadastro(produto.precoOrigem)}
                          </TableCell>
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
                            <Badge variant={comFatorSet.has(produto.id) ? "default" : "secondary"}>
                              {comFatorSet.has(produto.id) ? "Com fator %" : "Sem fator %"}
                            </Badge>
                          </TableCell>
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
              </div>
            </CardContent>
          </Card>
      </div>
    </div>
  );
}
