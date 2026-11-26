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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProdutoCombobox, type ProdutoOpcao } from "@/components/cadastros/ProdutoCombobox";
import { trpc } from "@/lib/trpc";
import { itemAceiteCarteira } from "@shared/de-para-combobox";
import { SKU_SIMILARITY_DEPARA_AUTO_PICK } from "@shared/sku-descricao-similarity";
import { TIPOS_NEGOCIO_VALIDOS, normalizeTipoNegocioComercial } from "@shared/tipo-negocio";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { PvPivotRow } from "@/components/pv/PvMtoPivotTable";

type Props = {
  row: PvPivotRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CadastrarItemCarteiraDialog({ row, open, onOpenChange }: Props) {
  const utils = trpc.useUtils();
  const [descricao, setDescricao] = useState("");
  const [marca, setMarca] = useState("");
  const [tipo, setTipo] = useState("");
  const [preco, setPreco] = useState("");
  const [referencia, setReferencia] = useState<ProdutoOpcao | null>(null);
  const [tocouReferencia, setTocouReferencia] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const sugestao = trpc.cadastrosSistema.suggestSkuReferencias.useQuery(
    {
      codMaterial: row?.codItem ?? "",
      descricao: row?.descricao ?? undefined,
      marca: row?.marca ?? undefined,
    },
    { enabled: open && Boolean(row?.codItem) }
  );

  useEffect(() => {
    if (!open || !row) return;
    setDescricao(row.descricao ?? "");
    setMarca(row.marca ?? "");
    setTipo(normalizeTipoNegocioComercial(row.tipo) ?? "");
    setPreco(Number.isFinite(row.precoUnitario) ? row.precoUnitario.toFixed(4) : "");
    setReferencia(null);
    setTocouReferencia(false);
    setErro(null);
  }, [open, row]);

  useEffect(() => {
    const melhor = sugestao.data?.sugestoes[0];
    if (!open || tocouReferencia || !melhor || melhor.score < SKU_SIMILARITY_DEPARA_AUTO_PICK) return;
    setReferencia(melhor);
  }, [open, sugestao.data, tocouReferencia]);

  const salvar = trpc.cadastrosSistema.acceptPendingSkusWithDePara.useMutation({
    onSuccess: result => {
      if (result.erros.length) {
        setErro(result.erros.map(item => item.message).join(" "));
        return;
      }
      toast.success(
        `Item ${row?.codItem} cadastrado` + (result.deParaCriados ? " com De-Para" : "")
      );
      utils.carteiraPedidos.pivotGrade.invalidate();
      utils.carteiraPedidos.list.invalidate();
      utils.cadastrosSistema.pendingSkusFromFaturamento.invalidate();
      utils.produtos.list.invalidate();
      utils.deParaCodigos.list.invalidate();
      utils.deParaCodigos.listEnriched.invalidate();
      utils.deParaCodigos.diagnostico.invalidate();
      onOpenChange(false);
    },
    onError: error => setErro(error.message),
  });

  const confirmar = () => {
    if (!row) return;
    const precoNumero = Number(preco.replace(",", "."));
    const montado = itemAceiteCarteira({
      codItem: row.codItem,
      descricao,
      marca,
      tipoNegocio: tipo,
      precoUnitario: Number.isFinite(precoNumero) ? precoNumero : null,
      skuAntigo: referencia?.codigo ?? null,
    });
    if (montado.erro || !montado.item) {
      setErro(montado.erro);
      return;
    }
    setErro(null);
    salvar.mutate({ items: [montado.item] });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[95vw] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 px-4 pr-10 pt-4 text-left sm:px-6 sm:pt-6">
          <DialogTitle className="text-left leading-snug break-words">Cadastrar item da carteira</DialogTitle>
          <DialogDescription className="text-left break-words">
            Os dados da linha já vêm preenchidos. Escolha um SKU antigo se este código substitui um produto
            cadastrado, ou deixe Sem referência.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
          <div className="space-y-2">
            <Label>Código</Label>
            <Input value={row?.codItem ?? ""} readOnly className="font-mono" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="carteira-descricao">Descrição *</Label>
            <Input
              id="carteira-descricao"
              value={descricao}
              onChange={event => setDescricao(event.target.value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="carteira-marca">Marca</Label>
              <Input id="carteira-marca" value={marca} onChange={event => setMarca(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Tipo *</Label>
              <Select value={tipo || undefined} onValueChange={setTipo}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="PRG, JIT, ATD ou VAR" />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_NEGOCIO_VALIDOS.map(opcao => (
                    <SelectItem key={opcao} value={opcao}>
                      {opcao}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="carteira-preco">Preço unitário *</Label>
            <Input
              id="carteira-preco"
              inputMode="decimal"
              value={preco}
              onChange={event => setPreco(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Substitui o SKU (De-Para)</Label>
            <ProdutoCombobox
              permitirSemReferencia
              value={referencia}
              sugestoes={sugestao.data?.sugestoes ?? []}
              excluir={row ? [row.codItem] : []}
              onChange={item => {
                setTocouReferencia(true);
                setReferencia(item);
              }}
              placeholder="Buscar SKU antigo"
            />
            {sugestao.isFetching ? (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Buscando sugestão…
              </p>
            ) : null}
          </div>
          {erro ? (
            <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive">
              {erro}
            </p>
          ) : null}
        </div>
        <DialogFooter className="shrink-0 border-t bg-background px-4 py-3 sm:px-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" disabled={salvar.isPending || !row} onClick={confirmar}>
            {salvar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Cadastrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
