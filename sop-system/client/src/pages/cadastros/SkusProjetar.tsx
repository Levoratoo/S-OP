import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { exportToCsv } from "@/lib/exportCsv";
import { FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

/**
 * Equivalente à aba "Skus Projetar" do arquivo "1 - Estatística IA".
 * Só SKUs com projetarEstatistica=true entram no script de demanda.
 */
export default function SkusProjetar() {
  const utils = trpc.useUtils();
  const { data: produtos, isLoading } = trpc.produtos.list.useQuery();
  const [search, setSearch] = useState("");
  const [somenteProjetar, setSomenteProjetar] = useState(false);
  const [filtroTipo, setFiltroTipo] = useState<"all" | "MTS" | "MTO">("all");

  const updateMutation = trpc.produtos.update.useMutation({
    onSuccess: () => utils.produtos.list.invalidate(),
    onError: e => toast.error(e.message),
  });

  const batchMutation = trpc.produtos.setProjetarBatch.useMutation({
    onSuccess: result => {
      utils.produtos.list.invalidate();
      const miss = result.naoEncontrados.length;
      toast.success(
        `${result.atualizados} SKUs atualizados · ${result.totalProjetar} projetando` +
          (miss ? ` · ${miss} códigos não encontrados` : "")
      );
    },
    onError: e => toast.error(e.message),
  });

  const rows = useMemo(() => {
    let list = produtos ?? [];
    if (somenteProjetar) list = list.filter(p => p.projetarEstatistica !== false);
    if (filtroTipo !== "all") list = list.filter(p => p.tipoEstoque === filtroTipo);
    const term = search.trim().toLowerCase();
    if (term) {
      list = list.filter(p =>
        [p.codItem, p.codigo, p.descricao, p.nome, p.marca, p.linha]
          .filter(Boolean)
          .some(v => String(v).toLowerCase().includes(term))
      );
    }
    return list;
  }, [produtos, search, somenteProjetar, filtroTipo]);

  const stats = useMemo(() => {
    const all = produtos ?? [];
    const projetar = all.filter(p => p.projetarEstatistica !== false).length;
    return { total: all.length, projetar, nao: all.length - projetar };
  }, [produtos]);

  const handleImportLista = async (file: File, somenteEstes: boolean) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      const codigos: string[] = [];
      for (const row of json) {
        const raw =
          row["Cod Item"] ??
          row["CodItem"] ??
          row["SKU"] ??
          row["sku"] ??
          row["Codigo"] ??
          row["Código"] ??
          row["codItem"] ??
          Object.values(row)[0];
        const code = String(raw ?? "").trim();
        if (code) codigos.push(code);
      }
      if (codigos.length === 0) {
        toast.error("Nenhum código encontrado no arquivo.");
        return;
      }
      batchMutation.mutate({ codigos, projetar: true, somenteEstes });
    } catch (e) {
      toast.error(`Falha ao ler arquivo: ${String(e)}`);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Skus Projetar</h1>
        <p className="text-muted-foreground">
          Equivalente à aba do “1 - Estatística IA”: só estes SKUs entram no script de previsão
          (MTS ativos + MTO alinhados com o Comercial).
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total cadastro</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{stats.total}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Projetar = Sim</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-emerald-700">{stats.projetar}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Projetar = Não</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{stats.nao}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Importar lista (Excel)</CardTitle>
          <CardDescription>
            Coluna Cod Item / SKU / Código. “Somente estes” desliga os demais (como a aba Skus
            Projetar do Excel).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent">
            <Upload className="h-4 w-4" />
            Adicionar à lista (ligar)
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) void handleImportLista(f, false);
                e.target.value = "";
              }}
            />
          </Label>
          <Label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-orange-300 px-3 py-2 text-sm hover:bg-orange-50">
            <FileSpreadsheet className="h-4 w-4" />
            Substituir lista (somente estes)
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) void handleImportLista(f, true);
                e.target.value = "";
              }}
            />
          </Label>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              exportToCsv(
                rows.map(p => ({
                  codItem: p.codItem ?? p.codigo ?? "",
                  descricao: p.descricao ?? p.nome ?? "",
                  tipoEstoque: p.tipoEstoque ?? "",
                  marca: p.marca ?? "",
                  linha: p.linha ?? "",
                  projetar: p.projetarEstatistica !== false ? "SIM" : "NAO",
                })),
                "skus_projetar",
                [
                  { key: "codItem", title: "Cod Item" },
                  { key: "descricao", title: "Descrição" },
                  { key: "tipoEstoque", title: "Tipo Estoque" },
                  { key: "marca", title: "Marca" },
                  { key: "linha", title: "Linha" },
                  { key: "projetar", title: "Projetar" },
                ]
              )
            }
          >
            Exportar CSV
          </Button>
          {batchMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label>Buscar</Label>
          <Input
            className="w-64"
            placeholder="SKU, descrição, marca…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 pb-2">
          <Checkbox
            id="somente"
            checked={somenteProjetar}
            onCheckedChange={v => setSomenteProjetar(Boolean(v))}
          />
          <Label htmlFor="somente">Só projetar=Sim</Label>
        </div>
        <div className="flex gap-2 pb-1">
          {(["all", "MTS", "MTO"] as const).map(t => (
            <Button
              key={t}
              size="sm"
              variant={filtroTipo === t ? "default" : "outline"}
              onClick={() => setFiltroTipo(t)}
            >
              {t === "all" ? "Todos" : t}
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Marca</TableHead>
                    <TableHead>Linha</TableHead>
                    <TableHead className="text-right">Projetar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-sm">{p.codItem || p.codigo}</TableCell>
                      <TableCell className="max-w-xs truncate">{p.descricao || p.nome}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{p.tipoEstoque || "-"}</Badge>
                      </TableCell>
                      <TableCell>{p.marca || "-"}</TableCell>
                      <TableCell>{p.linha || "-"}</TableCell>
                      <TableCell className="text-right">
                        <Switch
                          checked={p.projetarEstatistica !== false}
                          disabled={updateMutation.isPending}
                          onCheckedChange={checked =>
                            updateMutation.mutate({ id: p.id, projetarEstatistica: checked })
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        Nenhum SKU neste filtro
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
