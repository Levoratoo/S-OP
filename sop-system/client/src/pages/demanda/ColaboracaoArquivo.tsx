import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CONSOLIDADO_EXCEL_HEADERS } from "@shared/consolidado-arquivo";
import { textMatchesSearch } from "@shared/text-search";
import { trpc } from "@/lib/trpc";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

function formatQty(value: number) {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function formatMoney(value: number) {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatMes(iso: string) {
  const [ano, mes, dia] = iso.split("-");
  if (!ano || !mes) return iso;
  return `${dia ?? "01"}/${mes}/${ano}`;
}

function parseMesIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function ColaboracaoArquivo({
  cicloId,
  cicloStatus,
  onFecharCiclo,
  fechando,
}: {
  cicloId: number;
  cicloStatus?: string;
  onFecharCiclo?: () => void;
  fechando?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [filterRelatorio, setFilterRelatorio] = useState<string>("all");
  const [filterGestor, setFilterGestor] = useState<string>("all");
  const [filterMarca, setFilterMarca] = useState<string>("all");
  const [filterMes, setFilterMes] = useState<string>("all");

  const { data, isLoading } = trpc.cicloComercial.consolidadoArquivo.useQuery({ cicloId });

  const rows = data?.rows ?? [];

  const opcoes = useMemo(() => {
    const relatorios = new Set<string>();
    const gestores = new Set<string>();
    const marcas = new Set<string>();
    const meses = new Set<string>();
    for (const row of rows) {
      relatorios.add(row.relatorio);
      if (row.gestor) gestores.add(row.gestor);
      if (row.marca) marcas.add(row.marca);
      meses.add(row.mes);
    }
    return {
      relatorios: Array.from(relatorios).sort(),
      gestores: Array.from(gestores).sort((a, b) => a.localeCompare(b, "pt-BR")),
      marcas: Array.from(marcas).sort((a, b) => a.localeCompare(b, "pt-BR")),
      meses: Array.from(meses).sort(),
    };
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter(row => {
      if (filterRelatorio !== "all" && row.relatorio !== filterRelatorio) return false;
      if (filterGestor !== "all" && row.gestor !== filterGestor) return false;
      if (filterMarca !== "all" && row.marca !== filterMarca) return false;
      if (filterMes !== "all" && row.mes !== filterMes) return false;
      const term = search.trim();
      if (!term) return true;
      return textMatchesSearch(
        [row.skuMarca, row.sku, row.descricao, row.marca, row.linha, row.familia, row.gestor].join(
          " "
        ),
        term
      );
    });
  }, [rows, search, filterRelatorio, filterGestor, filterMarca, filterMes]);

  const totais = useMemo(() => {
    let qtd = 0;
    let valor = 0;
    for (const row of filtered) {
      qtd += row.qtd;
      valor += row.valorTotal;
    }
    return { qtd, valor };
  }, [filtered]);

  const preview = filtered.slice(0, 300);

  const exportExcel = () => {
    if (rows.length === 0) {
      toast.error("Não há linhas para exportar neste ciclo.");
      return;
    }
    const exportRows = rows;
    const aoa: (string | number | Date)[][] = [
      [...CONSOLIDADO_EXCEL_HEADERS],
      ...exportRows.map(row => [
        row.skuMarca,
        row.sku,
        row.descricao,
        row.linha,
        row.marca,
        row.venda,
        parseMesIso(row.mes),
        row.qtd,
        row.valorTotal,
        row.relatorio,
        row.tipoComercial,
        row.tipo,
        row.tp,
        row.gestor,
        row.familia,
      ]),
    ];
    const sheet = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Consolidado");
    XLSX.writeFile(book, `consolidado_ciclo_${cicloId}.xlsx`, { cellDates: true });
    toast.success(`${exportRows.length.toLocaleString("pt-BR")} linhas exportadas.`);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Modelo padrão: uma linha por SKU × mês × origem (12 meses a partir do mês seguinte ao ciclo).
        Relatório: MTS (inclui SKUs ATD com Tipo Comercial ATD), MTO PV, CRM. Preço: cadastro → snapshot
        do ciclo → média faturamento 12M.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label>Buscar SKU</Label>
          <Input
            className="w-48"
            placeholder="Código, descrição…"
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>Relatório</Label>
          <Select value={filterRelatorio} onValueChange={setFilterRelatorio}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {opcoes.relatorios.map(r => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Gestor</Label>
          <Select value={filterGestor} onValueChange={setFilterGestor}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {opcoes.gestores.map(g => (
                <SelectItem key={g} value={g}>
                  {g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Marca</Label>
          <Select value={filterMarca} onValueChange={setFilterMarca}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {opcoes.marcas.map(m => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Mês</Label>
          <Select value={filterMes} onValueChange={setFilterMes}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {opcoes.meses.map(m => (
                <SelectItem key={m} value={m}>
                  {formatMes(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 pb-0.5 ml-auto">
          <Button type="button" size="sm" variant="outline" onClick={exportExcel}>
            <Download className="mr-2 h-4 w-4" />
            Exportar Excel
          </Button>
          {cicloStatus !== "FECHADO" && onFecharCiclo ? (
            <Button type="button" size="sm" onClick={onFecharCiclo} disabled={fechando}>
              {fechando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Fechar ciclo
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-6 text-sm">
        <span>
          <span className="text-muted-foreground">Linhas filtradas:</span>{" "}
          <strong>{filtered.length.toLocaleString("pt-BR")}</strong> de {rows.length.toLocaleString("pt-BR")}
        </span>
        <span>
          <span className="text-muted-foreground">Qtd total:</span>{" "}
          <strong>{formatQty(totais.qtd)}</strong>
        </span>
        <span>
          <span className="text-muted-foreground">Valor Total:</span>{" "}
          <strong>{formatMoney(totais.valor)}</strong>
        </span>
      </div>

      <div className="max-h-[70vh] overflow-auto rounded-md border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              {CONSOLIDADO_EXCEL_HEADERS.map(header => (
                <TableHead key={header} className="whitespace-nowrap">
                  {header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {preview.length === 0 ? (
              <TableRow>
                <TableCell colSpan={CONSOLIDADO_EXCEL_HEADERS.length} className="text-center text-muted-foreground">
                  Nenhuma linha com quantidade neste filtro.
                </TableCell>
              </TableRow>
            ) : (
              preview.map(row => (
                <TableRow key={`${row.relatorio}-${row.sku}-${row.mes}-${row.tipo}`}>
                  <TableCell className="whitespace-nowrap font-medium">{row.skuMarca}</TableCell>
                  <TableCell className="whitespace-nowrap">{row.sku}</TableCell>
                  <TableCell className="max-w-[200px] truncate" title={row.descricao}>
                    {row.descricao}
                  </TableCell>
                  <TableCell>{row.linha}</TableCell>
                  <TableCell>{row.marca}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(row.venda)}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatMes(row.mes)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatQty(row.qtd)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatQty(row.valorTotal)}</TableCell>
                  <TableCell>{row.relatorio}</TableCell>
                  <TableCell>{row.tipoComercial}</TableCell>
                  <TableCell>{row.tipo}</TableCell>
                  <TableCell>{row.tp}</TableCell>
                  <TableCell>{row.gestor || "—"}</TableCell>
                  <TableCell>{row.familia || "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {filtered.length > preview.length && (
        <p className="text-xs text-muted-foreground">
          Exibindo {preview.length} de {filtered.length.toLocaleString("pt-BR")} linhas filtradas. O Excel
          exporta o ciclo completo ({rows.length.toLocaleString("pt-BR")} linhas).
        </p>
      )}
    </div>
  );
}
