import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exportToCsv } from "@/lib/exportCsv";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Download, Info } from "lucide-react";
import { precoOrigemPvLabel, type PrecoOrigemPv } from "@shared/pv-preco-fallback";
import { formatPreco4Moeda } from "@shared/pv-preco-round";

export type PvPivotRow = {
  marca: string | null;
  codItem: string;
  descricao: string | null;
  tipo: string | null;
  precoUnitario: number;
  precoOrigem?: PrecoOrigemPv | null;
  numPedido: string;
  meses: number[];
  quantidadeTotal: number;
  receitaTotal: number;
  cliente?: string | null;
  faturado?: boolean;
  semCadastro?: boolean;
};

type Props = {
  horizonLabels: string[];
  rows: PvPivotRow[];
  searchGlobal?: string;
  exportFileName: string;
  emptyMessage: string;
  extraColumns?: React.ReactNode;
  showClienteFaturado?: boolean;
  onCadastrar?: (row: PvPivotRow) => void;
};

function formatQty(value: number) {
  if (!value) return "";
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function formatPreco(value: number) {
  return formatPreco4Moeda(value);
}

function formatRs(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function PvMtoPivotTable({
  horizonLabels,
  rows: allRows,
  searchGlobal = "",
  exportFileName,
  emptyMessage,
  showClienteFaturado,
  onCadastrar,
}: Props) {
  const [fMarca, setFMarca] = useState("");
  const [fCod, setFCod] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fTipo, setFTipo] = useState("");
  const [fPedido, setFPedido] = useState("");

  const fixedCols = showClienteFaturado ? 8 : 6;

  const rows = useMemo(() => {
    let list = allRows;
    const term = searchGlobal.trim().toLowerCase();
    if (term) {
      list = list.filter(r =>
        [r.marca, r.codItem, r.descricao, r.tipo, r.numPedido, r.cliente]
          .filter(Boolean)
          .some(v => String(v).toLowerCase().includes(term))
      );
    }
    const marca = fMarca.trim().toLowerCase();
    const cod = fCod.trim().toLowerCase();
    const desc = fDesc.trim().toLowerCase();
    const tipo = fTipo.trim().toLowerCase();
    const ped = fPedido.trim().toLowerCase();
    return list.filter(r => {
      if (marca && !String(r.marca ?? "").toLowerCase().includes(marca)) return false;
      if (cod && !r.codItem.toLowerCase().includes(cod)) return false;
      if (desc && !String(r.descricao ?? "").toLowerCase().includes(desc)) return false;
      if (tipo && !String(r.tipo ?? "").toLowerCase().includes(tipo)) return false;
      if (ped && !r.numPedido.toLowerCase().includes(ped)) return false;
      return true;
    });
  }, [allRows, searchGlobal, fMarca, fCod, fDesc, fTipo, fPedido]);

  const filteredTotals = useMemo(() => {
    const monthTotals = Array(horizonLabels.length).fill(0);
    let grandQty = 0;
    let grandRs = 0;
    for (const row of rows) {
      grandQty += row.quantidadeTotal;
      grandRs += row.receitaTotal;
      row.meses.forEach((v, i) => {
        monthTotals[i] += v;
      });
    }
    return { monthTotals, grandQty, grandRs };
  }, [rows, horizonLabels.length]);

  const exportExcel = () => {
    const cols: { key: string; title: string }[] = [
      { key: "marca", title: "Marca" },
      { key: "codItem", title: "Cod Item" },
      { key: "descricao", title: "Descrição" },
      { key: "tipo", title: "Tipo" },
      { key: "precoUnitario", title: "Preço Unitário" },
      { key: "numPedido", title: "Nº Pedido" },
    ];
    if (showClienteFaturado) {
      cols.push({ key: "cliente", title: "Cliente" }, { key: "faturado", title: "Faturado" });
    }
    cols.push(
      ...horizonLabels.map((label, i) => ({ key: `m${i}`, title: label })),
      { key: "total", title: "Total" },
      { key: "receitaTotal", title: "R$ Total" }
    );
    const exportRows = rows.map(r => {
      const base: Record<string, string | number> = {
        marca: r.marca ?? "",
        codItem: r.codItem,
        descricao: r.descricao ?? "",
        tipo: r.tipo ?? "",
        precoUnitario: r.precoUnitario,
        numPedido: r.numPedido,
        total: r.quantidadeTotal,
        receitaTotal: r.receitaTotal,
      };
      if (showClienteFaturado) {
        base.cliente = r.cliente ?? "";
        base.faturado = r.faturado ? "Sim" : "Não";
      }
      r.meses.forEach((v, i) => {
        base[`m${i}`] = v || "";
      });
      return base;
    });
    exportToCsv(exportRows as Record<string, unknown>[], exportFileName, cols);
  };

  return (
    <div className="w-full min-w-0 max-w-full space-y-2">
      <div className="flex justify-end">
        <Button type="button" size="sm" variant="outline" onClick={exportExcel} disabled={!rows.length}>
          <Download className="mr-2 h-4 w-4" />
          Exportar
        </Button>
      </div>
      <div className="w-full min-w-0 max-w-full max-h-[70vh] overflow-x-auto overflow-y-auto rounded-md border">
        <table className="min-w-[1100px] w-full caption-bottom border-separate border-spacing-0 text-sm">
          <TableHeader>
            <TableRow className="bg-sky-800 hover:bg-sky-800">
              <TableHead colSpan={fixedCols} className="sticky left-0 z-20 bg-sky-800 text-white font-semibold" />
              <TableHead
                colSpan={horizonLabels.length}
                className="text-center text-white font-semibold border-l border-sky-600"
              >
                Soma de Quantidade
              </TableHead>
              <TableHead colSpan={2} className="text-white font-semibold border-l border-sky-600" />
            </TableRow>
            <TableRow className="bg-sky-700 hover:bg-sky-700">
              <TableHead className="sticky left-0 z-30 min-w-[88px] max-w-[88px] bg-sky-700 text-white">Marca</TableHead>
              <TableHead className="sticky left-[88px] z-30 min-w-[104px] bg-sky-700 text-white">
                Cod Item
              </TableHead>
              <TableHead className="min-w-[200px] bg-sky-700 text-white">Descrição</TableHead>
              <TableHead className="min-w-[72px] bg-sky-700 text-white">Tipo</TableHead>
              <TableHead className="min-w-[100px] bg-sky-700 text-white text-right">Preço Unitário</TableHead>
              <TableHead className="min-w-[100px] bg-sky-700 text-white border-r border-sky-600">
                Nº Pedido
              </TableHead>
              {showClienteFaturado ? (
                <>
                  <TableHead className="min-w-[120px] bg-sky-700 text-white">Cliente</TableHead>
                  <TableHead className="min-w-[80px] bg-sky-700 text-white border-r border-sky-600">
                    Faturado
                  </TableHead>
                </>
              ) : null}
              <TableHead colSpan={horizonLabels.length} className="text-center text-white border-l border-sky-600">
                Meses (Data)
              </TableHead>
              <TableHead className="text-white text-right">Total</TableHead>
              <TableHead className="text-white text-right">R$ Total</TableHead>
            </TableRow>
            <TableRow className="bg-sky-100 dark:bg-sky-950">
              <TableHead className="sticky left-0 z-30 bg-sky-100 p-1 dark:bg-sky-950">
                <Input className="h-7 text-xs" placeholder="Filtrar" value={fMarca} onChange={e => setFMarca(e.target.value)} />
              </TableHead>
              <TableHead className="sticky left-[88px] z-30 bg-sky-100 p-1 dark:bg-sky-950">
                <Input className="h-7 text-xs" placeholder="Filtrar" value={fCod} onChange={e => setFCod(e.target.value)} />
              </TableHead>
              <TableHead className="p-1">
                <Input className="h-7 text-xs" placeholder="Filtrar" value={fDesc} onChange={e => setFDesc(e.target.value)} />
              </TableHead>
              <TableHead className="p-1">
                <Input className="h-7 text-xs" placeholder="Filtrar" value={fTipo} onChange={e => setFTipo(e.target.value)} />
              </TableHead>
              <TableHead className="p-1" />
              <TableHead className="p-1 border-r">
                <Input className="h-7 text-xs" placeholder="Filtrar" value={fPedido} onChange={e => setFPedido(e.target.value)} />
              </TableHead>
              {showClienteFaturado ? (
                <>
                  <TableHead className="p-1" />
                  <TableHead className="p-1 border-r" />
                </>
              ) : null}
              {horizonLabels.map(label => (
                <TableHead key={label} className="text-center text-xs font-medium p-1 min-w-[72px]">
                  {label}
                </TableHead>
              ))}
              <TableHead />
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={fixedCols + 2 + horizonLabels.length} className="py-8 text-center text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, idx) => (
                <TableRow key={`${row.numPedido}-${row.codItem}-${row.precoUnitario}-${idx}`}>
                  <TableCell className="sticky left-0 z-20 bg-white font-medium dark:bg-slate-950">{row.marca || "—"}</TableCell>
                  <TableCell className="sticky left-[88px] z-20 bg-white font-mono text-xs dark:bg-slate-950">
                    <div className="flex flex-wrap items-center gap-1">
                      <span>{row.codItem}</span>
                      {row.semCadastro ? (
                        onCadastrar ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="cursor-pointer"
                                aria-label={`Cadastrar item ${row.codItem}`}
                                onClick={() => onCadastrar(row)}
                              >
                                <Badge variant="outline" className="h-5 cursor-pointer px-1 py-0 text-[10px] hover:bg-amber-50">
                                  sem cadastro
                                </Badge>
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>Cadastrar item</TooltipContent>
                          </Tooltip>
                        ) : (
                          <Badge variant="outline" className="h-5 px-1 py-0 text-[10px]">
                            sem cadastro
                          </Badge>
                        )
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[240px] whitespace-normal text-xs" title={row.descricao ?? ""}>
                    {row.descricao || "—"}
                  </TableCell>
                  <TableCell>{row.tipo || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span className="inline-flex items-center justify-end gap-1">
                      {formatPreco(row.precoUnitario)}
                      {row.precoOrigem && row.precoOrigem !== "erp" ? (
                        <span title={precoOrigemPvLabel(row.precoOrigem)} className="text-amber-600">
                          <Info className="h-3.5 w-3.5" />
                        </span>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs border-r">{row.numPedido || "—"}</TableCell>
                  {showClienteFaturado ? (
                    <>
                      <TableCell>{row.cliente || "—"}</TableCell>
                      <TableCell className="border-r">{row.faturado ? "Sim" : "Não"}</TableCell>
                    </>
                  ) : null}
                  {row.meses.map((v, i) => (
                    <TableCell key={i} className="text-right tabular-nums text-xs">
                      {formatQty(v)}
                    </TableCell>
                  ))}
                  <TableCell className="text-right font-medium tabular-nums">{formatQty(row.quantidadeTotal)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatRs(row.receitaTotal)}</TableCell>
                </TableRow>
              ))
            )}
            {rows.length > 0 && (
              <TableRow className="sticky bottom-0 z-20 bg-muted font-semibold shadow-[0_-1px_0_0_hsl(var(--border))]">
                <TableCell colSpan={fixedCols} className="sticky bottom-0 left-0 z-30 border-r bg-muted">
                  Total geral
                </TableCell>
                {filteredTotals.monthTotals.map((v, i) => (
                  <TableCell key={i} className="sticky bottom-0 z-20 bg-muted text-right tabular-nums">
                    {formatQty(v)}
                  </TableCell>
                ))}
                <TableCell className="sticky bottom-0 z-20 bg-muted text-right tabular-nums">{formatQty(filteredTotals.grandQty)}</TableCell>
                <TableCell className="sticky bottom-0 z-20 bg-muted text-right tabular-nums">{formatRs(filteredTotals.grandRs)}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </table>
      </div>
    </div>
  );
}