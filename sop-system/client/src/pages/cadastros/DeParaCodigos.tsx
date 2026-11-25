import { useMemo, useState } from "react";
import { textMatchesSearch } from "@shared/text-search";
import { Checkbox } from "@/components/ui/checkbox";
import { PendingSkuDeParaAcceptDialog } from "@/components/cadastros/PendingSkuDeParaAcceptDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { Plus, Pencil, Trash2, Loader2, ArrowRight, Upload, Download, Search } from "lucide-react";
import { exportToCsv } from "@/lib/exportCsv";
import { toast } from "sonner";
import * as XLSX from "xlsx";

export default function DeParaCodigos() {
  const [activeTab, setActiveTab] = useState("lista");
  
  return (
    <div className="min-w-0 max-w-full space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-3xl font-bold">De-Para de Códigos</h1>
        <p className="text-muted-foreground">
          Migração de códigos SKU. Use a aba Skus Novos para aceitar códigos do faturamento.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="lista">Lista De-Para</TabsTrigger>
          <TabsTrigger value="novos">Skus Novos</TabsTrigger>
        </TabsList>

        <TabsContent value="lista">
          <ListaTab />
        </TabsContent>

        <TabsContent value="novos">
          <SkusNovosTab />
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
  const {
    data: deParaList,
    isLoading,
    isError,
    error,
    refetch,
  } = trpc.deParaCodigos.listEnriched.useQuery();

  const importBatch = trpc.deParaCodigos.importBatch.useMutation({
    onSuccess: () => {
      utils.deParaCodigos.list.invalidate();
      utils.deParaCodigos.listEnriched.invalidate();
      utils.deParaCodigos.diagnostico.invalidate();
      toast.success("De-Para criado");
      resetForm();
    },
    onError: e => toast.error(e.message),
  });
  const { data: diagnostico } = trpc.deParaCodigos.diagnostico.useQuery();

  const createMutation = trpc.deParaCodigos.create.useMutation({
    onSuccess: () => {
      utils.deParaCodigos.list.invalidate();
      utils.deParaCodigos.listEnriched.invalidate();
      utils.deParaCodigos.diagnostico.invalidate();
      toast.success("De-Para criado com sucesso!");
      resetForm();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = trpc.deParaCodigos.update.useMutation({
    onSuccess: () => {
      utils.deParaCodigos.list.invalidate();
      utils.deParaCodigos.listEnriched.invalidate();
      toast.success("De-Para atualizado com sucesso!");
      resetForm();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = trpc.deParaCodigos.delete.useMutation({
    onSuccess: () => {
      utils.deParaCodigos.list.invalidate();
      utils.deParaCodigos.listEnriched.invalidate();
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
      return;
    }
    const antigos = formData.skuAntigo
      .split(/[\n,;]+/)
      .map(s => s.trim())
      .filter(Boolean);
    if (antigos.length > 1) {
      importBatch.mutate(antigos.map(skuAntigo => ({ skuAntigo, skuNovo: formData.skuNovo })));
      return;
    }
    createMutation.mutate({ skuAntigo: antigos[0] || formData.skuAntigo, skuNovo: formData.skuNovo });
  };

  const handleEdit = (item: NonNullable<typeof deParaList>[0]) => {
    setFormData({
      skuAntigo: item.skuAntigo,
      skuNovo: item.skuNovo,
    });
    setEditingId(item.id);
    setIsOpen(true);
  };

  const filteredList =
    deParaList?.filter(item =>
      textMatchesSearch(
        [item.skuAntigo, item.skuNovo, item.descricaoAntigo, item.descricaoNovo]
          .filter(Boolean)
          .join(" "),
        searchTerm
      )
    ) || [];

  const gruposDePara = (() => {
    const map = new Map<string, typeof filteredList>();
    for (const item of filteredList) {
      const key = item.skuNovo;
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return [...map.entries()];
  })();

  const handleExport = () => {
    if (!deParaList || deParaList.length === 0) {
      toast.error("Nenhum dado para exportar");
      return;
    }
    exportToCsv(
      filteredList.map(r => ({
        skuAntigo: r.skuAntigo,
        descricaoAntigo: r.descricaoAntigo ?? "—",
        skuNovo: r.skuNovo,
        descricaoNovo: r.descricaoNovo ?? "—",
      })),
      "de-para-codigos",
      [
        { key: "skuAntigo", title: "SKU Antigo" },
        { key: "descricaoAntigo", title: "Descrição (antigo)" },
        { key: "skuNovo", title: "SKU Novo" },
        { key: "descricaoNovo", title: "Descrição (novo)" },
      ]
    );
    toast.success("Arquivo exportado com sucesso!");
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div>
          <CardTitle>Mapeamento De-Para</CardTitle>
          <CardDescription>
            Um SKU antigo aponta para um único novo (1:1 ou N:1). Cadeia A→B→C resolve até o código final.
            {diagnostico ? (
              <span className="block mt-1">
                {diagnostico.total} mapeamentos · {diagnostico.gruposNpara1} grupos N:1
                {diagnostico.loops.length ? ` · loops: ${diagnostico.loops.length}` : ""}
                {diagnostico.conflitos1n.length ? ` · 1:N: ${diagnostico.conflitos1n.length}` : ""}
              </span>
            ) : null}
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
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
                  <Label>SKUs antigos * (um por linha para N:1)</Label>
                  <textarea
                    className="flex min-h-[88px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={formData.skuAntigo}
                    onChange={e => setFormData({ ...formData, skuAntigo: e.target.value })}
                    placeholder={"80.02.000100\n80.02.000101"}
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
              placeholder="Buscar por SKU ou descrição..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        {isError ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive space-y-2">
            <p>Não foi possível carregar os mapeamentos De-Para.</p>
            <p className="text-xs opacity-90">{error?.message ?? "Erro desconhecido no servidor."}</p>
            <Button type="button" size="sm" variant="outline" onClick={() => refetch()}>
              Tentar novamente
            </Button>
          </div>
        ) : isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin" /></div>
        ) : (
          <>
          <div className="space-y-3 md:hidden">
            {gruposDePara.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {searchTerm ? "Nenhum resultado encontrado" : "Nenhum mapeamento cadastrado"}
              </p>
            ) : null}
            {gruposDePara.map(([skuNovo, antigos]) => (
              <article key={skuNovo} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm">{skuNovo}</span>
                  <Badge variant="outline">{antigos.length > 1 ? "N:1" : "1:1"}</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{antigos[0]?.descricaoNovo || "—"}</p>
                <ul className="mt-2 space-y-1">
                  {antigos.map(a => (
                    <li key={a.id} className="text-xs">
                      <span className="font-mono">{a.skuAntigo}</span>
                      <span className="ml-1 text-muted-foreground">{a.descricaoAntigo || "—"}</span>
                    </li>
                  ))}
                </ul>
                <Button className="mt-2" size="sm" variant="outline" onClick={() => handleEdit(antigos[0]!)}>
                  Editar
                </Button>
              </article>
            ))}
          </div>
          <div className="hidden w-full min-w-0 max-w-full overflow-x-auto rounded-md border md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[120px]">SKU Antigo</TableHead>
                <TableHead className="min-w-[200px]">Descrição (antigo)</TableHead>
                <TableHead className="w-10"></TableHead>
                <TableHead className="min-w-[120px]">SKU Novo</TableHead>
                <TableHead className="min-w-[200px]">Descrição (novo)</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredList.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    {searchTerm ? "Nenhum resultado encontrado" : "Nenhum mapeamento cadastrado"}
                  </TableCell>
                </TableRow>
              ) : (
                gruposDePara.map(([skuNovo, antigos]) => (
                  <TableRow key={skuNovo}>
                    <TableCell className="align-top text-sm">
                      <details>
                        <summary className="cursor-pointer">
                          {antigos.length} antigo(s)
                        </summary>
                        <ul className="mt-1 space-y-1">
                          {antigos.map(a => (
                            <li key={a.id} className="font-mono text-xs">
                              {a.skuAntigo}
                              <span className="ml-1 text-muted-foreground">{a.descricaoAntigo || "—"}</span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    </TableCell>
                    <TableCell className="max-w-xs whitespace-normal text-sm text-muted-foreground">
                      {antigos.map(a => a.descricaoAntigo).filter(Boolean)[0] || "—"}
                    </TableCell>
                    <TableCell className="text-center"><ArrowRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                    <TableCell className="font-mono text-sm">
                      {skuNovo}
                      <Badge variant="outline" className="ml-2">{antigos.length > 1 ? "N:1" : "1:1"}</Badge>
                    </TableCell>
                    <TableCell className="max-w-xs whitespace-normal text-sm text-muted-foreground">
                      {antigos[0]?.descricaoNovo || "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => handleEdit(antigos[0]!)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          </div>
          </>
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

function SkusNovosTab() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [acceptDialogSkus, setAcceptDialogSkus] = useState<
    Array<{ codMaterial: string; marca?: string | null; descricaoItem?: string | null }> | null
  >(null);

  const { data: pendingSkus = [], isLoading } = trpc.cadastrosSistema.pendingSkusFromFaturamento.useQuery();

  const acceptMutation = trpc.cadastrosSistema.acceptPendingSkusWithDePara.useMutation({
    onSuccess: result => {
      utils.cadastrosSistema.pendingSkusFromFaturamento.invalidate();
      utils.produtos.list.invalidate();
      utils.deParaCodigos.listEnriched.invalidate();
      setSelected(new Set());
      setAcceptDialogSkus(null);
      toast.success(
        `${result.criados} SKU(s) cadastrados` +
          (result.deParaCriados ? ` · ${result.deParaCriados} De-Para` : "")
      );
    },
    onError: error => toast.error(error.message),
  });

  const filtered = useMemo(() => {
    const term = search.trim();
    if (!term) return pendingSkus;
    return pendingSkus.filter(sku =>
      textMatchesSearch(
        [sku.codMaterial, sku.marca, sku.descricaoItem].filter(Boolean).join(" "),
        term
      )
    );
  }, [pendingSkus, search]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every(s => selected.has(s.codMaterial));

  const openAccept = (mode: "single" | "selected" | "filtered", sku?: (typeof pendingSkus)[0]) => {
    if (mode === "single" && sku) {
      setAcceptDialogSkus([sku]);
      return;
    }
    const list =
      mode === "selected"
        ? pendingSkus.filter(s => selected.has(s.codMaterial))
        : filtered;
    if (!list.length) {
      toast.error("Nenhum SKU para aceitar.");
      return;
    }
    setAcceptDialogSkus(list);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Skus Novos
          {!isLoading && <Badge variant="secondary">{pendingSkus.length}</Badge>}
        </CardTitle>
        <CardDescription>
          SKUs que estão em Bases/Faturamento e ainda não estão em Produtos. Aceitar abre o De-Para sugerido por
          similaridade de descrição.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="depara-pending-search">Filtrar lista</Label>
            <Input
              id="depara-pending-search"
              className="w-72"
              placeholder="Código, marca ou descrição…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!filtered.length || acceptMutation.isPending}
            onClick={() => openAccept("filtered")}
          >
            Aceitar todos (filtro atual)
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!selected.size || acceptMutation.isPending}
            onClick={() => openAccept("selected")}
          >
            Aceitar selecionados ({selected.size})
          </Button>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : pendingSkus.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum SKU novo no faturamento.</p>
        ) : (
          <div className="max-h-[60vh] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allFilteredSelected}
                      onCheckedChange={checked => {
                        if (!checked) {
                          setSelected(prev => {
                            const next = new Set(prev);
                            filtered.forEach(s => next.delete(s.codMaterial));
                            return next;
                          });
                          return;
                        }
                        setSelected(prev => {
                          const next = new Set(prev);
                          filtered.forEach(s => next.add(s.codMaterial));
                          return next;
                        });
                      }}
                    />
                  </TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Marca</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="w-[120px]">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(sku => (
                  <TableRow key={sku.codMaterial}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(sku.codMaterial)}
                        onCheckedChange={checked => {
                          setSelected(prev => {
                            const next = new Set(prev);
                            if (checked) next.add(sku.codMaterial);
                            else next.delete(sku.codMaterial);
                            return next;
                          });
                        }}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-sm">{sku.codMaterial}</TableCell>
                    <TableCell>{sku.marca || "—"}</TableCell>
                    <TableCell className="max-w-md truncate">{sku.descricaoItem || "—"}</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={acceptMutation.isPending}
                        onClick={() => openAccept("single", sku)}
                      >
                        Aceitar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <PendingSkuDeParaAcceptDialog
          open={acceptDialogSkus !== null}
          onOpenChange={open => !open && setAcceptDialogSkus(null)}
          skus={acceptDialogSkus ?? []}
          mode="depara"
          isPending={acceptMutation.isPending}
          onConfirm={items => acceptMutation.mutate({ items })}
        />
      </CardContent>
    </Card>
  );
}
