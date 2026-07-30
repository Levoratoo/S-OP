import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Plus, Loader2, Download, Pencil, Trash2, Clock } from "lucide-react";
import { exportToCsv } from "@/lib/exportCsv";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const diasTrabalhadosOptions = [
  "segunda - sexta",
  "segunda - sábado",
  "Domingo - Domingo",
];

export default function Turnos() {
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [formData, setFormData] = useState({ 
    turnoHora: "", 
    horasTrabalho: "08:00", 
    horasRefeicao: "01:00",
    horasTrabalhadas: "07:00",
    diasTrabalhados: "segunda - sexta",
    horaExtra: false,
    ativo: true 
  });

  const utils = trpc.useUtils();
  const { data: turnos, isLoading } = trpc.turnos.list.useQuery();
  
  const createMutation = trpc.turnos.create.useMutation({
    onSuccess: () => { utils.turnos.list.invalidate(); toast.success("Turno cadastrado!"); resetForm(); },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = trpc.turnos.update.useMutation({
    onSuccess: () => { utils.turnos.list.invalidate(); toast.success("Turno atualizado!"); resetForm(); },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = trpc.turnos.delete.useMutation({
    onSuccess: () => { utils.turnos.list.invalidate(); toast.success("Turno excluído!"); setDeleteId(null); },
    onError: (error) => toast.error(error.message),
  });

  // Função para calcular horas trabalhadas (horas trabalho - horas refeição)
  const calcularHorasTrabalhadas = (horasTrabalho: string, horasRefeicao: string): string => {
    const parseHoras = (h: string) => {
      const [hh, mm] = h.split(':').map(Number);
      return (hh || 0) * 60 + (mm || 0);
    };
    const trabalhoMin = parseHoras(horasTrabalho);
    const refeicaoMin = parseHoras(horasRefeicao);
    const resultMin = Math.max(0, trabalhoMin - refeicaoMin);
    const hh = Math.floor(resultMin / 60).toString().padStart(2, '0');
    const mm = (resultMin % 60).toString().padStart(2, '0');
    return `${hh}:${mm}`;
  };

  const resetForm = () => {
    setFormData({ 
      turnoHora: "", 
      horasTrabalho: "08:00", 
      horasRefeicao: "01:00",
      horasTrabalhadas: "07:00",
      diasTrabalhados: "segunda - sexta",
      horaExtra: false,
      ativo: true 
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

  const handleEdit = (turno: NonNullable<typeof turnos>[0]) => {
    setFormData({
      turnoHora: turno.turnoHora,
      horasTrabalho: turno.horasTrabalho || "08:00",
      horasRefeicao: turno.horasRefeicao || "01:00",
      horasTrabalhadas: turno.horasTrabalhadas || "07:00",
      diasTrabalhados: turno.diasTrabalhados || "segunda - sexta",
      horaExtra: turno.horaExtra,
      ativo: turno.ativo,
    });
    setEditingId(turno.id);
    setIsOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Turnos</h1>
          <p className="text-muted-foreground">Configure os tipos de turno e horas de trabalho</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => {
            if (turnos && turnos.length > 0) {
              exportToCsv(turnos, "turnos", [
                { key: "turnoHora", title: "Turno/Hora" },
                { key: "horasTrabalho", title: "Horas Trabalho" },
                { key: "horasRefeicao", title: "Horas Refeição" },
                { key: "horasTrabalhadas", title: "Horas Trabalhadas" },
                { key: "diasTrabalhados", title: "Dias Trabalhados" },
                { key: "horaExtra", title: "Hora Extra?" },
                { key: "ativo", title: "Ativo" },
              ]);
            } else {
              toast.error("Não há dados para exportar");
            }
          }}><Download className="h-4 w-4 mr-2" />Exportar CSV</Button>
          <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Novo Turno</Button></DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>{editingId ? "Editar Turno" : "Cadastrar Turno"}</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Turno/Hora *</Label>
                  <Input 
                    placeholder="Ex: s/ turno, Comercial, 1/8, 2/8, 12/36" 
                    value={formData.turnoHora} 
                    onChange={(e) => setFormData({ ...formData, turnoHora: e.target.value })} 
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Horas Trabalho *</Label>
                    <Input 
                      placeholder="Ex: 08:00, 10:00, 12:00" 
                      value={formData.horasTrabalho} 
                      onChange={(e) => {
                        const newTrabalho = e.target.value;
                        const newTrabalhadas = calcularHorasTrabalhadas(newTrabalho, formData.horasRefeicao);
                        setFormData({ ...formData, horasTrabalho: newTrabalho, horasTrabalhadas: newTrabalhadas });
                      }} 
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Horas Refeição</Label>
                    <Input 
                      placeholder="Ex: 00:00, 01:00" 
                      value={formData.horasRefeicao} 
                      onChange={(e) => {
                        const newRefeicao = e.target.value;
                        const newTrabalhadas = calcularHorasTrabalhadas(formData.horasTrabalho, newRefeicao);
                        setFormData({ ...formData, horasRefeicao: newRefeicao, horasTrabalhadas: newTrabalhadas });
                      }} 
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Horas Trabalhadas (calculado automaticamente)</Label>
                  <Input 
                    value={formData.horasTrabalhadas} 
                    readOnly
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">Horas Trabalho - Horas Refeição = Horas Úteis</p>
                </div>
                <div className="space-y-2">
                  <Label>Dias Trabalhados *</Label>
                  <Select 
                    value={formData.diasTrabalhados} 
                    onValueChange={(value) => setFormData({ ...formData, diasTrabalhados: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione os dias" />
                    </SelectTrigger>
                    <SelectContent>
                      {diasTrabalhadosOptions.map((option) => (
                        <SelectItem key={option} value={option}>{option}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Switch 
                      checked={formData.horaExtra} 
                      onCheckedChange={(checked) => setFormData({ ...formData, horaExtra: checked })} 
                    />
                    <Label>Hora Extra?</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch 
                      checked={formData.ativo} 
                      onCheckedChange={(checked) => setFormData({ ...formData, ativo: checked })} 
                    />
                    <Label>Ativo</Label>
                  </div>
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

      {/* Dialog de confirmação de exclusão */}
      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este turno? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Tipos de Turno
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Turno/Hora</TableHead>
                  <TableHead className="text-center">Horas Trabalho</TableHead>
                  <TableHead className="text-center">Horas Refeição</TableHead>
                  <TableHead className="text-center">Horas Trabalhadas</TableHead>
                  <TableHead>Dias Trabalhados</TableHead>
                  <TableHead className="text-center">Hora Extra?</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="w-[100px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {turnos?.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhum turno cadastrado</TableCell></TableRow>
                ) : turnos?.map((turno) => (
                  <TableRow key={turno.id}>
                    <TableCell className="font-medium">{turno.turnoHora}</TableCell>
                    <TableCell className="text-center">{turno.horasTrabalho}</TableCell>
                    <TableCell className="text-center">{turno.horasRefeicao || "-"}</TableCell>
                    <TableCell className="text-center font-semibold text-primary">{turno.horasTrabalhadas || "-"}</TableCell>
                    <TableCell>{turno.diasTrabalhados}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={turno.horaExtra ? "default" : "secondary"}>
                        {turno.horaExtra ? "sim" : "não"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={turno.ativo ? "default" : "secondary"}>
                        {turno.ativo ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => handleEdit(turno)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => setDeleteId(turno.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
