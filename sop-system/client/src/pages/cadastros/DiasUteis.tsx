import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { Plus, Loader2, Download, Pencil, Trash2, Calendar } from "lucide-react";
import { exportToCsv } from "@/lib/exportCsv";
import { toast } from "sonner";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export default function DiasUteis() {
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({ ano: new Date().getFullYear(), mes: 1, diasUteis: 22, feriados: 0 });
  const [anoSelecionado, setAnoSelecionado] = useState(new Date().getFullYear());
  const [showBulkCreate, setShowBulkCreate] = useState(false);
  const [bulkData, setBulkData] = useState<{ [key: number]: { diasUteis: number; feriados: number } }>({});

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
    setFormData({ ano: new Date().getFullYear(), mes: 1, diasUteis: 22, feriados: 0 });
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
    });
    setEditingId(du.id);
    setIsOpen(true);
  };

  // Inicializar dados em lote para o ano selecionado
  const initBulkData = () => {
    const existingData = diasUteis?.filter(d => d.ano === anoSelecionado) || [];
    const newBulkData: { [key: number]: { diasUteis: number; feriados: number } } = {};
    
    for (let mes = 1; mes <= 12; mes++) {
      const existing = existingData.find(d => d.mes === mes);
      newBulkData[mes] = {
        diasUteis: existing?.diasUteis ?? 22,
        feriados: existing?.feriados ?? 0,
      };
    }
    
    setBulkData(newBulkData);
    setShowBulkCreate(true);
  };

  const handleBulkSave = async () => {
    try {
      for (let mes = 1; mes <= 12; mes++) {
        const existing = diasUteis?.find(d => d.ano === anoSelecionado && d.mes === mes);
        const data = bulkData[mes];
        
        if (existing) {
          await updateMutation.mutateAsync({ id: existing.id, ...data });
        } else {
          await createMutation.mutateAsync({ ano: anoSelecionado, mes, ...data });
        }
      }
      toast.success(`Dias úteis de ${anoSelecionado} salvos com sucesso!`);
      setShowBulkCreate(false);
      utils.diasUteis.list.invalidate();
    } catch (error) {
      toast.error("Erro ao salvar dias úteis");
    }
  };

  // Filtrar por ano selecionado
  const diasUteisFiltrados = diasUteis?.filter(d => d.ano === anoSelecionado) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dias Úteis</h1>
          <p className="text-muted-foreground">Configure os dias úteis e feriados por mês</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => {
            if (diasUteis && diasUteis.length > 0) {
              exportToCsv(diasUteis, "dias_uteis", [
                { key: "ano", title: "Ano" },
                { key: "mes", title: "Mês" },
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

      {/* Dialog para configurar 12 meses de uma vez */}
      <Dialog open={showBulkCreate} onOpenChange={setShowBulkCreate}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Configurar Dias Úteis - {anoSelecionado}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Label>Ano:</Label>
              <Input 
                type="number" 
                value={anoSelecionado} 
                onChange={(e) => setAnoSelecionado(parseInt(e.target.value))}
                className="w-32"
              />
              <Button variant="outline" onClick={initBulkData}>Carregar</Button>
            </div>
            
            <div className="grid grid-cols-3 gap-4 max-h-[400px] overflow-y-auto">
              {MESES.map((nomeMes, index) => {
                const mes = index + 1;
                return (
                  <Card key={mes} className="p-3">
                    <div className="font-medium mb-2">{nomeMes}</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Dias Úteis</Label>
                        <Input 
                          type="number" 
                          value={bulkData[mes]?.diasUteis ?? 22}
                          onChange={(e) => setBulkData({
                            ...bulkData,
                            [mes]: { ...bulkData[mes], diasUteis: parseInt(e.target.value) || 0 }
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
                            [mes]: { ...bulkData[mes], feriados: parseInt(e.target.value) || 0 }
                          })}
                          className="h-8"
                        />
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
                  <TableHead className="text-center">Dias Úteis</TableHead>
                  <TableHead className="text-center">Feriados</TableHead>
                  <TableHead className="text-center">Dias Trabalhados</TableHead>
                  <TableHead className="w-[100px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {diasUteisFiltrados.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum período cadastrado para {anoSelecionado}</TableCell></TableRow>
                ) : diasUteisFiltrados.sort((a, b) => a.mes - b.mes).map((du) => (
                  <TableRow key={du.id}>
                    <TableCell className="font-medium">{MESES[du.mes - 1]}</TableCell>
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
                                Tem certeza que deseja excluir os dias úteis de <strong>{MESES[du.mes - 1]}/{du.ano}</strong>? Esta ação não pode ser desfeita.
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
