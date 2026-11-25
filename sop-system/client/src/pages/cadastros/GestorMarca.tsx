import { useEffect, useMemo, useState } from "react";
import { textMatchesSearch } from "@shared/text-search";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { Plus, Pencil, Trash2, Loader2, Users, Tag, Download, Link, AlertCircle, Upload } from "lucide-react";
import { exportToCsv } from "@/lib/exportCsv";
import { toast } from "sonner";
import * as XLSX from "xlsx";

function IncludePendingMarcasDialog({
  open,
  onOpenChange,
  marcas,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  marcas: Array<{ nome: string; gestorSugerido?: string | null }>;
}) {
  const utils = trpc.useUtils();
  const { data: gestores = [] } = trpc.gestores.list.useQuery();
  const [rows, setRows] = useState<Array<{ nome: string; gestorId: number | null }>>([]);
  const [bulkGestorId, setBulkGestorId] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    setRows(
      marcas.map(m => {
        const sug = m.gestorSugerido?.trim();
        const g = sug
          ? gestores.find(x => x.nome.trim().toLowerCase() === sug.toLowerCase())
          : undefined;
        return { nome: m.nome, gestorId: g?.id ?? null };
      })
    );
    setBulkGestorId("");
  }, [open, marcas, gestores]);

  const mutation = trpc.cadastrosSistema.acceptPendingMarcasWithGestores.useMutation({
    onSuccess: result => {
      toast.success(
        `${result.created} marca(s) criada(s) · ${result.vinculos} vínculo(s)` +
          (result.semGestor ? ` · ${result.semGestor} sem gestor` : "")
      );
      if (result.semGestor > 0) {
        toast.message(`${result.semGestor} marca(s) incluída(s) sem vínculo de gestor.`);
      }
      utils.cadastrosSistema.pendingMarcasFromFaturamento.invalidate();
      utils.marcas.list.invalidate();
      utils.gestorMarca.list.invalidate();
      onOpenChange(false);
    },
    onError: e => toast.error(e.message),
  });

  const applyBulk = () => {
    const id = Number(bulkGestorId);
    if (!id) return;
    setRows(prev => prev.map(r => ({ ...r, gestorId: id })));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] w-[95vw] max-w-6xl overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>Incluir marcas pendentes</DialogTitle>
          <DialogDescription>
            Associe um gestor a cada marca antes de incluir no cadastro. Marcas sem gestor também podem
            ser incluídas.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-end gap-2 pb-2">
          <div className="flex-1 min-w-[200px] space-y-1">
            <Label>Aplicar o mesmo gestor a todas</Label>
            <Select value={bulkGestorId} onValueChange={setBulkGestorId}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha o gestor…" />
              </SelectTrigger>
              <SelectContent>
                {gestores.map(g => (
                  <SelectItem key={g.id} value={String(g.id)}>
                    {g.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" size="sm" variant="secondary" onClick={applyBulk} disabled={!bulkGestorId}>
            Aplicar a todas
          </Button>
        </div>
        <div className="space-y-3 sm:hidden">
          {rows.map((row, i) => (
            <div key={row.nome} className="space-y-2 rounded-md border p-3">
              <p className="font-medium">{row.nome}</p>
              <Select
                value={row.gestorId != null ? String(row.gestorId) : "__none__"}
                onValueChange={v =>
                  setRows(prev =>
                    prev.map((r, idx) =>
                      idx === i ? { ...r, gestorId: v === "__none__" ? null : Number(v) } : r
                    )
                  )
                }
              >
                <SelectTrigger className="h-9 w-full">
                  <SelectValue placeholder="Sem gestor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem gestor</SelectItem>
                  {gestores.map(g => (
                    <SelectItem key={g.id} value={String(g.id)}>
                      {g.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
        <div className="hidden overflow-x-auto rounded-md border sm:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Marca</TableHead>
                <TableHead>Gestor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => (
                <TableRow key={row.nome}>
                  <TableCell className="font-medium">{row.nome}</TableCell>
                  <TableCell>
                    <Select
                      value={row.gestorId != null ? String(row.gestorId) : "__none__"}
                      onValueChange={v =>
                        setRows(prev =>
                          prev.map((r, idx) =>
                            idx === i ? { ...r, gestorId: v === "__none__" ? null : Number(v) } : r
                          )
                        )
                      }
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Sem gestor" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Sem gestor</SelectItem>
                        {gestores.map(g => (
                          <SelectItem key={g.id} value={String(g.id)}>
                            {g.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate({ items: rows })}
          >
            {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Confirmar inclusão
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function GestorMarca() {
  const [activeTab, setActiveTab] = useState("relacionamento");

  const utils = trpc.useUtils();
  const { data: pendingMarcas = [] } =
    trpc.cadastrosSistema.pendingMarcasFromFaturamento.useQuery();

  const [includeMarcasOpen, setIncludeMarcasOpen] = useState(false);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Gestor x Marca</h1>
        <p className="text-muted-foreground">
          Gerencie o relacionamento entre gestores comerciais e marcas. Clientes entram automaticamente
          após cada sync de faturamento.
        </p>
      </div>

      {pendingMarcas.length > 0 && (
        <Alert className="border-amber-300 bg-amber-50 text-amber-950">
          <AlertCircle className="h-4 w-4 text-amber-700" />
          <AlertTitle className="flex items-center gap-2">
            Marcas no Faturamento fora do cadastro
            <Badge variant="secondary" className="bg-amber-200 text-amber-900">
              {pendingMarcas.length}
            </Badge>
          </AlertTitle>
          <AlertDescription className="space-y-3 mt-2">
            <p>
              Estas marcas aparecem em Bases/Faturamento e ainda não estão em Marcas. Inclua-as para o vínculo com gestor.
            </p>
            <div className="flex flex-wrap gap-2">
              {pendingMarcas.slice(0, 24).map(marca => (
                <Badge key={marca.nome} variant="outline" className="border-amber-400 bg-white text-amber-950">
                  {marca.nome}
                  {marca.gestorSugerido ? (
                    <span className="ml-1 text-xs text-amber-700">→ {marca.gestorSugerido}</span>
                  ) : null}
                </Badge>
              ))}
              {pendingMarcas.length > 24 && (
                <span className="text-xs text-amber-800">+{pendingMarcas.length - 24}</span>
              )}
            </div>
            <Button size="sm" onClick={() => setIncludeMarcasOpen(true)}>
              Incluir marcas no cadastro ({pendingMarcas.length})
            </Button>
            <IncludePendingMarcasDialog
              open={includeMarcasOpen}
              onOpenChange={setIncludeMarcasOpen}
              marcas={pendingMarcas}
            />
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-3 w-full max-w-md">
          <TabsTrigger value="relacionamento">Gestor vs Marcas</TabsTrigger>
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
  const [importingFile, setImportingFile] = useState(false);
  const [marcaSearch, setMarcaSearch] = useState("");
  const [formData, setFormData] = useState({
    gestorId: "",
    marcaId: "",
  });

  const utils = trpc.useUtils();
  const { data: relacionamentos, isLoading } = trpc.gestorMarca.list.useQuery();
  const { data: gestores } = trpc.gestores.list.useQuery();
  const { data: marcas } = trpc.marcas.list.useQuery();
  const { data: pendingMarcas = [] } = trpc.cadastrosSistema.pendingMarcasFromFaturamento.useQuery();

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

  const importMergeMutation = trpc.gestorMarca.importMerge.useMutation({
    onSuccess: result => {
      utils.gestorMarca.list.invalidate();
      utils.cadastrosSistema.pendingMarcasFromFaturamento.invalidate();
      const s = result.stats;
      toast.success(
        `Importação: ${s.linksCreated} vínculo(s) criado(s), ${s.linksUpdated} atualizado(s), ${s.pendingGestorStored} gestor(es) guardado(s) para marcas pendentes.`
      );
      if (result.unknownGestores.length > 0) {
        toast.warning(
          `${result.unknownGestores.length} gestor(es) não encontrado(s) no cadastro (primeiros: ${result.unknownGestores.slice(0, 3).join("; ")})`
        );
      }
    },
    onError: error => toast.error(error.message),
  });

  const handleImportFile = async (file: File) => {
    setImportingFile(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
      if (!sheet) throw new Error("Planilha vazia");
      const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];
      const headers = (aoa[0] as unknown[] | undefined)?.map(h => String(h ?? "").trim().toLowerCase()) ?? [];
      const marcaIdx = headers.findIndex(h => h === "marca");
      const gestorIdx = headers.findIndex(h => h === "gestor");
      if (marcaIdx < 0) throw new Error('Coluna "Marca" não encontrada.');
      const rows: { marca: string; gestor: string }[] = [];
      for (let i = 1; i < aoa.length; i++) {
        const row = aoa[i] as unknown[];
        const marca = String(row?.[marcaIdx] ?? "").trim();
        if (!marca) continue;
        const gestor = gestorIdx >= 0 ? String(row?.[gestorIdx] ?? "").trim() : "";
        rows.push({ marca, gestor });
      }
      if (rows.length === 0) throw new Error("Nenhuma linha válida no arquivo.");
      await importMergeMutation.mutateAsync(rows);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setImportingFile(false);
    }
  };

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

  const filteredRelacionamentos = useMemo(() => {
    const list = relacionamentos ?? [];
  return list.filter(
      item =>
        textMatchesSearch(item.marcaNome ?? "", marcaSearch) ||
        textMatchesSearch(item.gestorNome ?? "", marcaSearch)
    );
  }, [relacionamentos, marcaSearch]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><Link className="h-5 w-5" /> Relacionamento Gestor x Marca</CardTitle>
          <CardDescription>Vincule gestores comerciais às marcas que gerenciam. Exporte, edite no Excel/CSV e reimporte para atualizar em lote.</CardDescription>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <label className="inline-flex">
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              disabled={importingFile || importMergeMutation.isPending}
              onChange={e => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void handleImportFile(f);
              }}
            />
            <Button variant="outline" asChild disabled={importingFile || importMergeMutation.isPending}>
              <span>
                {(importingFile || importMergeMutation.isPending) ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Importar base
              </span>
            </Button>
          </label>
          <Button
            variant="outline"
            onClick={() => {
              const rows = [
                ...(relacionamentos ?? []).map(item => ({
                  marca: item.marcaNome ?? "",
                  gestor: item.gestorNome ?? "",
                })),
                ...pendingMarcas.map(item => ({ marca: item.nome, gestor: "" })),
              ];
              if (rows.length === 0) {
                toast.error("Não há dados para exportar");
                return;
              }
              exportToCsv(rows, "gestor-marca", [
                { key: "marca", title: "Marca" },
                { key: "gestor", title: "Gestor" },
              ]);
            }}
          >
            <Download className="h-4 w-4 mr-2" />
            Exportar base
          </Button>
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
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert className="border-muted bg-muted/40">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Regras da importação (Marca × Gestor)</AlertTitle>
          <AlertDescription className="text-sm space-y-1">
            <p>
              Colunas esperadas: <strong>Marca</strong> e <strong>Gestor</strong> (mesmo layout da exportação).
            </p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>Marca já cadastrada com gestor vazio no arquivo: o vínculo atual é mantido.</li>
              <li>Marca cadastrada com gestor preenchido: cria ou atualiza o vínculo somente se o gestor mudou.</li>
              <li>
                Marca nova (pendente do faturamento) com gestor: o gestor fica guardado e é aplicado ao incluir a
                marca no cadastro.
              </li>
              <li>Marca nova sem gestor: permanece no alerta de pendentes; vínculos fora do arquivo não são removidos.</li>
            </ul>
          </AlertDescription>
        </Alert>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1 flex-1 min-w-[200px] max-w-md">
            <Label htmlFor="busca-marca-gestor">Pesquisar marca (ou gestor)</Label>
            <Input
              id="busca-marca-gestor"
              placeholder="Filtrar tabela em tempo real…"
              value={marcaSearch}
              onChange={e => setMarcaSearch(e.target.value)}
            />
          </div>
          <p className="text-sm text-muted-foreground pb-2">
            {filteredRelacionamentos.length.toLocaleString("pt-BR")} de{" "}
            {(relacionamentos?.length ?? 0).toLocaleString("pt-BR")} vínculo(s)
          </p>
        </div>
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
              {filteredRelacionamentos.map((item) => (
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
              {filteredRelacionamentos.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                    {marcaSearch.trim()
                      ? "Nenhum vínculo encontrado para esta pesquisa"
                      : "Nenhum relacionamento cadastrado"}
                  </TableCell>
                </TableRow>
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
