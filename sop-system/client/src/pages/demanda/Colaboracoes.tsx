import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { normalizeMarcaNome, useAccessControl } from "@/hooks/useAccessControl";
import { trpc } from "@/lib/trpc";
import { Loader2, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { ColaboracaoResumos } from "./ColaboracaoResumos";

type PlanoColab = "MTS" | "PV_MTO" | "CRM";

const PLANOS: PlanoColab[] = ["MTS", "PV_MTO", "CRM"];
const PLANO_LABEL: Record<PlanoColab, string> = {
  MTS: "MTS",
  PV_MTO: "PV MTO",
  CRM: "CRM",
};
const MES_KEYS = ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9", "m10", "m11", "m12"] as const;
const EST_KEYS = ["e1", "e2", "e3", "e4", "e5", "e6", "e7", "e8", "e9", "e10", "e11", "e12"] as const;
const MESES_NOME = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];
const MESES_CURTO = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function formatNum(value: string | number | null | undefined) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

/** Próximo mês = início do ciclo (equiv. aba Dias e Data C2). */
function defaultCicloInicio(now = new Date()) {
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { mesInicio: next.getMonth() + 1, anoInicio: next.getFullYear() };
}

export default function Colaboracoes() {
  const utils = trpc.useUtils();
  const { podeVerTodasMarcas, marcasPermitidasNomes, isGestor } = useAccessControl();
  const [cicloId, setCicloId] = useState<number | null>(null);
  const [plano, setPlano] = useState<PlanoColab>("MTS");
  const [search, setSearch] = useState("");
  const [abaPrincipal, setAbaPrincipal] = useState<"grade" | "consolidado">("grade");
  const [wizardOpen, setWizardOpen] = useState(false);
  const defaults = defaultCicloInicio();
  const [jobIdInput, setJobIdInput] = useState("");
  const [nomeCiclo, setNomeCiclo] = useState("");
  const [mesInicio, setMesInicio] = useState(String(defaults.mesInicio));
  const [anoInicio, setAnoInicio] = useState(String(defaults.anoInicio));

  const { data: ciclos, isLoading: loadingCiclos } = trpc.cicloComercial.list.useQuery();
  const selectedCicloId = cicloId ?? ciclos?.[0]?.id ?? null;

  const { data: ciclo } = trpc.cicloComercial.getById.useQuery(
    { id: selectedCicloId ?? 0 },
    { enabled: Boolean(selectedCicloId) }
  );

  const { data: itens, isLoading: loadingItens } = trpc.cicloComercial.itens.useQuery(
    { cicloId: selectedCicloId ?? 0, planoColab: plano },
    { enabled: Boolean(selectedCicloId) }
  );

  const { data: consolidado } = trpc.cicloComercial.consolidado.useQuery(
    { cicloId: selectedCicloId ?? 0 },
    { enabled: Boolean(selectedCicloId) }
  );

  const { data: realizadoAnual } = trpc.cicloComercial.realizadoAnual.useQuery(
    { anos: [2025, 2026] },
    { enabled: Boolean(selectedCicloId) && plano === "MTS" }
  );

  const { data: jobs } = trpc.previsaoPython.list.useQuery({ limit: 20 });

  const desagregarMutation = trpc.cicloComercial.desagregarDoJob.useMutation({
    onSuccess: result => {
      toast.success(`Ciclo #${result.cicloId} criado com ${result.itensCriados} itens.`);
      utils.cicloComercial.list.invalidate();
      setCicloId(result.cicloId);
      setWizardOpen(false);
    },
    onError: error => toast.error(error.message),
  });

  const updateItemMutation = trpc.cicloComercial.updateItem.useMutation({
    onSuccess: () => {
      utils.cicloComercial.itens.invalidate();
      utils.cicloComercial.consolidado.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const updateStatusMutation = trpc.cicloComercial.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Status do ciclo atualizado.");
      utils.cicloComercial.list.invalidate();
      if (selectedCicloId) utils.cicloComercial.getById.invalidate({ id: selectedCicloId });
    },
    onError: error => toast.error(error.message),
  });

  const successJobs = useMemo(
    () =>
      (jobs ?? []).filter(
        j =>
          j.status === "SUCCESS" &&
          !String(j.scriptVersion || "")
            .toLowerCase()
            .includes("ciclo13")
      ),
    [jobs]
  );

  const filteredItens = useMemo(() => {
    let list = itens ?? [];
    if (!podeVerTodasMarcas) {
      list = list.filter(item =>
        marcasPermitidasNomes.includes(normalizeMarcaNome(item.marca))
      );
    }
    const term = search.trim().toLowerCase();
    if (!term) return list;
    return list.filter(item =>
      [item.sku, item.descricao, item.marca, item.linha, item.tipoMarcaLinha]
        .filter(Boolean)
        .some(v => String(v).toLowerCase().includes(term))
    );
  }, [itens, search, podeVerTodasMarcas, marcasPermitidasNomes]);

  const marcasConsolidado = useMemo(() => {
    const entries = Object.entries(consolidado?.byMarca ?? {});
    const filtered = !podeVerTodasMarcas
      ? entries.filter(([marca]) => marcasPermitidasNomes.includes(normalizeMarcaNome(marca)))
      : entries;
    return filtered.sort((a, b) => b[1].qtde - a[1].qtde);
  }, [consolidado, podeVerTodasMarcas, marcasPermitidasNomes]);

  const handleAbrirWizard = () => {
    const latest = successJobs[0];
    setJobIdInput(latest ? String(latest.id) : "");
    const d = defaultCicloInicio();
    setMesInicio(String(d.mesInicio));
    setAnoInicio(String(d.anoInicio));
    setNomeCiclo(
      `Ciclo ${String(d.mesInicio).padStart(2, "0")}/${String(d.anoInicio).slice(-2)}`
    );
    setWizardOpen(true);
  };

  const handleCriarCiclo = () => {
    const jobId = Number(jobIdInput) || successJobs[0]?.id;
    if (!jobId) {
      toast.error("Selecione um job Python SUCCESS.");
      return;
    }
    desagregarMutation.mutate({
      jobId,
      nomeCiclo: nomeCiclo.trim() || undefined,
      mesInicio: Number(mesInicio),
      anoInicio: Number(anoInicio),
    });
  };

  const handleMonthEdit = (itemId: number, key: (typeof MES_KEYS)[number], raw: string) => {
    const trimmed = raw.trim();
    if (trimmed === "") {
      updateItemMutation.mutate({ id: itemId, [key]: null });
      return;
    }
    const value = trimmed.replace(/\./g, "").replace(",", ".");
    if (Number.isNaN(Number(value))) return;
    updateItemMutation.mutate({ id: itemId, [key]: value });
  };

  const cicloMesLabel = (offset: number) => {
    if (!ciclo) return `M${offset + 1}`;
    const abs = ciclo.mesInicio - 1 + offset;
    const mes = (abs % 12) + 1;
    const ano = ciclo.anoInicio + Math.floor(abs / 12);
    return `${MESES_CURTO[mes - 1]}/${String(ano).slice(-2)}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Colaboração Comercial</h1>
          <p className="text-muted-foreground">
            Ciclo S&OP: MTS · PV MTO · CRM · Consolidado
            {isGestor ? " · filtrado pelas suas marcas" : ""}
          </p>
        </div>
        <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
          <Button onClick={handleAbrirWizard} data-tour="page-colab-desagregar">
            <Plus className="mr-2 h-4 w-4" />
            + Adicionar ciclo
          </Button>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Novo ciclo S&OP</DialogTitle>
              <DialogDescription>
                Equivalente a copiar o “0 - Novo Modelo Colaboração Comercial”. Desagrega a Visão
                Executiva do job Python (aba Dias e Data = 1º dia do mês de início).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label>Job Python (SUCCESS)</Label>
                <Select value={jobIdInput || undefined} onValueChange={setJobIdInput}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o job" />
                  </SelectTrigger>
                  <SelectContent>
                    {successJobs.map(j => (
                      <SelectItem key={j.id} value={String(j.id)}>
                        #{j.id} — {j.createdAt ? new Date(j.createdAt).toLocaleString("pt-BR") : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Nome do ciclo</Label>
                <Input value={nomeCiclo} onChange={e => setNomeCiclo(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Mês início</Label>
                  <Select value={mesInicio} onValueChange={setMesInicio}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MESES_NOME.map((nome, i) => (
                        <SelectItem key={nome} value={String(i + 1)}>
                          {nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Ano início</Label>
                  <Input
                    type="number"
                    value={anoInicio}
                    onChange={e => setAnoInicio(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setWizardOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCriarCiclo} disabled={desagregarMutation.isPending}>
                {desagregarMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Criar e desagregar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Ciclo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loadingCiclos ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Select
                value={selectedCicloId ? String(selectedCicloId) : undefined}
                onValueChange={v => setCicloId(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um ciclo" />
                </SelectTrigger>
                <SelectContent>
                  {(ciclos ?? []).map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      #{c.id} — {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {ciclo && (
              <div className="flex items-center gap-2 text-sm">
                <Badge>{ciclo.status}</Badge>
                <span className="text-muted-foreground">
                  Início {String(ciclo.mesInicio).padStart(2, "0")}/{ciclo.anoInicio}
                  {ciclo.jobId ? ` · job #${ciclo.jobId}` : ""}
                </span>
              </div>
            )}
            {ciclo && ciclo.status !== "FECHADO" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  updateStatusMutation.mutate({
                    id: ciclo.id,
                    status: ciclo.status === "CONSOLIDADO" ? "FECHADO" : "CONSOLIDADO",
                  })
                }
              >
                {ciclo.status === "CONSOLIDADO" ? "Fechar ciclo" : "Marcar consolidado"}
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Consolidado</CardTitle>
            <CardDescription>Colab vs estatística</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{formatNum(consolidado?.totalQtde)}</div>
            <div className="mt-2 space-y-1 text-sm text-muted-foreground">
              {PLANOS.map(p => {
                const qtde =
                  p === "MTS"
                    ? consolidado?.resumoPlanos?.mts
                    : p === "PV_MTO"
                      ? consolidado?.resumoPlanos?.pvMto
                      : consolidado?.resumoPlanos?.crm;
                const itensCount =
                  p === "MTS"
                    ? (consolidado?.byPlano?.MTS?.itens ?? 0) +
                      (consolidado?.byPlano?.JITO?.itens ?? 0)
                    : (consolidado?.byPlano?.[p]?.itens ?? 0);
                return (
                  <div key={p} className="flex justify-between">
                    <span>{PLANO_LABEL[p]}</span>
                    <span>
                      {formatNum(qtde)} ({itensCount} itens)
                    </span>
                  </div>
                );
              })}
              <div className="flex justify-between border-t pt-1">
                <span>Estatística</span>
                <span>{formatNum(consolidado?.totalEstatistica)}</span>
              </div>
              <div className="flex justify-between">
                <span>Gap colab−estat</span>
                <span>{formatNum(consolidado?.gapColabVsEstatistica)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Jobs recentes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {(jobs ?? [])
              .filter(j => j.status === "SUCCESS")
              .slice(0, 5)
              .map(j => (
                <button
                  key={j.id}
                  type="button"
                  className="flex w-full justify-between rounded px-1 py-0.5 hover:bg-muted"
                  onClick={() => setJobIdInput(String(j.id))}
                >
                  <span>#{j.id}</span>
                  <span className="text-muted-foreground">{j.scriptVersion}</span>
                </button>
              ))}
            {(jobs ?? []).filter(j => j.status === "SUCCESS").length === 0 && (
              <p className="text-muted-foreground">Nenhum job SUCCESS ainda.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {!selectedCicloId ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Crie um ciclo desagregando um job Python SUCCESS (Passo 2 → Passo 3).
          </CardContent>
        </Card>
      ) : (
        <Tabs value={abaPrincipal} onValueChange={v => setAbaPrincipal(v as "grade" | "consolidado")}>
          <TabsList>
            <TabsTrigger value="grade" data-tour="page-colab-grade">
              Grade
            </TabsTrigger>
            <TabsTrigger value="consolidado" data-tour="page-colab-consolidado">
              Resumos do ciclo
            </TabsTrigger>
          </TabsList>

          <TabsContent value="grade" className="mt-4">
            <Card data-tour="page-colab-grade-panel">
              <CardHeader>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <CardTitle>Grade de colaboração</CardTitle>
                    <CardDescription>
                      MTS: realizado 2025/2026 · previsão estatística · coluna Colab do vendedor (em
                      branco = usa a previsão)
                    </CardDescription>
                  </div>
                  <div className="w-64 space-y-1">
                    <Label>Buscar</Label>
                    <Input
                      placeholder="SKU, marca, linha..."
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Tabs value={plano} onValueChange={v => setPlano(v as PlanoColab)}>
                  <TabsList>
                    {PLANOS.map(p => (
                      <TabsTrigger key={p} value={p}>
                        {PLANO_LABEL[p]}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  {PLANOS.map(p => (
                    <TabsContent key={p} value={p} className="mt-4">
                      {loadingItens ? (
                        <div className="flex justify-center py-8">
                          <Loader2 className="h-5 w-5 animate-spin" />
                        </div>
                      ) : p === "MTS" ? (
                        <div className="max-h-[70vh] overflow-auto rounded-md border">
                          <Table>
                            <TableHeader className="sticky top-0 z-10 bg-background shadow-sm">
                              <TableRow>
                                <TableHead className="sticky left-0 z-20 bg-background min-w-[120px]">
                                  SKU
                                </TableHead>
                                <TableHead>Marca</TableHead>
                                {MESES_CURTO.map((m, i) => (
                                  <TableHead key={`r25-${i}`} className="text-right text-xs text-muted-foreground">
                                    {m}/25
                                  </TableHead>
                                ))}
                                {MESES_CURTO.map((m, i) => (
                                  <TableHead key={`r26-${i}`} className="text-right text-xs text-muted-foreground">
                                    {m}/26
                                  </TableHead>
                                ))}
                                {MES_KEYS.map((_, i) => (
                                  <TableHead key={`prev-${i}`} className="text-right text-xs bg-blue-50/50">
                                    {cicloMesLabel(i)} Prev
                                  </TableHead>
                                ))}
                                {MES_KEYS.map((key, i) => (
                                  <TableHead key={`colab-${key}`} className="text-right text-xs bg-amber-50/60">
                                    {cicloMesLabel(i)} Colab
                                  </TableHead>
                                ))}
                                <TableHead className="text-right">Total</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {filteredItens.length === 0 ? (
                                <TableRow>
                                  <TableCell colSpan={52} className="text-center text-muted-foreground">
                                    Sem itens neste plano.
                                  </TableCell>
                                </TableRow>
                              ) : (
                                filteredItens.map(item => {
                                  const skuKey = String(item.sku || "").trim().toUpperCase();
                                  const r25 = realizadoAnual?.[skuKey]?.[2025] ?? Array(12).fill(0);
                                  const r26 = realizadoAnual?.[skuKey]?.[2026] ?? Array(12).fill(0);
                                  let total = 0;
                                  for (let i = 0; i < 12; i++) {
                                    const mRaw = item[MES_KEYS[i]];
                                    const eRaw = (item as Record<string, unknown>)[EST_KEYS[i]];
                                    const hasColab =
                                      mRaw !== null && mRaw !== undefined && String(mRaw).trim() !== "";
                                    total += hasColab ? Number(mRaw || 0) : Number(eRaw || 0);
                                  }
                                  return (
                                    <TableRow key={item.id} className="text-sm">
                                      <TableCell className="sticky left-0 z-10 bg-background max-w-[140px] truncate font-medium">
                                        {item.sku}
                                      </TableCell>
                                      <TableCell className="max-w-[100px] truncate">{item.marca}</TableCell>
                                      {r25.map((q, i) => (
                                        <TableCell key={`r25-${i}`} className="p-1 text-right text-muted-foreground tabular-nums">
                                          {q ? formatNum(q) : "·"}
                                        </TableCell>
                                      ))}
                                      {r26.map((q, i) => (
                                        <TableCell key={`r26-${i}`} className="p-1 text-right text-muted-foreground tabular-nums">
                                          {q ? formatNum(q) : "·"}
                                        </TableCell>
                                      ))}
                                      {EST_KEYS.map(key => {
                                        const v = (item as Record<string, unknown>)[key];
                                        return (
                                          <TableCell
                                            key={key}
                                            className="p-1 text-right tabular-nums bg-blue-50/30"
                                          >
                                            {formatNum(Number(v || 0))}
                                          </TableCell>
                                        );
                                      })}
                                      {MES_KEYS.map(key => {
                                        const raw = item[key];
                                        const empty =
                                          raw === null || raw === undefined || String(raw).trim() === "";
                                        return (
                                          <TableCell key={key} className="p-0.5 bg-amber-50/40">
                                            <Input
                                              className="h-8 w-[4.5rem] px-1 text-right"
                                              placeholder="—"
                                              defaultValue={empty ? "" : String(Math.round(Number(raw || 0)))}
                                              disabled={ciclo?.status === "FECHADO"}
                                              onBlur={e =>
                                                handleMonthEdit(item.id, key, e.target.value)
                                              }
                                            />
                                          </TableCell>
                                        );
                                      })}
                                      <TableCell className="font-medium text-right tabular-nums">
                                        {formatNum(total)}
                                      </TableCell>
                                    </TableRow>
                                  );
                                })
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      ) : (
                        <div className="overflow-auto rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>SKU</TableHead>
                                <TableHead>Marca</TableHead>
                                <TableHead>Linha</TableHead>
                                {MES_KEYS.map((_, i) => (
                                  <TableHead key={i}>{cicloMesLabel(i)}</TableHead>
                                ))}
                                <TableHead>Total</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {filteredItens.length === 0 ? (
                                <TableRow>
                                  <TableCell colSpan={16} className="text-center text-muted-foreground">
                                    Sem itens neste plano.
                                  </TableCell>
                                </TableRow>
                              ) : (
                                filteredItens.map(item => {
                                  let total = 0;
                                  for (let i = 0; i < 12; i++) {
                                    const mRaw = item[MES_KEYS[i]];
                                    const eRaw = (item as Record<string, unknown>)[EST_KEYS[i]];
                                    const hasColab =
                                      mRaw !== null && mRaw !== undefined && String(mRaw).trim() !== "";
                                    total += hasColab ? Number(mRaw || 0) : Number(eRaw || item[MES_KEYS[i]] || 0);
                                  }
                                  return (
                                    <TableRow key={item.id}>
                                      <TableCell className="max-w-[140px] truncate font-medium">
                                        {item.sku}
                                      </TableCell>
                                      <TableCell>{item.marca}</TableCell>
                                      <TableCell>{item.linha}</TableCell>
                                      {MES_KEYS.map(key => (
                                        <TableCell key={key} className="p-1">
                                          <Input
                                            className="h-8 w-20 px-1 text-right"
                                            defaultValue={
                                              item[key] == null || String(item[key]).trim() === ""
                                                ? ""
                                                : String(Math.round(Number(item[key] || 0)))
                                            }
                                            disabled={ciclo?.status === "FECHADO"}
                                            onBlur={e => handleMonthEdit(item.id, key, e.target.value)}
                                          />
                                        </TableCell>
                                      ))}
                                      <TableCell className="font-medium">{formatNum(total)}</TableCell>
                                    </TableRow>
                                  );
                                })
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </TabsContent>
                  ))}
                </Tabs>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="consolidado" className="mt-4">
            <ColaboracaoResumos
              cicloId={selectedCicloId}
              consolidado={consolidado}
              marcasConsolidado={marcasConsolidado}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
