import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Plus, Pencil, Trash2, Loader2, Download, Calendar, Eraser, Save, Upload, FileSpreadsheet } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import * as XLSX from "xlsx";
import { exportToCsv } from "@/lib/exportCsv";
import { toast } from "sonner";

const MESES = [
  { value: 1, label: "Janeiro" },
  { value: 2, label: "Fevereiro" },
  { value: 3, label: "Março" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Maio" },
  { value: 6, label: "Junho" },
  { value: 7, label: "Julho" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Setembro" },
  { value: 10, label: "Outubro" },
  { value: 11, label: "Novembro" },
  { value: 12, label: "Dezembro" },
];

const TIPOS_ACABAMENTO = ["Enobrecimento", "Impressão", "Acabamento", "Manuseio"];
const LINHAS_PRODUTO = ["Automática", "Classic", "Evolution", "Elegance", "Fundo Q", "Fundo V", "Guardanapo", "Papel Seda", "Adicionais"];
const GRUPOS_TRABALHO = ["Corte Vinco", "Guilhotina", "Automática 1", "Automática 2", "Automática 3", "Newport", "J10", "J13"];

// Mapeamento de colunas do Excel
const COLUMN_MAPPING: Record<string, string> = {
  "tipo": "tipo",
  "tipo execução": "tipoExecucao",
  "tipoexecucao": "tipoExecucao",
  "tipo acabamento": "tipoAcabamento",
  "tipoacabamento": "tipoAcabamento",
  "linha produção": "linhaProducao",
  "linhaproducao": "linhaProducao",
  "linha produto": "linhaProduto",
  "linhaproduto": "linhaProduto",
  "grupo trabalho": "grupoTrabalho",
  "grupotrabalho": "grupoTrabalho",
  "recurso": "nome",
  "nome": "nome",
  "velocidade liquida": "velocidadeLiquida",
  "velocidadeliquida": "velocidadeLiquida",
  "vel. líquida": "velocidadeLiquida",
  "ativo": "ativo",
  "status": "ativo",
};

type ImportRow = {
  tipo?: string;
  tipoExecucao?: string;
  tipoAcabamento?: string;
  linhaProducao?: string;
  linhaProduto?: string;
  grupoTrabalho?: string;
  nome?: string;
  velocidadeLiquida?: string;
  ativo?: string | boolean;
};

export default function Recursos() {
  const [isOpen, setIsOpen] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedRecurso, setSelectedRecurso] = useState<{ id: number; nome: string; velocidadeLiquida?: string } | null>(null);
  const [configAno, setConfigAno] = useState(new Date().getFullYear());
  const [activeTab, setActiveTab] = useState("lista");
  const [importData, setImportData] = useState<ImportRow[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [turnoEmLote, setTurnoEmLote] = useState<string>("");
  const [formData, setFormData] = useState({
    tipo: "Intermediário" as "Intermediário" | "Acabamento",
    tipoExecucao: "Interno" as "Interno" | "Externo",
    tipoAcabamento: "",
    linhaProducao: "Offset" as "Offset" | "Flexo" | "Terceiro",
    linhaProduto: "",
    grupoTrabalho: "",
    nome: "",
    velocidadeLiquida: "" as string,
    ativo: true,
  });

  const utils = trpc.useUtils();
  const { data: recursos, isLoading } = trpc.recursos.list.useQuery();
  const { data: turnos } = trpc.turnos.list.useQuery();
  const { data: recursosMensais } = trpc.recursosMensais.listByRecurso.useQuery(
    { recursoId: selectedRecurso?.id || 0, ano: configAno },
    { enabled: !!selectedRecurso }
  );
  
  const createMutation = trpc.recursos.create.useMutation({
    onSuccess: () => { utils.recursos.list.invalidate(); toast.success("Recurso criado!"); resetForm(); },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = trpc.recursos.update.useMutation({
    onSuccess: () => { utils.recursos.list.invalidate(); toast.success("Recurso atualizado!"); resetForm(); },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = trpc.recursos.delete.useMutation({
    onSuccess: () => { utils.recursos.list.invalidate(); toast.success("Recurso excluído!"); },
    onError: (error) => toast.error(error.message),
  });

  const saveConfigMutation = trpc.recursosMensais.saveConfig.useMutation({
    onSuccess: () => { 
      utils.recursosMensais.listByRecurso.invalidate(); 
      toast.success("Configuração salva!"); 
    },
    onError: (error) => toast.error(error.message),
  });

  const clearConfigMutation = trpc.recursosMensais.clearConfig.useMutation({
    onSuccess: () => { 
      utils.recursosMensais.listByRecurso.invalidate(); 
      toast.success("Todas as configurações foram limpas!"); 
    },
    onError: (error) => toast.error(error.message),
  });

  const importBatchMutation = trpc.recursos.importBatch.useMutation({
    onSuccess: (result) => {
      utils.recursos.list.invalidate();
      toast.success(`Importação concluída: ${result.created} criados, ${result.updated} atualizados${result.errors > 0 ? `, ${result.errors} erros` : ""}`);
      setImportData([]);
      setActiveTab("lista");
    },
    onError: (error) => toast.error(error.message),
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as string[][];

        if (jsonData.length < 2) {
          toast.error("Arquivo vazio ou sem dados");
          return;
        }

        // Mapear cabeçalhos
        const headers = jsonData[0].map(h => String(h).toLowerCase().trim());
        const mappedHeaders = headers.map(h => COLUMN_MAPPING[h] || h);

        // Converter linhas em objetos
        const rows: ImportRow[] = [];
        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!row || row.length === 0) continue;
          
          const obj: ImportRow = {};
          mappedHeaders.forEach((header, index) => {
            const value = row[index];
            if (value !== undefined && value !== null && value !== "") {
              if (header === "ativo") {
                const strValue = String(value).toLowerCase();
                obj[header] = strValue === "ativo" || strValue === "sim" || strValue === "1" || strValue === "true";
              } else {
                (obj as Record<string, string>)[header] = String(value);
              }
            }
          });
          
          if (obj.nome) {
            rows.push(obj);
          }
        }

        setImportData(rows);
        toast.success(`${rows.length} registros carregados`);
      } catch (error) {
        toast.error("Erro ao ler arquivo Excel");
        console.error(error);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  const handleImport = async () => {
    if (importData.length === 0) {
      toast.error("Nenhum dado para importar");
      return;
    }

    setIsImporting(true);
    try {
      const dataToImport = importData.map(row => ({
        tipo: (row.tipo === "Acabamento" ? "Acabamento" : "Intermediário") as "Intermediário" | "Acabamento",
        tipoExecucao: (row.tipoExecucao === "Externo" ? "Externo" : "Interno") as "Interno" | "Externo",
        tipoAcabamento: row.tipoAcabamento || undefined,
        linhaProducao: (row.linhaProducao === "Flexo" ? "Flexo" : row.linhaProducao === "Terceiro" ? "Terceiro" : "Offset") as "Offset" | "Flexo" | "Terceiro" | undefined,
        linhaProduto: row.linhaProduto || undefined,
        grupoTrabalho: row.grupoTrabalho || undefined,
        nome: row.nome || "",
        velocidadeLiquida: row.velocidadeLiquida ? parseFloat(row.velocidadeLiquida) : undefined,
        ativo: typeof row.ativo === "boolean" ? row.ativo : true,
      }));

      await importBatchMutation.mutateAsync(dataToImport);
    } finally {
      setIsImporting(false);
    }
  };

  const downloadTemplate = () => {
    const headers = ["Tipo", "Tipo Execução", "Tipo Acabamento", "Linha Produção", "Linha Produto", "Grupo Trabalho", "Recurso", "Velocidade Liquida", "Ativo"];
    const exampleRow = ["Acabamento", "Interno", "Acabamento", "Flexo", "Automática", "Automática 1", "FB 01", "1500", "Ativo"];
    
    const ws = XLSX.utils.aoa_to_sheet([headers, exampleRow]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Recursos");
    XLSX.writeFile(wb, "template_recursos.xlsx");
  };

  const handleClearAll = () => {
    if (!selectedRecurso) return;
    clearConfigMutation.mutate({ recursoId: selectedRecurso.id, ano: configAno });
  };

  const resetForm = () => {
    setFormData({ 
      tipo: "Intermediário", 
      tipoExecucao: "Interno",
      tipoAcabamento: "",
      linhaProducao: "Offset",
      linhaProduto: "",
      grupoTrabalho: "",
      nome: "",
      velocidadeLiquida: "",
      ativo: true 
    });
    setEditingId(null);
    setIsOpen(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const submitData = {
      ...formData,
      velocidadeLiquida: formData.velocidadeLiquida ? parseFloat(formData.velocidadeLiquida) : undefined,
    };
    if (editingId) updateMutation.mutate({ id: editingId, ...submitData });
    else createMutation.mutate(submitData);
  };

  const handleEdit = (recurso: NonNullable<typeof recursos>[0]) => {
    setFormData({
      tipo: recurso.tipo,
      tipoExecucao: recurso.tipoExecucao,
      tipoAcabamento: recurso.tipoAcabamento || "",
      linhaProducao: recurso.linhaProducao || "Offset",
      linhaProduto: recurso.linhaProduto || "",
      grupoTrabalho: recurso.grupoTrabalho || "",
      nome: recurso.nome,
      velocidadeLiquida: recurso.velocidadeLiquida || "",
      ativo: recurso.ativo,
    });
    setEditingId(recurso.id);
    setIsOpen(true);
  };

  const handleOpenConfig = (recurso: { id: number; nome: string }) => {
    setSelectedRecurso(recurso);
    setIsConfigOpen(true);
  };

  const handleSaveMonthConfig = (mes: number, turnoId: number, horasManutencao?: number, horasExtras?: number, velocidadeLiquida?: number) => {
    if (!selectedRecurso) return;
    saveConfigMutation.mutate({
      recursoId: selectedRecurso.id,
      ano: configAno,
      mes,
      turnoId,
      horasManutencao,
      horasExtras,
      velocidadeLiquida,
    });
  };

  const handleApplyTurnoToAll = () => {
    if (!selectedRecurso || !turnoEmLote) return;
    const turnoId = parseInt(turnoEmLote);
    const recurso = recursos?.find(r => r.id === selectedRecurso.id);
    const velPadrao = recurso?.velocidadeLiquida ? parseFloat(recurso.velocidadeLiquida) : 0;
    
    // Aplicar o turno para todos os 12 meses
    MESES.forEach(mes => {
      saveConfigMutation.mutate({
        recursoId: selectedRecurso.id,
        ano: configAno,
        mes: mes.value,
        turnoId,
        horasManutencao: 0,
        horasExtras: 0,
        velocidadeLiquida: velPadrao,
      });
    });
    
    toast.success("Turno aplicado a todos os meses!");
    setTurnoEmLote("");
  };

  const getTurnoForMonth = (mes: number) => {
    const config = recursosMensais?.find(rm => rm.mes === mes);
    return config?.turnoId || null;
  };

  const getHorasManutencaoForMonth = (mes: number) => {
    const config = recursosMensais?.find(rm => rm.mes === mes);
    return config?.horasManutencao || "0";
  };

  const getHorasExtrasForMonth = (mes: number) => {
    const config = recursosMensais?.find(rm => rm.mes === mes);
    return config?.horasExtras || "0";
  };

  const getVelocidadeLiquidaForMonth = (mes: number) => {
    const config = recursosMensais?.find(rm => rm.mes === mes);
    // Se não tiver configuração mensal, usa a velocidade do recurso
    if (config?.velocidadeLiquida) return config.velocidadeLiquida;
    // Buscar velocidade padrão do recurso selecionado
    const recurso = recursos?.find(r => r.id === selectedRecurso?.id);
    return recurso?.velocidadeLiquida || "";
  };

  const getTurnoInfo = (turnoId: number | null) => {
    if (!turnoId || !turnos) return { turnoHora: "-", horas: "00:00", horasTrabalhadas: "00:00" };
    const turno = turnos.find(t => t.id === turnoId);
    return { 
      turnoHora: turno?.turnoHora || "-", 
      horas: turno?.horasTrabalho || "00:00",
      horasTrabalhadas: turno?.horasTrabalhadas || "00:00"
    };
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Recursos</h1>
          <p className="text-muted-foreground">Gerencie equipamentos e configuração mensal de turnos</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => {
            if (recursos && recursos.length > 0) {
              exportToCsv(recursos, "recursos", [
                { key: "tipo", title: "Tipo" },
                { key: "tipoExecucao", title: "Tipo Execução" },
                { key: "tipoAcabamento", title: "Tipo Acabamento" },
                { key: "linhaProducao", title: "Linha Produção" },
                { key: "linhaProduto", title: "Linha Produto" },
                { key: "grupoTrabalho", title: "Grupo Trabalho" },
                { key: "nome", title: "Recurso" },
                { key: "ativo", title: "Ativo" },
              ]);
            } else {
              toast.error("Não há dados para exportar");
            }
          }}><Download className="h-4 w-4 mr-2" />Exportar CSV</Button>
          <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Novo Recurso</Button></DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>{editingId ? "Editar Recurso" : "Novo Recurso"}</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Tipo *</Label>
                    <Select value={formData.tipo} onValueChange={(v) => setFormData({ ...formData, tipo: v as "Intermediário" | "Acabamento" })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Intermediário">Intermediário</SelectItem>
                        <SelectItem value="Acabamento">Acabamento</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Tipo Execução *</Label>
                    <Select value={formData.tipoExecucao} onValueChange={(v) => setFormData({ ...formData, tipoExecucao: v as "Interno" | "Externo" })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Interno">Interno</SelectItem>
                        <SelectItem value="Externo">Externo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Tipo Acabamento</Label>
                    <Select value={formData.tipoAcabamento || "none"} onValueChange={(v) => setFormData({ ...formData, tipoAcabamento: v === "none" ? "" : v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum</SelectItem>
                        {TIPOS_ACABAMENTO.map(tipo => (
                          <SelectItem key={tipo} value={tipo}>{tipo}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Linha Produção</Label>
                    <Select value={formData.linhaProducao} onValueChange={(v) => setFormData({ ...formData, linhaProducao: v as "Offset" | "Flexo" | "Terceiro" })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Offset">Offset</SelectItem>
                        <SelectItem value="Flexo">Flexo</SelectItem>
                        <SelectItem value="Terceiro">Terceiro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Linha Produto</Label>
                    <Select value={formData.linhaProduto || "none"} onValueChange={(v) => setFormData({ ...formData, linhaProduto: v === "none" ? "" : v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhuma</SelectItem>
                        {LINHAS_PRODUTO.map(linha => (
                          <SelectItem key={linha} value={linha}>{linha}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Grupo Trabalho</Label>
                    <Select value={formData.grupoTrabalho || "none"} onValueChange={(v) => setFormData({ ...formData, grupoTrabalho: v === "none" ? "" : v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum</SelectItem>
                        {GRUPOS_TRABALHO.map(grupo => (
                          <SelectItem key={grupo} value={grupo}>{grupo}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Nome do Recurso *</Label>
                    <Input 
                      placeholder="Ex: Desbobinadeira, Imp CD, Coladeira" 
                      value={formData.nome} 
                      onChange={(e) => setFormData({ ...formData, nome: e.target.value })} 
                      required 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Velocidade Líquida (un/hora)</Label>
                    <Input 
                      type="number"
                      step="0.01"
                      placeholder="Ex: 1500.00" 
                      value={formData.velocidadeLiquida} 
                      onChange={(e) => setFormData({ ...formData, velocidadeLiquida: e.target.value })} 
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={resetForm}>Cancelar</Button>
                  <Button type="submit" disabled={isPending}>{isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{editingId ? "Atualizar" : "Criar"}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="lista">Lista de Recursos</TabsTrigger>
          <TabsTrigger value="importar">Importar Excel</TabsTrigger>
        </TabsList>

        <TabsContent value="lista">
        <Card>
        <CardHeader><CardTitle>Lista de Recursos</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Tipo Execução</TableHead>
                    <TableHead>Tipo Acabamento</TableHead>
                    <TableHead>Linha Produção</TableHead>
                    <TableHead>Linha Produto</TableHead>
                    <TableHead>Grupo Trabalho</TableHead>
                    <TableHead>Recurso</TableHead>
                    <TableHead>Vel. Líquida</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[120px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recursos?.length === 0 ? (
                    <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">Nenhum recurso cadastrado</TableCell></TableRow>
                  ) : recursos?.map((recurso) => (
                    <TableRow key={recurso.id}>
                      <TableCell><Badge variant="outline">{recurso.tipo}</Badge></TableCell>
                      <TableCell>{recurso.tipoExecucao}</TableCell>
                      <TableCell>{recurso.tipoAcabamento || "-"}</TableCell>
                      <TableCell>{recurso.linhaProducao || "-"}</TableCell>
                      <TableCell>{recurso.linhaProduto || "-"}</TableCell>
                      <TableCell>{recurso.grupoTrabalho || "-"}</TableCell>
                      <TableCell className="font-medium">{recurso.nome}</TableCell>
                      <TableCell>{recurso.velocidadeLiquida ? `${recurso.velocidadeLiquida} un/h` : "-"}</TableCell>
                      <TableCell><Badge variant={recurso.ativo ? "default" : "secondary"}>{recurso.ativo ? "Ativo" : "Inativo"}</Badge></TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" onClick={() => handleOpenConfig(recurso)} title="Configurar Turnos">
                            <Calendar className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => handleEdit(recurso)}><Pencil className="h-4 w-4" /></Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="icon" variant="ghost"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Tem certeza que deseja excluir o recurso <strong>{recurso.nome}</strong>? Esta ação não pode ser desfeita.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteMutation.mutate({ id: recurso.id })} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
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
      </TabsContent>

      <TabsContent value="importar">
        <Card>
          <CardHeader>
            <CardTitle>Importar Recursos via Excel</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <Button variant="outline" onClick={downloadTemplate}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Baixar Template
              </Button>
              <div>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="file-upload-recursos"
                />
                <Button asChild variant="outline">
                  <label htmlFor="file-upload-recursos" className="cursor-pointer">
                    <Upload className="h-4 w-4 mr-2" />
                    Carregar Arquivo
                  </label>
                </Button>
              </div>
            </div>

            {importData.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {importData.length} registros carregados (recursos existentes serão atualizados)
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setImportData([])}>
                      Limpar
                    </Button>
                    <Button onClick={handleImport} disabled={isImporting}>
                      {isImporting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Importar {importData.length} Recursos
                    </Button>
                  </div>
                </div>

                <div className="overflow-x-auto max-h-96">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Tipo Execução</TableHead>
                        <TableHead>Tipo Acabamento</TableHead>
                        <TableHead>Linha Produção</TableHead>
                        <TableHead>Linha Produto</TableHead>
                        <TableHead>Grupo Trabalho</TableHead>
                        <TableHead>Recurso</TableHead>
                        <TableHead>Vel. Líquida</TableHead>
                        <TableHead>Ativo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importData.slice(0, 50).map((row, index) => (
                        <TableRow key={index}>
                          <TableCell>{row.tipo || "-"}</TableCell>
                          <TableCell>{row.tipoExecucao || "-"}</TableCell>
                          <TableCell>{row.tipoAcabamento || "-"}</TableCell>
                          <TableCell>{row.linhaProducao || "-"}</TableCell>
                          <TableCell>{row.linhaProduto || "-"}</TableCell>
                          <TableCell>{row.grupoTrabalho || "-"}</TableCell>
                          <TableCell className="font-medium">{row.nome}</TableCell>
                          <TableCell>{row.velocidadeLiquida || "-"}</TableCell>
                          <TableCell>
                            <Badge variant={row.ativo ? "default" : "secondary"}>
                              {row.ativo ? "Ativo" : "Inativo"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {importData.length > 50 && (
                    <p className="text-sm text-muted-foreground text-center py-2">
                      Mostrando 50 de {importData.length} registros
                    </p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>
      </Tabs>

      {/* Dialog de Configuração Mensal */}
      <Dialog open={isConfigOpen} onOpenChange={setIsConfigOpen}>
        <DialogContent className="!max-w-[98vw] !w-[98vw] sm:!max-w-[98vw]">
          <DialogHeader>
            <DialogTitle>Configuração de Turnos - {selectedRecurso?.nome}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Label>Ano:</Label>
                <Select value={configAno.toString()} onValueChange={(v) => setConfigAno(parseInt(v))}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[2024, 2025, 2026, 2027].map(ano => (
                      <SelectItem key={ano} value={ano.toString()}>{ano}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-center gap-2">
                <Label className="text-sm">Aplicar turno:</Label>
                <Select value={turnoEmLote} onValueChange={setTurnoEmLote}>
                  <SelectTrigger className="w-40"><SelectValue placeholder="Selecione turno" /></SelectTrigger>
                  <SelectContent>
                    {turnos?.filter(t => t.ativo).map(turno => (
                      <SelectItem key={turno.id} value={turno.id.toString()}>
                        {turno.turnoHora} ({turno.horasTrabalhadas || turno.horasTrabalho})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button 
                  variant="default" 
                  size="sm" 
                  onClick={handleApplyTurnoToAll}
                  disabled={!turnoEmLote || saveConfigMutation.isPending}
                  className="bg-primary"
                >
                  {saveConfigMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Aplicar a Todos"}
                </Button>
              </div>
              
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                    <Eraser className="h-4 w-4 mr-2" />
                    Limpar Tudo
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirmar limpeza</AlertDialogTitle>
                    <AlertDialogDescription>
                      Tem certeza que deseja limpar todas as configurações de turnos de <strong>{selectedRecurso?.nome}</strong> para o ano de <strong>{configAno}</strong>? Esta ação não pode ser desfeita.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleClearAll} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Limpar Tudo
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
            
            <div className="grid grid-cols-4 gap-4 max-h-[65vh] overflow-y-auto pr-2">
              {MESES.map(mes => {
                const turnoId = getTurnoForMonth(mes.value);
                const turnoInfo = getTurnoInfo(turnoId);
                const horasManutencao = getHorasManutencaoForMonth(mes.value);
                const horasExtras = getHorasExtrasForMonth(mes.value);
                const velocidadeLiquida = getVelocidadeLiquidaForMonth(mes.value);
                return (
                  <Card key={mes.value} className="p-5 min-w-[320px]">
                    <div className="space-y-3">
                      <p className="font-semibold text-base border-b pb-2">{mes.label}</p>
                      
                      {/* Turno */}
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Turno</Label>
                        <Select 
                          value={turnoId?.toString() || "none"} 
                          onValueChange={(v) => {
                            const newTurnoId = parseInt(v);
                            const recurso = recursos?.find(r => r.id === selectedRecurso?.id);
                            const velPadrao = recurso?.velocidadeLiquida ? parseFloat(recurso.velocidadeLiquida) : undefined;
                            handleSaveMonthConfig(mes.value, newTurnoId, parseFloat(horasManutencao), parseFloat(horasExtras), velPadrao);
                          }}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Selecione turno" />
                          </SelectTrigger>
                          <SelectContent>
                            {turnos?.filter(t => t.ativo).map(turno => (
                              <SelectItem key={turno.id} value={turno.id.toString()}>
                                {turno.turnoHora} ({turno.horasTrabalhadas || turno.horasTrabalho})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      {turnoId && (
                        <>
                          <p className="text-sm text-center bg-muted/50 rounded py-1.5 font-medium">
                            {turnoInfo.horasTrabalhadas} horas úteis/dia
                          </p>
                          
                          {/* Horas de Manutenção, Horas Extras e Velocidade Líquida */}
                          <div className="space-y-2">
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">H. Manutenção</Label>
                              <div className="flex items-center gap-1">
                                <Input
                                  type="number"
                                  step="0.5"
                                  min="0"
                                  className="h-9"
                                  placeholder="0"
                                  value={horasManutencao}
                                  onChange={(e) => {
                                    const newHoras = parseFloat(e.target.value) || 0;
                                    handleSaveMonthConfig(mes.value, turnoId, newHoras, parseFloat(horasExtras), velocidadeLiquida ? parseFloat(velocidadeLiquida) : undefined);
                                  }}
                                />
                                <span className="text-xs text-muted-foreground">h</span>
                              </div>
                            </div>
                            
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">H. Extras</Label>
                              <div className="flex items-center gap-1">
                                <Input
                                  type="number"
                                  step="0.5"
                                  min="0"
                                  className="h-9"
                                  placeholder="0"
                                  value={horasExtras}
                                  onChange={(e) => {
                                    const newHorasExtras = parseFloat(e.target.value) || 0;
                                    handleSaveMonthConfig(mes.value, turnoId, parseFloat(horasManutencao), newHorasExtras, velocidadeLiquida ? parseFloat(velocidadeLiquida) : undefined);
                                  }}
                                />
                                <span className="text-xs text-muted-foreground">h</span>
                              </div>
                            </div>
                            
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Vel. Líquida</Label>
                              <div className="flex items-center gap-1">
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  className="h-9"
                                  placeholder="0"
                                  value={velocidadeLiquida}
                                  onChange={(e) => {
                                    const newVel = parseFloat(e.target.value) || 0;
                                    handleSaveMonthConfig(mes.value, turnoId, parseFloat(horasManutencao), parseFloat(horasExtras), newVel);
                                  }}
                                />
                                <span className="text-xs text-muted-foreground">un/h</span>
                              </div>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => setIsConfigOpen(false)}>
                Fechar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
