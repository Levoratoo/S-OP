import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { FATOR_MESES_LABEL, validateFatoresPercentuais } from "@shared/sku-fator-sazonalidade";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Props = {
  produtoId: number | null;
  enabled: boolean;
};

export function ProdutoFatoresSazonaisSection({ produtoId, enabled }: Props) {
  const utils = trpc.useUtils();
  const [fatores, setFatores] = useState<string[]>(Array(12).fill(""));
  const { data, isLoading } = trpc.produtos.getSazonalidadeFatores.useQuery(
    { produtoId: produtoId ?? 0 },
    { enabled: enabled && Boolean(produtoId) }
  );

  useEffect(() => {
    if (!data?.fatores) {
      setFatores(Array(12).fill(""));
      return;
    }
    setFatores(data.fatores.map(n => String(n)));
  }, [data]);

  const numeric = useMemo(
    () => fatores.map(v => Number(String(v).replace(",", "."))).map(n => (Number.isFinite(n) ? n : 0)),
    [fatores]
  );
  const validation = useMemo(() => validateFatoresPercentuais(numeric), [numeric]);

  const saveMutation = trpc.produtos.setSazonalidadeFatores.useMutation({
    onSuccess: () => {
      toast.success("Fatores % salvos.");
      utils.produtos.idsComFatorSazonal.invalidate();
      if (produtoId) utils.produtos.getSazonalidadeFatores.invalidate({ produtoId });
    },
    onError: e => toast.error(e.message),
  });

  const clearMutation = trpc.produtos.clearSazonalidadeFatores.useMutation({
    onSuccess: () => {
      setFatores(Array(12).fill(""));
      toast.success("Fatores removidos.");
      utils.produtos.idsComFatorSazonal.invalidate();
      if (produtoId) utils.produtos.getSazonalidadeFatores.invalidate({ produtoId });
    },
    onError: e => toast.error(e.message),
  });

  if (!produtoId) {
    return (
      <p className="text-sm text-muted-foreground">
        Salve o produto primeiro para cadastrar os fatores % jan-dez.
      </p>
    );
  }

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <Label className="text-base">Fatores sazonais (% do ano)</Label>
          <p className="text-xs text-muted-foreground">
            Jan a Dez — soma deve ser 100% (±0,5 pp). Usado na redistribuição MTS do ciclo comercial.
          </p>
        </div>
        {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
      </div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {FATOR_MESES_LABEL.map((label, i) => (
          <div key={label} className="space-y-1">
            <Label className="text-xs">{label}</Label>
            <Input
              className="h-8 text-right"
              value={fatores[i]}
              onChange={e => {
                const next = [...fatores];
                next[i] = e.target.value;
                setFatores(next);
              }}
            />
          </div>
        ))}
      </div>
      <p
        className={`text-sm ${validation.ok ? "text-emerald-700" : "text-amber-700"}`}
      >
        Soma: {validation.soma.toFixed(2)}%
        {!validation.ok && validation.message ? ` — ${validation.message}` : ""}
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          disabled={!validation.ok || saveMutation.isPending}
          onClick={() =>
            saveMutation.mutate({ produtoId, fatores: numeric })
          }
        >
          {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar fatores
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={clearMutation.isPending}
          onClick={() => clearMutation.mutate({ produtoId })}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Remover
        </Button>
      </div>
    </div>
  );
}
