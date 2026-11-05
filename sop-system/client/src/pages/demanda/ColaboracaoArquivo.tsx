import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

const HEADERS = [
  "sku/marca",
  "Sku",
  "Descrição",
  "Linha",
  "Marca",
  "Venda",
  "Mês",
  "Qtd",
  "Valor Total",
  "Relatório",
  "Tipo Comercial",
  "Tipo",
  "Tp",
  "Gestor",
] as const;

function formatQty(value: number) {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function formatMoney(value: number) {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatMes(iso: string) {
  const [ano, mes] = iso.split("-");
  if (!ano || !mes) return iso;
  return `${mes}/${ano}`;
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
  const { data, isLoading } = trpc.cicloComercial.consolidadoArquivo.useQuery({ cicloId });

  const rows = data?.rows ?? [];
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(row =>
      [row.skuMarca, row.sku, row.descricao, row.marca, row.linha, row.relatorio, row.gestor, row.tipo]
        .some(value => String(value || "").toLowerCase().includes(term))
    );
  }, [rows, search]);

  const preview = filtered.slice(0, 200);

  const exportExcel = () => {
    if (rows.length === 0) {
      toast.error("Não há linhas para exportar neste ciclo.");
      return;
    }
    const aoa: (string | number)[][] = [
      [...HEADERS],
      ...rows.map(row => [
        row.skuMarca,
        row.sku,
        row.descricao,
        row.linha,
        row.marca,
        row.venda,
        row.mes,
        row.qtd,
        row.valorTotal,
        row.relatorio,
        row.tipoComercial,
        row.tipo,
        row.tp,
        row.gestor,
      ]),
    ];
    const sheet = XLSX.utils.aoa_to_sheet(aoa);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Consolidado");
    XLSX.writeFile(book, `consolidado_ciclo_${cicloId}.xlsx`);
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {rows.length.toLocaleString("pt-BR")} linhas no modelo (SKU × mês). Preço vem do cadastro ou do faturamento recente. Gestor vem do vínculo da marca, do CRM ou do faturamento.
        </p>
        <div className="flex items-center gap-2">
          <Input
            className="w-56"
            placeholder="SKU, marca, gestor..."
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
          <Button type="button" size="sm" variant="outline" onClick={exportExcel}>
            <Download className="mr-2 h-4 w-4" />
            Exportar Excel
          </Button>
          {cicloStatus !== "FECHADO" && onFecharCiclo ? (
            <Button
              type="button"
              size="sm"
              onClick={onFecharCiclo}
              disabled={fechando}
            >
              {fechando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Fechar ciclo
            </Button>
          ) : null}
        </div>
      </div>
      <div className="max-h-[70vh] overflow-auto rounded-md border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              {HEADERS.map(header => (
                <TableHead key={header} className="whitespace-nowrap">
                  {header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {preview.length === 0 ? (
              <TableRow>
                <TableCell colSpan={HEADERS.length} className="text-center text-muted-foreground">
                  Nenhuma linha com quantidade neste ciclo.
                </TableCell>
              </TableRow>
            ) : (
              preview.map(row => (
                <TableRow key={`${row.relatorio}-${row.sku}-${row.mes}-${row.tipo}`}>
                  <TableCell className="whitespace-nowrap font-medium">{row.skuMarca}</TableCell>
                  <TableCell className="whitespace-nowrap">{row.sku}</TableCell>
                  <TableCell className="max-w-[220px] truncate">{row.descricao}</TableCell>
                  <TableCell>{row.linha}</TableCell>
                  <TableCell>{row.marca}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(row.venda)}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatMes(row.mes)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatQty(row.qtd)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(row.valorTotal)}</TableCell>
                  <TableCell>{row.relatorio}</TableCell>
                  <TableCell>{row.tipoComercial}</TableCell>
                  <TableCell>{row.tipo}</TableCell>
                  <TableCell>{row.tp}</TableCell>
                  <TableCell>{row.gestor || "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {filtered.length > preview.length && (
        <p className="text-xs text-muted-foreground">
          Exibindo {preview.length} de {filtered.length.toLocaleString("pt-BR")} linhas. O Excel exporta todas.
        </p>
      )}
    </div>
  );
}
