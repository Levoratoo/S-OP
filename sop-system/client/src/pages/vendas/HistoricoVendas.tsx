import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { Loader2, FileSpreadsheet, Upload } from "lucide-react";

const MESES = [
  { value: "0", label: "Todos" },
  { value: "1", label: "Janeiro" },
  { value: "2", label: "Fevereiro" },
  { value: "3", label: "Março" },
  { value: "4", label: "Abril" },
  { value: "5", label: "Maio" },
  { value: "6", label: "Junho" },
  { value: "7", label: "Julho" },
  { value: "8", label: "Agosto" },
  { value: "9", label: "Setembro" },
  { value: "10", label: "Outubro" },
  { value: "11", label: "Novembro" },
  { value: "12", label: "Dezembro" },
];

export default function HistoricoVendas() {
  const [, setLocation] = useLocation();
  const anoAtual = new Date().getFullYear();
  const [year, setYear] = useState(String(anoAtual));
  const [month, setMonth] = useState("0");

  const yearNum = parseInt(year, 10);
  const monthNum = month === "0" ? undefined : parseInt(month, 10);

  const { data: rows, isLoading } = trpc.faturamento.list.useQuery({
    limit: 200,
    year: yearNum,
    month: monthNum,
  });

  const { data: stats } = trpc.faturamento.stats.useQuery({
    year: yearNum,
    month: monthNum,
  });

  const yearOptions = useMemo(() => {
    const years = [anoAtual, anoAtual - 1, anoAtual - 2];
    return Array.from(new Set(years));
  }, [anoAtual]);

  const formatCurrency = (value: string | null | undefined) => {
    if (value == null || value === "") return "-";
    return `R$ ${parseFloat(value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
  };

  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("pt-BR");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Histórico de Vendas</h1>
          <p className="text-muted-foreground">
            Notas fiscais carregadas do ERP (faturamento)
          </p>
        </div>
        <Button variant="outline" onClick={() => setLocation("/vendas/importar")}>
          <Upload className="h-4 w-4 mr-2" />
          Importar / Atualizar
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Registros</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {(stats?.totalRegistros ?? 0).toLocaleString("pt-BR")}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Quantidade</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {(stats?.totalQtd ?? 0).toLocaleString("pt-BR")}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Valor total</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {formatCurrency(String(stats?.totalValor ?? 0))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap space-y-0">
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Faturamento
          </CardTitle>
          <div className="flex items-end gap-3">
            <div className="space-y-1">
              <Label>Ano</Label>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Mês</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MESES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>NF</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>UF</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Qtd</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!rows?.length ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      Nenhum faturamento no período. Use Importar / Atualizar para carregar do ERP.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono">{row.nfNumero || "-"}</TableCell>
                      <TableCell>{formatDate(row.dataEmissao)}</TableCell>
                      <TableCell className="max-w-[220px] truncate" title={row.descricaoItem || row.codMaterial || ""}>
                        {row.descricaoItem || row.codMaterial || "-"}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{row.codCliente || row.cnpj || "-"}</TableCell>
                      <TableCell>{row.uf || "-"}</TableCell>
                      <TableCell>{row.tipoFaturamento || "SAIDA"}</TableCell>
                      <TableCell className="text-right">
                        {parseFloat(row.qtd || "0").toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(row.valorTotal)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
          {rows && rows.length > 0 && (stats?.totalRegistros ?? 0) > rows.length && (
            <p className="text-xs text-muted-foreground mt-3">
              Exibindo {rows.length.toLocaleString("pt-BR")} de{" "}
              {(stats?.totalRegistros ?? 0).toLocaleString("pt-BR")} registros do período.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
