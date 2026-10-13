import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { exportToCsv } from "@/lib/exportCsv";
import { trpc } from "@/lib/trpc";
import { Download, Loader2, RefreshCw, Upload } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

function formatNum(value: string | number | null | undefined) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function formatRs(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function formatPct(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

type Props = {
  cicloId: number;
  consolidado: {
    totalQtde?: number;
    totalEstatistica?: number;
    gapColabVsEstatistica?: number;
    byMarca?: Record<string, { itens: number; qtde: number; estatistica: number }>;
    resumoPlanos?: {
      mts?: number;
      jito?: number;
      pvMto?: number;
      crm?: number;
      pvVsCrm?: number;
    };
    baseCiclo?: Array<Record<string, unknown>>;
  } | undefined;
  marcasConsolidado: Array<[string, { itens: number; qtde: number; estatistica: number }]>;
};

export function ColaboracaoResumos({ cicloId, consolidado, marcasConsolidado }: Props) {
  const utils = trpc.useUtils();
  const [aba, setAba] = useState("1");

  const { data: pvCrm, isLoading: loadingPv } = trpc.cicloComercial.pvVsCrm.useQuery(
    { cicloId },
    { enabled: aba === "3" }
  );
  const { data: resumoRs, isLoading: loadingRs } = trpc.cicloComercial.resumoRs.useQuery(
    { cicloId },
    { enabled: aba === "2" }
  );
  const { data: baseFull, isLoading: loadingBase } = trpc.cicloComercial.baseCicloFull.useQuery(
    { cicloId },
    { enabled: aba === "1" || aba === "5" }
  );
  const { data: resumoProd, isLoading: loadingProd } = trpc.cicloComercial.resumoProd.useQuery(
    { cicloId },
    { enabled: aba === "4" }
  );
  const { data: mtoVar, isLoading: loadingMto } = trpc.cicloComercial.mtoVariacao.useQuery(
    { cicloId },
    { enabled: aba === "6" }
  );
  const { data: rfs, isLoading: loadingRfs } = trpc.cicloComercial.relatorioRfs.useQuery(
    { cicloId },
    { enabled: aba === "7" }
  );
  const { data: aaComp, isLoading: loadingAa } = trpc.cicloComercial.aaComparativo.useQuery(
    { cicloId },
    { enabled: aba === "aa" }
  );

  const syncPv = trpc.cicloComercial.syncPvFromCarteira.useMutation({
    onSuccess: r => {
      toast.success(`PV sincronizado: ${r.itensCriados} SKUs (${r.pedidosLidos} pedidos).`);
      utils.cicloComercial.itens.invalidate();
      utils.cicloComercial.consolidado.invalidate();
      utils.cicloComercial.pvVsCrm.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const importCrm = trpc.cicloComercial.importCrm.useMutation({
    onSuccess: r => {
      toast.success(`CRM: ${r.itensCriados} itens`);
      if (r.avisos.length) toast.message(`${r.avisos.length} avisos de validação`);
      if (r.erros.length) toast.error(`${r.erros.length} erros — confira SKUs`);
      utils.cicloComercial.itens.invalidate();
      utils.cicloComercial.consolidado.invalidate();
      utils.cicloComercial.pvVsCrm.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const handleCrmFile = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      const cell = (row: Record<string, unknown>, ...keys: string[]) => {
        for (const k of keys) {
          if (row[k] != null && String(row[k]).trim() !== "") return row[k];
          const found = Object.keys(row).find(h => h.trim().toLowerCase() === k.toLowerCase());
          if (found && row[found] != null && String(row[found]).trim() !== "") return row[found];
        }
        return "";
      };
      const num = (row: Record<string, unknown>, ...keys: string[]) => {
        const v = cell(row, ...keys);
        if (v instanceof Date) return 0;
        const n = Number(String(v ?? "0").replace(/\s/g, "").replace(",", "."));
        return Number.isFinite(n) ? n : 0;
      };
      const asDateStr = (v: unknown) => {
        if (v instanceof Date && !Number.isNaN(v.getTime())) {
          return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
        }
        return String(v ?? "").trim();
      };
      const rows = json.map(row => {
        const sku = String(
          cell(
            row,
            "Produto",
            "SKU",
            "sku",
            "Cod Item",
            "CodItem",
            "Codigo",
            "Cod Material",
            "Cod. Material"
          )
        ).trim();
        return {
          sku,
          descricao: String(cell(row, "Descrição", "Descricao", "descricao")),
          marca: String(cell(row, "Marca", "marca")),
          card: String(cell(row, "Card", "card", "ID Card")),
          cliente: String(cell(row, "Cliente", "cliente")),
          gestor: String(cell(row, "Gestor", "gestor")),
          temperatura: String(cell(row, "Temperatura", "temperatura")),
          tipo: String(
            cell(
              row,
              "ColaboracaoAposta/Oportunidade",
              "ColaboracaoApostaOportunidade",
              "Tipo",
              "tipo"
            )
          ),
          orcamento: num(row, "Orçamento", "Orcamento", "Cálculo OR", "Calculo OR"),
          valorVenda: num(row, "R$ Venda", "R$Venda", "Valor Venda"),
          dataFaturamento: asDateStr(
            cell(row, "Data de Faturamento", "Data Faturamento", "DataFaturamento", "Competencia")
          ),
          qtdMes: num(row, "Qtd Mês", "Qtd Mes", "Qtde Mês", "Qtde Mes"),
          modalidade: String(cell(row, "Modalidade", "modalidade")),
          m1: num(row, "m1", "M1"),
          m2: num(row, "m2", "M2"),
          m3: num(row, "m3", "M3"),
          m4: num(row, "m4", "M4"),
          m5: num(row, "m5", "M5"),
          m6: num(row, "m6", "M6"),
          m7: num(row, "m7", "M7"),
          m8: num(row, "m8", "M8"),
          m9: num(row, "m9", "M9"),
          m10: num(row, "m10", "M10"),
          m11: num(row, "m11", "M11"),
          m12: num(row, "m12", "M12"),
        };
      });
      importCrm.mutate({ cicloId, rows: rows.filter(r => r.sku) });
    } catch (e) {
      toast.error(`Falha ao ler CRM: ${String(e)}`);
    }
  };

  const exportConsolidado = () => {
    const rows = (baseFull?.rows ?? []).map(row => ({
      ano: row.ano,
      mes: row.mes,
      sku: row.sku,
      marca: row.marca ?? "",
      linha: row.linha ?? "",
      plano: row.planoColab,
      tipo: row.tipoEstoque ?? "",
      quantidade: row.qtd,
    }));
    exportToCsv(rows, `1-consolidado_ciclo_${cicloId}`, [
      { key: "ano", title: "Ano" },
      { key: "mes", title: "Mês" },
      { key: "sku", title: "SKU" },
      { key: "marca", title: "Marca" },
      { key: "linha", title: "Linha" },
      { key: "plano", title: "Plano" },
      { key: "tipo", title: "Tipo estoque" },
      { key: "quantidade", title: "Quantidade" },
    ]);
  };

  const exportRfs = () => {
    if (!rfs) return;
    const rows: Array<Record<string, unknown>> = rfs.rows.map(row => {
      const source = row as typeof row & Record<string, unknown>;
      return {
        sku: row.sku,
        descricao: row.descricao ?? "",
        marca: row.marca ?? "",
        linha: row.linha ?? "",
        plano: row.planoColab,
        ...Object.fromEntries(
          Array.from({ length: 12 }, (_, index) => [
            `m${index + 1}`,
            source[`m${index + 1}`],
          ])
        ),
        total: row.total,
        estat: row.estatistica12m,
      };
    });
    const columns: Array<{ key: string; title: string }> = [
      { key: "sku", title: "SKU" },
      { key: "descricao", title: "Descrição" },
      { key: "marca", title: "Marca" },
      { key: "linha", title: "Linha" },
      { key: "plano", title: "Plano" },
      ...Array.from({ length: 12 }, (_, index) => ({
        key: `m${index + 1}`,
        title: `M${index + 1}`,
      })),
      { key: "total", title: "Total colab" },
      { key: "estat", title: "Estat 12M" },
    ];
    exportToCsv<Record<string, unknown>>(
      rows,
      `7-relatorio_rfs_ciclo_${cicloId}`,
      columns
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Ações do ciclo (Excel → software)</CardTitle>
          <CardDescription>
            PV Aberto, CRM (PipeDrive/Victor) e exports das abas Resumo 1–7
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={syncPv.isPending}
            onClick={() => syncPv.mutate({ cicloId })}
          >
            {syncPv.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Sync PV da Carteira → PV_MTO
          </Button>
          <Label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-accent">
            <Upload className="h-4 w-4" />
            Importar CRM (Excel/CSV)
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) void handleCrmFile(f);
                e.target.value = "";
              }}
            />
          </Label>
          <Button
            size="sm"
            variant="outline"
            disabled={!baseFull || loadingBase}
            onClick={exportConsolidado}
          >
            <Download className="mr-2 h-4 w-4" />
            Export 1-Consolidado
          </Button>
        </CardContent>
      </Card>

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="1">1-Consolidado</TabsTrigger>
          <TabsTrigger value="2">2-Resumo R$</TabsTrigger>
          <TabsTrigger value="3">3-PVxCRM</TabsTrigger>
          <TabsTrigger value="aa">Comparativo AA</TabsTrigger>
          <TabsTrigger value="4">4-Resumo PROD</TabsTrigger>
          <TabsTrigger value="5">5-Base Ciclo</TabsTrigger>
          <TabsTrigger value="6">6-MTO Variação</TabsTrigger>
          <TabsTrigger value="7">7-Relatório RFS</TabsTrigger>
        </TabsList>

        <TabsContent value="1" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Resumo planos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div className="flex justify-between"><span>MTS</span><span>{formatNum(consolidado?.resumoPlanos?.mts)}</span></div>
                <div className="flex justify-between"><span>PV MTO</span><span>{formatNum(consolidado?.resumoPlanos?.pvMto)}</span></div>
                <div className="flex justify-between"><span>CRM</span><span>{formatNum(consolidado?.resumoPlanos?.crm)}</span></div>
                <div className="flex justify-between border-t pt-1 font-medium">
                  <span>PV − CRM</span>
                  <span>{formatNum(consolidado?.resumoPlanos?.pvVsCrm)}</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Por marca</CardTitle>
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
                    {marcasConsolidado.slice(0, 40).map(([marca, v]) => (
                      <TableRow key={marca}>
                        <TableCell>{marca}</TableCell>
                        <TableCell className="text-right">{formatNum(v.qtde)}</TableCell>
                        <TableCell className="text-right">{formatNum(v.estatistica)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="2" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">2-Resumo R$</CardTitle>
                <CardDescription>qtde × valorVenda do cadastro de produtos</CardDescription>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={!resumoRs}
                onClick={() =>
                  resumoRs &&
                  exportToCsv(
                    resumoRs.linhas.map(l => ({
                      sku: l.sku,
                      marca: l.marca ?? "",
                      familia: l.familia ?? "",
                      gestor: l.gestor ?? "",
                      plano: l.planoColab,
                      qtde: l.qtde,
                      valorUnit: l.valorUnit,
                      valorTotal: l.valorTotal,
                    })),
                    `2-resumo_rs_ciclo_${cicloId}`,
                    [
                      { key: "sku", title: "SKU" },
                      { key: "marca", title: "Marca" },
                      { key: "familia", title: "Família" },
                      { key: "gestor", title: "Gestor" },
                      { key: "plano", title: "Plano" },
                      { key: "qtde", title: "Qtde" },
                      { key: "valorUnit", title: "Valor unit" },
                      { key: "valorTotal", title: "Valor total" },
                    ]
                  )
                }
              >
                <Download className="mr-2 h-4 w-4" /> Exportar
              </Button>
            </CardHeader>
            <CardContent>
              {loadingRs ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <p className="mb-3 text-2xl font-semibold">{formatRs(resumoRs?.totalRs ?? 0)}</p>
                  {(resumoRs?.skusSemPreco.length ?? 0) > 0 && (
                    <p className="mb-3 text-sm text-destructive">
                      SKUs sem preço: {resumoRs?.skusSemPreco.slice(0, 20).join(", ")}
                    </p>
                  )}
                  <div className="max-h-80 overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>SKU</TableHead>
                          <TableHead>Plano</TableHead>
                          <TableHead className="text-right">Qtde</TableHead>
                          <TableHead className="text-right">R$</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(resumoRs?.linhas ?? []).slice(0, 100).map(l => (
                          <TableRow key={`${l.sku}-${l.planoColab}`}>
                            <TableCell className="font-mono text-sm">{l.sku}</TableCell>
                            <TableCell>{l.planoColab}</TableCell>
                            <TableCell className="text-right">{formatNum(l.qtde)}</TableCell>
                            <TableCell className="text-right">{formatRs(l.valorTotal)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="3" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">3-PVxCRM</CardTitle>
              <CardDescription>
                Sobreposições SKU×mês: {pvCrm?.sobrepostos ?? 0} · PV {formatNum(pvCrm?.totalPv)} · CRM{" "}
                {formatNum(pvCrm?.totalCrm)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingPv ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <div className="max-h-96 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>SKU</TableHead>
                        <TableHead>Mês</TableHead>
                        <TableHead className="text-right">PV</TableHead>
                        <TableHead className="text-right">CRM</TableHead>
                        <TableHead className="text-right">Delta</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(pvCrm?.rows ?? [])
                        .filter(r => r.pv > 0 && r.crm > 0)
                        .slice(0, 200)
                        .map(r => (
                          <TableRow key={`${r.sku}-${r.mes}`}>
                            <TableCell className="font-mono text-sm">{r.sku}</TableCell>
                            <TableCell>M{r.mes}</TableCell>
                            <TableCell className="text-right">{formatNum(r.pv)}</TableCell>
                            <TableCell className="text-right">{formatNum(r.crm)}</TableCell>
                            <TableCell className="text-right">{formatNum(r.delta)}</TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="aa" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Comparativo AA / Previsto / Real</CardTitle>
                <CardDescription>AA = faturamento ano {aaComp?.anoAA ?? "—"} no horizonte do ciclo</CardDescription>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={!aaComp}
                onClick={() =>
                  aaComp &&
                  exportToCsv(
                    aaComp.rows.map(r => ({
                      sku: r.sku,
                      marca: r.marca ?? "",
                      plano: r.planoColab,
                      aa: r.aa,
                      prev: r.prev,
                      real: r.real,
                      colab: r.colab,
                    })),
                    `comparativo_aa_ciclo_${cicloId}`,
                    [
                      { key: "sku", title: "SKU" },
                      { key: "marca", title: "Marca" },
                      { key: "plano", title: "Plano" },
                      { key: "aa", title: "AA" },
                      { key: "prev", title: "Previsto estat" },
                      { key: "real", title: "Real" },
                      { key: "colab", title: "Colaboração" },
                    ]
                  )
                }
              >
                <Download className="mr-2 h-4 w-4" /> Exportar
              </Button>
            </CardHeader>
            <CardContent>
              {loadingAa ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <div className="max-h-96 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>SKU</TableHead>
                        <TableHead className="text-right">AA</TableHead>
                        <TableHead className="text-right">Prev</TableHead>
                        <TableHead className="text-right">Real</TableHead>
                        <TableHead className="text-right">Colab</TableHead>
                        <TableHead className="text-right">Var AA</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(aaComp?.rows ?? []).slice(0, 150).map(r => (
                        <TableRow key={`${r.sku}-${r.planoColab}`}>
                          <TableCell className="font-mono text-sm">{r.sku}</TableCell>
                          <TableCell className="text-right">{formatNum(r.aa)}</TableCell>
                          <TableCell className="text-right">{formatNum(r.prev)}</TableCell>
                          <TableCell className="text-right">{formatNum(r.real)}</TableCell>
                          <TableCell className="text-right">{formatNum(r.colab)}</TableCell>
                          <TableCell className="text-right">{formatPct(r.varAaColab)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="4" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">4-Resumo PROD</CardTitle>
                <CardDescription>
                  Demanda por competência, tipo, marca, linha e plano para Capacidade/Operações
                </CardDescription>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={!resumoProd}
                onClick={() =>
                  resumoProd &&
                  exportToCsv(
                    resumoProd.rows,
                    `4-resumo_prod_ciclo_${cicloId}`,
                    [
                      { key: "ano", title: "Ano" },
                      { key: "mes", title: "Mês" },
                      { key: "tipoEstoque", title: "Tipo estoque" },
                      { key: "marca", title: "Marca" },
                      { key: "linha", title: "Linha" },
                      { key: "planoColab", title: "Plano" },
                      { key: "qtd", title: "Quantidade" },
                    ]
                  )
                }
              >
                <Download className="mr-2 h-4 w-4" /> Exportar PROD
              </Button>
            </CardHeader>
            <CardContent>
              {loadingProd ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <div className="max-h-96 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Competência</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Marca</TableHead>
                        <TableHead>Linha</TableHead>
                        <TableHead>Plano</TableHead>
                        <TableHead className="text-right">Quantidade</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(resumoProd?.rows ?? []).slice(0, 300).map(row => (
                        <TableRow
                          key={`${row.ano}-${row.mes}-${row.tipoEstoque}-${row.marca}-${row.linha}-${row.planoColab}`}
                        >
                          <TableCell>
                            {String(row.mes).padStart(2, "0")}/{row.ano}
                          </TableCell>
                          <TableCell>{row.tipoEstoque}</TableCell>
                          <TableCell>{row.marca}</TableCell>
                          <TableCell>{row.linha}</TableCell>
                          <TableCell>{row.planoColab}</TableCell>
                          <TableCell className="text-right">{formatNum(row.qtd)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="5" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">5-Resumo Base Ciclo</CardTitle>
                <CardDescription>{baseFull?.rows.length ?? 0} linhas (SKU × mês)</CardDescription>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={!baseFull}
                onClick={() =>
                  baseFull &&
                  exportToCsv(
                    baseFull.rows.map(r => ({
                      ano: r.ano,
                      mes: r.mes,
                      sku: r.sku,
                      marca: r.marca ?? "",
                      linha: r.linha ?? "",
                      plano: r.planoColab,
                      tipo: r.tipoEstoque ?? "",
                      qtd: r.qtd,
                    })),
                    `5-base_ciclo_${cicloId}`,
                    [
                      { key: "ano", title: "Ano" },
                      { key: "mes", title: "Mês" },
                      { key: "sku", title: "SKU" },
                      { key: "marca", title: "Marca" },
                      { key: "linha", title: "Linha" },
                      { key: "plano", title: "Plano" },
                      { key: "tipo", title: "Tipo" },
                      { key: "qtd", title: "Qtd" },
                    ]
                  )
                }
              >
                <Download className="mr-2 h-4 w-4" /> Exportar BD Ciclos
              </Button>
            </CardHeader>
            <CardContent>
              {loadingBase ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                <p className="text-sm text-muted-foreground">
                  Pronto para salvar no controle “1 - BD Ciclos S&OP” via export CSV.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="6" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">6-MTO Variação</CardTitle>
              <CardDescription>
                Vendeu MTO em {mtoVar?.anoAA ?? "AA"} e não está no fat {mtoVar?.anoAtual ?? "atual"} nem no ciclo (
                {mtoVar?.totalSkus ?? 0} SKUs)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingMto ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <div className="max-h-96 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>SKU</TableHead>
                        <TableHead>Marca</TableHead>
                        <TableHead className="text-right">Qtd AA</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(mtoVar?.faltantes ?? []).slice(0, 200).map(r => (
                        <TableRow key={r.sku}>
                          <TableCell className="font-mono text-sm">{r.sku}</TableCell>
                          <TableCell>{r.marca}</TableCell>
                          <TableCell className="text-right">{formatNum(r.qtdAA)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="7" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">7-Relatório RFS</CardTitle>
                <CardDescription>Consolidado para colar na aba RFS do S&OP</CardDescription>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={!rfs}
                onClick={exportRfs}
              >
                <Download className="mr-2 h-4 w-4" /> Exportar RFS
              </Button>
            </CardHeader>
            <CardContent>
              {loadingRfs ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <p className="text-sm text-muted-foreground">{rfs?.rows.length ?? 0} linhas no relatório.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
