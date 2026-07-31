import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Plus, Loader2, Download, Pencil, Trash2, Calendar } from "lucide-react";
import { exportToCsv } from "@/lib/exportCsv";
import { toast } from "sonner";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

type TipoDias = "seg-sex" | "seg-sab" | "7-dias";

const TIPOS_DIAS: { value: TipoDias; label: string; hint: string }[] = [
  { value: "seg-sex", label: "Seg–Sex", hint: "5 dias úteis/semana" },
  { value: "seg-sab", label: "Seg–Sáb", hint: "6 dias úteis/semana" },
  { value: "7-dias", label: "7 dias", hint: "Domingo a domingo" },
];

function labelTipoDias(value: string | null | undefined): string {
  return TIPOS_DIAS.find(t => t.value === value)?.label ?? value ?? "Seg–Sex";
}

function normalizeTipoDias(value: string | null | undefined): TipoDias {
  if (value === "seg-sab" || value === "7-dias" || value === "seg-sex") return value;
  return "seg-sex";
}

type FormData = {
  ano: number;
  mes: number;
  diasUteis: number;
  feriados: number;
  tipoDias: TipoDias;
};

type BulkMonth = { diasUteis: number; feriados: number; tipoDias: TipoDias };

export default function DiasUteis() {
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<FormData>({
    ano: new Date().getFullYear(),
    mes: 1,
    diasUteis: 22,
    feriados: 0,
    tipoDias: "seg-sex",
  });
  const [anoSelecionado, setAnoSelecionado] = useState(new Date().getFullYear());
  const [bulkTipoDias, setBulkTipoDias] = useState<TipoDias>("seg-sex");
  const [showBulkCreate, setShowBulkCreate] = useState(false);
  const [bulkData, setBulkData] = useState<{ [key: number]: BulkMonth }>({});

  const utils = trpc.useUtils();
  const { data: diasUteis, isLoading } = trpc.diasUteis.list.useQuery();

  const createMutation = trpc.diasUteis.create.useMutation({
    onSuccess: () => { utils.diasUteis.list.invalidate(); toast.success("Dias úteis cadastrados!"); resetForm(); },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = trpc.diasUteis.update.useMutation({
    onSuccess: () => { utils.diasUteis.list.invalidate(); toast.success("Dias úteis atualizados!"); resetForm(); },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = trpc.diasUteis.delete.useMutation({
    onSuccess: () => { utils.diasUteis.list.invalidate(); toast.success("Registro excluído!"); },
    onError: (error) => toast.error(error.message),
  });

  const resetForm = () => {
    setFormData({
      ano: new Date().getFullYear(),
      mes: 1,
      diasUteis: 22,
      feriados: 0,
      tipoDias: "seg-sex",
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

  const handleEdit = (du: NonNullable<typeof diasUteis>[0]) => {
    setFormData({
      ano: du.ano,
      mes: du.mes,
      diasUteis: du.diasUteis,
      feriados: du.feriados ?? 0,
      tipoDias: normalizeTipoDias(du.tipoDias),
    });
    setEditingId(du.id);
    setIsOpen(true);
  };

  const initBulkData = () => {
    const existingData = diasUteis?.filter(d => d.ano === anoSelecionado) || [];
    const newBulkData: { [key: number]: BulkMonth } = {};

    for (let mes = 1; mes <= 12; mes++) {
      const existing = existingData.find(d => d.mes === mes && normalizeTipoDias(d.tipoDias) === bulkTipoDias)
        ?? existingData.find(d => d.mes === mes);
      newBulkData[mes] = {
        diasUteis: existing?.diasUteis ?? 22,
        feriados: existing?.feriados ?? 0,
        tipoDias: existing ? normalizeTipoDias(existing.tipoDias) : bulkTipoDias,
      };
    }

    setBulkData(newBulkData);
    setShowBulkCreate(true);
  };

  const handleBulkSave = async () => {
    try {
      for (let mes = 1; mes <= 12; mes++) {
        const data = bulkData[mes];
        const existing = diasUteis?.find(
          d => d.ano === anoSelecionado && d.mes === mes && normalizeTipoDias(d.tipoDias) === data.tipoDias
        );

        if (existing) {
          await updateMutation.mutateAsync({ id: existing.id, ...data });
        } else {
          await createMutation.mutateAsync({ ano: anoSelecionado, mes, ...data });
        }
      }
      toast.success(`Dias úteis de ${anoSelecionado} salvos com sucesso!`);
      setShowBulkCreate(false);
      utils.diasUteis.list.invalidate();
    } catch {
      toast.error("Erro ao salvar dias úteis");
    }
  };

  const diasUteisFiltrados = diasUteis?.filter(d => d.ano === anoSelecionado) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dias Úteis</h1>
          <p className="text-muted-foreground">
            Configure os dias úteis por mês e tipo de calendário (seg–sex, seg–sáb ou 7 dias).
            O cálculo de capacidade usa o tipo que bate com o turno do recurso.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => {
            if (diasUteis && diasUteis.length > 0) {
              exportToCsv(diasUteis, "dias_uteis", [
                { key: "ano", title: "Ano" },
                { key: "mes", title: "Mês" },
                { key: "tipoDias", title: "Tipo calendário" },
                { key: "diasUteis", title: "Dias Úteis" },
                { key: "feriados", title: "Feriados" },
              ]);
            } else {
              toast.error("Não há dados para exportar");
            }
          }}><Download className="h-4 w-4 mr-2" />Exportar CSV</Button>
          <Button variant="outline" onClick={initBulkData}>
            <Calendar className="h-4 w-4 mr-2" />Configurar Ano
          </Button>
          <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Novo Período</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editingId ? "Editar Dias Úteis" : "Cadastrar Dias Úteis"}</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Ano</Label><Input type="number" value={formData.ano} onChange={(e) => setFormData({ ...formData, ano: parseInt(e.target.value) })} /></div>
                  <div className="space-y-2"><Label>Mês</Label><Input type="number" min={1} max={12} value={formData.mes} onChange={(e) => setFormData({ ...formData, mes: parseInt(e.target.value) })} /></div>
                </div>
                <div className="space-y-2">
                  <Label>Tipo de calendário</Label>
                  <Select
                    value={formData.tipoDias}
                    onValueChange={(value: TipoDias) => setFormData({ ...formData, tipoDias: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPOS_DIAS.map(t => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label} — {t.hint}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Dias Úteis</Label><Input type="number" value={formData.diasUteis} onChange={(e) => setFormData({ ...formData, diasUteis: parseInt(e.target.value) })} /></div>
                  <div className="space-y-2"><Label>Feriados</Label><Input type="number" value={formData.feriados} onChange={(e) => setFormData({ ...formData, feriados: parseInt(e.target.value) })} /></div>
                </div>
                <div className="flex justify-end gap-2">
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

      <Dialog open={showBulkCreate} onOpenChange={setShowBulkCreate}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Configurar Dias Úteis - {anoSelecionado}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Label>Ano:</Label>
                <Input
                  type="number"
                  value={anoSelecionado}
                  onChange={(e) => setAnoSelecionado(parseInt(e.target.value))}
                  className="w-32"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label>Calendário padrão:</Label>
                <Select
                  value={bulkTipoDias}
                  onValueChange={(value: TipoDias) => setBulkTipoDias(value)}
                >
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_DIAS.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" onClick={initBulkData}>Carregar</Button>
            </div>

            <div className="grid grid-cols-3 gap-4 max-h-[400px] overflow-y-auto">
              {MESES.map((nomeMes, index) => {
                const mes = index + 1;
                return (
                  <Card key={mes} className="p-3">
                    <div className="font-medium mb-2">{nomeMes}</div>
                    <div className="space-y-2">
                      <div>
                        <Label className="text-xs">Calendário</Label>
                        <Select
                          value={bulkData[mes]?.tipoDias ?? bulkTipoDias}
                          onValueChange={(value: TipoDias) => setBulkData({
                            ...bulkData,
                            [mes]: { ...bulkData[mes], tipoDias: value, diasUteis: bulkData[mes]?.diasUteis ?? 22, feriados: bulkData[mes]?.feriados ?? 0 },
                          })}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TIPOS_DIAS.map(t => (
                              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">Dias Úteis</Label>
                          <Input
                            type="number"
                            value={bulkData[mes]?.diasUteis ?? 22}
                            onChange={(e) => setBulkData({
                              ...bulkData,
                              [mes]: { ...bulkData[mes], diasUteis: parseInt(e.target.value) || 0, feriados: bulkData[mes]?.feriados ?? 0, tipoDias: bulkData[mes]?.tipoDias ?? bulkTipoDias },
                            })}
                            className="h-8"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Feriados</Label>
                          <Input
                            type="number"
                            value={bulkData[mes]?.feriados ?? 0}
                            onChange={(e) => setBulkData({
                              ...bulkData,
                              [mes]: { ...bulkData[mes], feriados: parseInt(e.target.value) || 0, diasUteis: bulkData[mes]?.diasUteis ?? 22, tipoDias: bulkData[mes]?.tipoDias ?? bulkTipoDias },
                            })}
                            className="h-8"
                          />
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowBulkCreate(false)}>Cancelar</Button>
              <Button onClick={handleBulkSave} disabled={createMutation.isPending || updateMutation.isPending}>
                {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar Todos
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Calendário de Dias Úteis</CardTitle>
            <div className="flex items-center gap-2">
              <Label>Ano:</Label>
              <Input
                type="number"
                value={anoSelecionado}
                onChange={(e) => setAnoSelecionado(parseInt(e.target.value))}
                className="w-24 h-8"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mês</TableHead>
                  <TableHead>Calendário</TableHead>
                  <TableHead className="text-center">Dias Úteis</TableHead>
                  <TableHead className="text-center">Feriados</TableHead>
                  <TableHead className="text-center">Dias Trabalhados</TableHead>
                  <TableHead className="w-[100px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {diasUteisFiltrados.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum período cadastrado para {anoSelecionado}</TableCell></TableRow>
                ) : diasUteisFiltrados
                  .slice()
                  .sort((a, b) => a.mes - b.mes || normalizeTipoDias(a.tipoDias).localeCompare(normalizeTipoDias(b.tipoDias)))
                  .map((du) => (
                  <TableRow key={du.id}>
                    <TableCell className="font-medium">{MESES[du.mes - 1]}</TableCell>
                    <TableCell>{labelTipoDias(du.tipoDias)}</TableCell>
                    <TableCell className="text-center">{du.diasUteis}</TableCell>
                    <TableCell className="text-center">{du.feriados}</TableCell>
                    <TableCell className="text-center font-semibold">{du.diasUteis - (du.feriados ?? 0)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => handleEdit(du)}><Pencil className="h-4 w-4" /></Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                              <AlertDialogDescription>
                                Tem certeza que deseja excluir os dias úteis de <strong>{MESES[du.mes - 1]}/{du.ano}</strong> ({labelTipoDias(du.tipoDias)})? Esta ação não pode ser desfeita.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteMutation.mutate({ id: du.id })} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
