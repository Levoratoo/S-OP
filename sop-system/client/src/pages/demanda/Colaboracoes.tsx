import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { normalizeMarcaNome, useAccessControl } from "@/hooks/useAccessControl";
import { trpc } from "@/lib/trpc";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type PlanoColab = "MTS" | "JITO" | "PV_MTO" | "CRM";

const PLANOS: PlanoColab[] = ["MTS", "JITO", "PV_MTO", "CRM"];
const MES_KEYS = ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9", "m10", "m11", "m12"] as const;

function formatNum(value: string | number | null | undefined) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

export default function Colaboracoes() {
  const utils = trpc.useUtils();
  const { podeVerTodasMarcas, marcasPermitidasNomes, isGestor } = useAccessControl();
  const [cicloId, setCicloId] = useState<number | null>(null);
  const [plano, setPlano] = useState<PlanoColab>("MTS");
  const [jobIdInput, setJobIdInput] = useState("");
  const [search, setSearch] = useState("");
  const [abaPrincipal, setAbaPrincipal] = useState<"grade" | "consolidado">("grade");

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

  const { data: jobs } = trpc.previsaoPython.list.useQuery({ limit: 20 });

  const desagregarMutation = trpc.cicloComercial.desagregarDoJob.useMutation({
    onSuccess: result => {
      toast.success(`Ciclo #${result.cicloId} criado com ${result.itensCriados} itens.`);
      utils.cicloComercial.list.invalidate();
      setCicloId(result.cicloId);
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

  const handleDesagregar = () => {
    const jobId = Number(jobIdInput) || jobs?.find(j => j.status === "SUCCESS")?.id;
    if (!jobId) {
      toast.error("Informe o ID de um job Python SUCCESS ou execute a previsão antes.");
      return;
    }
    desagregarMutation.mutate({ jobId });
  };

  const handleMonthEdit = (itemId: number, key: (typeof MES_KEYS)[number], raw: string) => {
    const value = raw.replace(/\./g, "").replace(",", ".");
    if (raw !== "" && Number.isNaN(Number(value))) return;
    updateItemMutation.mutate({ id: itemId, [key]: value || "0" });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Colaboração Comercial</h1>
          <p className="text-muted-foreground">
            Ciclo S&OP com desagregação estatística e edição MTS / JITO / PV-MTO / CRM
            {isGestor ? " · filtrado pelas suas marcas" : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2" data-tour="page-colab-desagregar">
          <div className="space-y-1">
            <Label>Job Python (SUCCESS)</Label>
            <Input
              className="w-40"
              placeholder="ID do job"
              value={jobIdInput}
              onChange={e => setJobIdInput(e.target.value)}
            />
          </div>
          <Button onClick={handleDesagregar} disabled={desagregarMutation.isPending}>
            {desagregarMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Desagregar do job
          </Button>
        </div>
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
              {PLANOS.map(p => (
                <div key={p} className="flex justify-between">
                  <span>{p}</span>
                  <span>
                    {formatNum(consolidado?.byPlano?.[p]?.qtde)} ({consolidado?.byPlano?.[p]?.itens ?? 0}{" "}
                    itens)
                  </span>
                </div>
              ))}
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
                    <CardDescription>Edite as quantidades mensais por plano</CardDescription>
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
                        {p}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  {PLANOS.map(p => (
                    <TabsContent key={p} value={p} className="mt-4">
                      {loadingItens ? (
                        <div className="flex justify-center py-8">
                          <Loader2 className="h-5 w-5 animate-spin" />
                        </div>
                      ) : (
                        <div className="overflow-auto rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>SKU</TableHead>
                                <TableHead>Marca</TableHead>
                                <TableHead>Linha</TableHead>
                                <TableHead>Rateio</TableHead>
                                {MES_KEYS.map((m, i) => (
                                  <TableHead key={m}>M{i + 1}</TableHead>
                                ))}
                                <TableHead>Total</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {filteredItens.length === 0 ? (
                                <TableRow>
                                  <TableCell colSpan={17} className="text-center text-muted-foreground">
                                    Sem itens neste plano.
                                  </TableCell>
                                </TableRow>
                              ) : (
                                filteredItens.map(item => {
                                  const total = MES_KEYS.reduce(
                                    (acc, key) => acc + Number(item[key] || 0),
                                    0
                                  );
                                  return (
                                    <TableRow key={item.id}>
                                      <TableCell className="max-w-[140px] truncate font-medium">
                                        {item.sku}
                                      </TableCell>
                                      <TableCell>{item.marca}</TableCell>
                                      <TableCell>{item.linha}</TableCell>
                                      <TableCell>
                                        {(Number(item.rateioConsiderar || 0) * 100).toFixed(1)}%
                                      </TableCell>
                                      {MES_KEYS.map(key => (
                                        <TableCell key={key} className="p-1">
                                          <Input
                                            className="h-8 w-20 px-1 text-right"
                                            defaultValue={String(Math.round(Number(item[key] || 0)))}
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

          <TabsContent value="consolidado" className="mt-4 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Resumo planos</CardTitle>
                  <CardDescription>PV-MTO vs CRM e totais</CardDescription>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>MTS</span>
                    <span>{formatNum(consolidado?.resumoPlanos?.mts)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>JITO</span>
                    <span>{formatNum(consolidado?.resumoPlanos?.jito)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>PV-MTO</span>
                    <span>{formatNum(consolidado?.resumoPlanos?.pvMto)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>CRM</span>
                    <span>{formatNum(consolidado?.resumoPlanos?.crm)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-1 font-medium">
                    <span>PV − CRM</span>
                    <span>{formatNum(consolidado?.resumoPlanos?.pvVsCrm)}</span>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Por marca</CardTitle>
                  <CardDescription>Colaborado vs estatística</CardDescription>
                </CardHeader>
                <CardContent className="max-h-64 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Marca</TableHead>
                        <TableHead className="text-right">Colab</TableHead>
                        <TableHead className="text-right">Estat</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {marcasConsolidado.slice(0, 30).map(([marca, row]) => (
                        <TableRow key={marca}>
                          <TableCell>{marca}</TableCell>
                          <TableCell className="text-right">{formatNum(row.qtde)}</TableCell>
                          <TableCell className="text-right">{formatNum(row.estatistica)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Base ciclo (amostra)</CardTitle>
                <CardDescription>
                  Linhas mês a mês no horizonte do ciclo (até 5.000 registros)
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ano/Mês</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Marca</TableHead>
                      <TableHead>Linha</TableHead>
                      <TableHead>Plano</TableHead>
                      <TableHead className="text-right">Qtd</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(consolidado?.baseCiclo ?? [])
                      .filter(
                        row =>
                          podeVerTodasMarcas ||
                          marcasPermitidasNomes.includes(normalizeMarcaNome(row.marca))
                      )
                      .slice(0, 100)
                      .map((row, idx) => (
                        <TableRow key={`${row.sku}-${row.ano}-${row.mes}-${idx}`}>
                          <TableCell>
                            {row.ano}/{String(row.mes).padStart(2, "0")}
                          </TableCell>
                          <TableCell>{row.sku}</TableCell>
                          <TableCell>{row.marca}</TableCell>
                          <TableCell>{row.linha}</TableCell>
                          <TableCell>{row.planoColab}</TableCell>
                          <TableCell className="text-right">{formatNum(row.qtd)}</TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
