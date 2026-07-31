import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { Calculator, Loader2, Save, Upload } from "lucide-react";
import { toast } from "sonner";

const MES_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

type BrandRow = {
  marcaNome: string;
  meses: number[]; // 12 fractions 0-1
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function toPctDisplay(fraction: number) {
  return (fraction * 100).toFixed(1);
}

export default function SazonalidadeMarcaPage() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Record<string, number[]>>({});

  const { data: rows, isLoading } = trpc.sazonalidadeMarca.list.useQuery();

  const brands = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const row of rows ?? []) {
      if (!map.has(row.marcaNome)) map.set(row.marcaNome, Array(12).fill(0));
      const arr = map.get(row.marcaNome)!;
      if (row.mes >= 1 && row.mes <= 12) {
        arr[row.mes - 1] = Number(row.percentual) || 0;
      }
    }
    const list: BrandRow[] = Array.from(map.entries()).map(([marcaNome, meses]) => ({
      marcaNome,
      meses: draft[marcaNome] ?? meses,
    }));
    const term = search.trim().toLowerCase();
    return term
      ? list.filter(b => b.marcaNome.toLowerCase().includes(term))
      : list.sort((a, b) => a.marcaNome.localeCompare(b.marcaNome));
  }, [rows, draft, search]);

  const seedMutation = trpc.sazonalidadeMarca.seedUniforme.useMutation({
    onSuccess: result => {
      toast.success(
        result.inserted > 0
          ? `${result.inserted} linhas uniformes criadas.`
          : "Sazonalidade já existia — nada inserido."
      );
      utils.sazonalidadeMarca.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const calcMutation = trpc.sazonalidadeMarca.calcularDoFaturamento.useMutation({
    onSuccess: result => {
      toast.success(`Calculado para ${result.marcas} marcas (${result.rows} linhas).`);
      setDraft({});
      utils.sazonalidadeMarca.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const upsertMutation = trpc.sazonalidadeMarca.upsertBatch.useMutation({
    onSuccess: () => {
      toast.success("Sazonalidade salva.");
      setDraft({});
      utils.sazonalidadeMarca.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const importMutation = trpc.sazonalidadeMarca.importExcel.useMutation({
    onSuccess: result => {
      toast.success(
        `Importado: ${result.marcas} marcas / ${result.rows} linhas (aba ${result.sheetName}).`
      );
      setDraft({});
      utils.sazonalidadeMarca.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const updateCell = (marca: string, mesIdx: number, raw: string) => {
    const base =
      draft[marca] ??
      brands.find(b => b.marcaNome === marca)?.meses ??
      Array(12).fill(1 / 12);
    const next = [...base];
    const pct = Number(raw.replace(",", "."));
    if (!Number.isFinite(pct)) return;
    next[mesIdx] = Math.max(0, pct / 100);
    setDraft(prev => ({ ...prev, [marca]: next }));
  };

  const saveBrand = (marca: string) => {
    const meses = draft[marca] ?? brands.find(b => b.marcaNome === marca)?.meses;
    if (!meses) return;
    const sum = meses.reduce((a, b) => a + b, 0);
    const norm = sum > 0 ? meses.map(v => v / sum) : Array(12).fill(1 / 12);
    upsertMutation.mutate({
      rows: norm.map((percentual, i) => ({
        marcaNome: marca,
        mes: i + 1,
        percentual: String(Math.round(percentual * 1e6) / 1e6),
      })),
    });
  };

  const handleImport = async (file: File | null) => {
    if (!file) return;
    try {
      const contentBase64 = await readFileAsDataUrl(file);
      importMutation.mutate({ fileName: file.name, contentBase64 });
    } catch (e) {
      toast.error(`Falha ao ler arquivo: ${String(e)}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sazonalidade por Marca</h1>
          <p className="text-muted-foreground">
            % mensal (soma 100%) usada na desagregação do Passo 3. Validação anual do S&OP.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={seedMutation.isPending}
            onClick={() => seedMutation.mutate()}
          >
            {seedMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Seed uniforme (se vazio)
          </Button>
          <Button
            variant="outline"
            disabled={calcMutation.isPending}
            onClick={() => calcMutation.mutate({ anosHistorico: 3 })}
          >
            {calcMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Calculator className="mr-2 h-4 w-4" />
            )}
            Calcular do faturamento
          </Button>
          <Label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm">
            <Upload className="h-4 w-4" />
            Importar Excel
            <input
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={e => handleImport(e.target.files?.[0] ?? null)}
            />
          </Label>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Grade de sazonalidade</CardTitle>
          <CardDescription>
            Edite em % (0–100). Ao salvar, a linha é renormalizada para somar 100%. Formatos de
            import: Marca+jan…dez ou Marca+mês+% Sazonalidade.
          </CardDescription>
          <div className="max-w-sm pt-2">
            <Label>Buscar marca</Label>
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filtrar marca..."
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : brands.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              Nenhuma sazonalidade cadastrada. Use seed, cálculo do faturamento ou import Excel.
            </p>
          ) : (
            <div className="overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 bg-background">Marca</TableHead>
                    {MES_LABELS.map(m => (
                      <TableHead key={m} className="text-center">
                        {m}
                      </TableHead>
                    ))}
                    <TableHead>Total</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {brands.map(brand => {
                    const total = brand.meses.reduce((a, b) => a + b, 0);
                    const dirty = Boolean(draft[brand.marcaNome]);
                    return (
                      <TableRow key={brand.marcaNome}>
                        <TableCell className="sticky left-0 bg-background font-medium">
                          {brand.marcaNome}
                        </TableCell>
                        {brand.meses.map((v, i) => (
                          <TableCell key={i} className="p-1">
                            <Input
                              className="h-8 w-16 px-1 text-right"
                              defaultValue={toPctDisplay(v)}
                              key={`${brand.marcaNome}-${i}-${toPctDisplay(v)}`}
                              onBlur={e => updateCell(brand.marcaNome, i, e.target.value)}
                            />
                          </TableCell>
                        ))}
                        <TableCell
                          className={
                            Math.abs(total - 1) > 0.02 ? "font-medium text-destructive" : ""
                          }
                        >
                          {(total * 100).toFixed(1)}%
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant={dirty ? "default" : "outline"}
                            disabled={upsertMutation.isPending || !dirty}
                            onClick={() => saveBrand(brand.marcaNome)}
                          >
                            <Save className="mr-1 h-3 w-3" />
                            Salvar
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
