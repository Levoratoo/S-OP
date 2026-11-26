import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ProdutoCombobox, type ProdutoOpcao } from "@/components/cadastros/ProdutoCombobox";
import { trpc } from "@/lib/trpc";
import { escolherReferenciaSku, payloadConfirmarReferencias } from "@shared/de-para-combobox";
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

type Sugestao = { codigo: string; descricao: string; marca?: string | null; score: number };

type RowState = {
  codMaterial: string;
  descricao: string;
  marca: string;
  skuAntigo: string | null;
  sugestoes: Sugestao[];
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

export function PendingSkuDeParaAcceptDialog({
  open,
  onOpenChange,
  skus,
  mode,
  onConfirm,
  isPending,
}: Props) {
  const [rows, setRows] = useState<RowState[]>([]);
  const suggestBatch = trpc.cadastrosSistema.suggestSkuReferenciasBatch.useMutation();
  const skusKey = skus.map(item => item.codMaterial).join("|");

  useEffect(() => {
    if (!open || !skus.length) return;
    let cancelado = false;
    setRows(
      skus.map(item => ({
        codMaterial: item.codMaterial,
        descricao: item.descricaoItem || item.codMaterial,
        marca: item.marca || "",
        skuAntigo: null,
        sugestoes: [],
        loading: true,
      }))
    );
    suggestBatch
      .mutateAsync({ codMaterials: skus.map(item => item.codMaterial) })
      .then(map => {
        if (cancelado) return;
        setRows(
          skus.map(item => {
            const sugestoes = map[item.codMaterial] ?? [];
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
              codMaterial: item.codMaterial,
              descricao: item.descricaoItem || item.codMaterial,
              marca: item.marca || "",
              skuAntigo: autoPick,
              sugestoes,
              loading: false,
            };
          })
        );
      })
      .catch(() => {
        if (!cancelado) setRows(prev => prev.map(row => ({ ...row, loading: false })));
      });
    return () => {
      cancelado = true;
    };
    // A identidade de `skus` muda a cada render do pai. A chave estável é a lista de códigos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, skusKey, mode]);

  const setRef = (codMaterial: string, skuAntigo: string | null) => {
    setRows(prev => prev.map(row => (row.codMaterial === codMaterial ? { ...row, skuAntigo } : row)));
  };

  const escolher = (row: RowState, opcao: ProdutoOpcao | null) => {
    const sugestao = row.sugestoes[0]?.codigo ?? null;
    const escolha =
      opcao == null
        ? "sem"
        : sugestao && opcao.codigo.toUpperCase() === sugestao.toUpperCase()
          ? "sugestao"
          : { codigo: opcao.codigo };
    const resultado = escolherReferenciaSku(
      { codMaterial: row.codMaterial, skuAntigo: row.skuAntigo, sugestaoCodigo: sugestao },
      escolha
    );
    if (resultado.erro) return;
    setRef(row.codMaterial, resultado.linha.skuAntigo);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[95vw] max-w-6xl flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl">
        <DialogHeader className="shrink-0 px-4 pr-10 pt-4 text-left sm:px-6 sm:pt-6">
          <DialogTitle className="text-left leading-snug break-words">
            Substituição De-Para (SKU antigo → novo)
          </DialogTitle>
          <DialogDescription className="text-left break-words">
            A sugestão por similaridade já vem selecionada. Busque outro produto cadastrado ou marque Sem referência.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 sm:px-6">
          <div className="space-y-3 md:hidden">
            {rows.map(row => (
              <article key={row.codMaterial} className="flex min-w-0 flex-col gap-2 rounded-md border p-3">
                <p className="break-all font-mono text-xs">{row.codMaterial}</p>
                <p className="break-words text-sm leading-snug">{row.descricao}</p>
                <p className="break-words text-xs text-muted-foreground">{row.marca || "—"}</p>
                <ReferenciaCampo row={row} onChange={opcao => escolher(row, opcao)} />
              </article>
            ))}
          </div>
          <div className="hidden overflow-x-auto rounded-md border md:block">
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
                {rows.map(row => (
                  <TableRow key={row.codMaterial}>
                    <TableCell className="font-mono text-xs">{row.codMaterial}</TableCell>
                    <TableCell className="max-w-[200px] whitespace-normal break-words" title={row.descricao}>
                      {row.descricao}
                    </TableCell>
                    <TableCell className="break-words">{row.marca || "—"}</TableCell>
                    <TableCell>
                      <ReferenciaCampo row={row} onChange={opcao => escolher(row, opcao)} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
        <DialogFooter className="shrink-0 flex-wrap gap-2 border-t bg-background px-4 py-3 sm:px-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={isPending || rows.some(row => row.loading)}
            onClick={() =>
              onConfirm(
                payloadConfirmarReferencias(
                  rows.map(row => ({
                    codMaterial: row.codMaterial,
                    skuAntigo: row.skuAntigo,
                    sugestaoCodigo: row.sugestoes[0]?.codigo ?? null,
                  }))
                )
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

function ReferenciaCampo({ row, onChange }: { row: RowState; onChange: (opcao: ProdutoOpcao | null) => void }) {
  const score = row.skuAntigo ? row.sugestoes.find(item => item.codigo === row.skuAntigo)?.score ?? null : null;
  const warn = score != null && score < SKU_SIMILARITY_REVIEW_WARN;
  const atual = valorSelecionado(row);
  return (
    <div className="min-w-0 space-y-1">
      <Label className="text-xs">Substitui o SKU (De-Para)</Label>
      {row.loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <ProdutoCombobox
          permitirSemReferencia
          value={atual}
          sugestoes={row.sugestoes}
          excluir={[row.codMaterial]}
          onChange={onChange}
          placeholder="Buscar outro SKU"
        />
      )}
      {score != null && row.skuAntigo ? (
        <p className={cn("text-xs", warn ? "text-amber-700" : "text-muted-foreground")}>
          Similaridade: {Math.round(score * 100)}%{warn ? " — revise" : ""}
        </p>
      ) : null}
    </div>
  );
}

function valorSelecionado(row: RowState): ProdutoOpcao | null {
  if (!row.skuAntigo) return null;
  const sugestao = row.sugestoes.find(item => item.codigo.toUpperCase() === row.skuAntigo?.toUpperCase());
  if (sugestao) return sugestao;
  return { codigo: row.skuAntigo, descricao: "", marca: null };
}
