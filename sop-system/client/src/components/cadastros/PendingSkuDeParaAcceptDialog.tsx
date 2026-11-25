import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import {
  SKU_SIMILARITY_AUTO_PICK,
  SKU_SIMILARITY_DEPARA_AUTO_PICK,
  SKU_SIMILARITY_REVIEW_WARN,
} from "@shared/sku-descricao-similarity";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type PendingSkuRow = {
  codMaterial: string;
  marca?: string | null;
  descricaoItem?: string | null;
};

type RowState = {
  codMaterial: string;
  descricao: string;
  marca: string;
  skuAntigo: string | null;
  sugestoes: Array<{ codigo: string; descricao: string; marca?: string | null; score: number }>;
  loading: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skus: PendingSkuRow[];
  /** De-Para: sempre preenche melhor sugestão; Produtos: só se score >= AUTO_PICK */
  mode: "depara" | "produtos";
  onConfirm: (items: Array<{ codMaterial: string; skuAntigo: string | null }>) => void;
  isPending?: boolean;
};

const SEM_REF = "__sem__";

export function PendingSkuDeParaAcceptDialog({
  open,
  onOpenChange,
  skus,
  mode,
  onConfirm,
  isPending,
}: Props) {
  const [rows, setRows] = useState<RowState[]>([]);
  const [manualBusca, setManualBusca] = useState<Record<string, string>>({});

  const suggestBatch = trpc.cadastrosSistema.suggestSkuReferenciasBatch.useMutation();
  const { data: produtosList } = trpc.produtos.list.useQuery(undefined, { enabled: open });

  useEffect(() => {
    if (!open || !skus.length) return;
    const initial: RowState[] = skus.map(s => ({
      codMaterial: s.codMaterial,
      descricao: s.descricaoItem || s.codMaterial,
      marca: s.marca || "",
      skuAntigo: null,
      sugestoes: [],
      loading: true,
    }));
    setRows(initial);
    suggestBatch
      .mutateAsync({ codMaterials: skus.map(s => s.codMaterial) })
      .then(map => {
        setRows(
          skus.map(s => {
            const sugestoes = map[s.codMaterial] ?? [];
            const best = sugestoes[0];
            const autoPick =
              mode === "depara"
                ? best && best.score >= SKU_SIMILARITY_DEPARA_AUTO_PICK
                  ? best.codigo
                  : null
                : best && best.score >= SKU_SIMILARITY_AUTO_PICK
                  ? best.codigo
                  : null;
            return {
              codMaterial: s.codMaterial,
              descricao: s.descricaoItem || s.codMaterial,
              marca: s.marca || "",
              skuAntigo: autoPick,
              sugestoes,
              loading: false,
            };
          })
        );
      })
      .catch(() => setRows(prev => prev.map(r => ({ ...r, loading: false }))));
  }, [open, skus, mode]);

  const produtosBusca = useMemo(() => {
    return (produtosList ?? []).map(p => ({
      codigo: (p.codItem || p.codigo || "").trim(),
      descricao: p.descricao || p.nome || "",
      marca: p.marca,
    }));
  }, [produtosList]);

  const setRef = (codMaterial: string, skuAntigo: string | null) => {
    setRows(prev => prev.map(r => (r.codMaterial === codMaterial ? { ...r, skuAntigo } : r)));
  };

  const scoreFor = (row: RowState) => {
    if (!row.skuAntigo) return null;
    return row.sugestoes.find(s => s.codigo === row.skuAntigo)?.score ?? null;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Substituição De-Para (SKU antigo → novo)</DialogTitle>
          <DialogDescription>
            Escolha o SKU de referência para cada código novo ou marque &quot;Sem referência&quot; para cadastrar
            sem De-Para.
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código novo</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Marca</TableHead>
                <TableHead className="min-w-[280px]">Substitui o SKU (De-Para)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(row => {
                const score = scoreFor(row);
                const warn = score != null && score < SKU_SIMILARITY_REVIEW_WARN;
                const busca = manualBusca[row.codMaterial] ?? "";
                const buscaHits = busca.trim()
                  ? produtosBusca
                      .filter(
                        p =>
                          p.codigo &&
                          p.codigo.toUpperCase() !== row.codMaterial.toUpperCase() &&
                          [p.codigo, p.descricao, p.marca]
                            .filter(Boolean)
                            .some(v => String(v).toLowerCase().includes(busca.toLowerCase()))
                      )
                      .slice(0, 8)
                  : [];
                return (
                  <TableRow key={row.codMaterial}>
                    <TableCell className="font-mono text-xs">{row.codMaterial}</TableCell>
                    <TableCell className="max-w-[200px] truncate" title={row.descricao}>
                      {row.descricao}
                    </TableCell>
                    <TableCell>{row.marca || "—"}</TableCell>
                    <TableCell className="space-y-2">
                      {row.loading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Select
                            value={row.skuAntigo ?? SEM_REF}
                            onValueChange={v => setRef(row.codMaterial, v === SEM_REF ? null : v)}
                          >
                            <SelectTrigger
                              className={cn(
                                "h-9",
                                warn && row.skuAntigo ? "border-amber-400 bg-amber-50/80" : undefined
                              )}
                            >
                              <SelectValue placeholder="Sem referência" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={SEM_REF}>Sem referência</SelectItem>
                              {row.sugestoes.map(s => (
                                <SelectItem key={s.codigo} value={s.codigo}>
                                  {s.codigo} — {s.descricao.slice(0, 48)} ({Math.round(s.score * 100)}%)
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {score != null && row.skuAntigo ? (
                            <p className={cn("text-xs", warn ? "text-amber-700" : "text-muted-foreground")}>
                              Similaridade: {Math.round(score * 100)}%
                              {warn ? " — revise" : ""}
                            </p>
                          ) : null}
                          <div className="space-y-1">
                            <Label className="text-xs">Buscar outro SKU</Label>
                            <Input
                              className="h-8 text-xs"
                              placeholder="Código ou descrição…"
                              value={busca}
                              onChange={e =>
                                setManualBusca(prev => ({ ...prev, [row.codMaterial]: e.target.value }))
                              }
                            />
                            {buscaHits.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {buscaHits.map(p => (
                                  <Button
                                    key={p.codigo}
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs"
                                    onClick={() => setRef(row.codMaterial, p.codigo)}
                                  >
                                    {p.codigo}
                                  </Button>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={isPending || rows.some(r => r.loading)}
            onClick={() =>
              onConfirm(
                rows.map(r => ({
                  codMaterial: r.codMaterial,
                  skuAntigo: r.skuAntigo,
                }))
              )
            }
          >
            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Confirmar ({rows.length} SKU{rows.length !== 1 ? "s" : ""})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}