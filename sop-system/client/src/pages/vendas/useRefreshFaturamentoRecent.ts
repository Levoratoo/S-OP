import { useEffect, useRef } from "react";
import { formatCalendarDate } from "@shared/calendar-date";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

/** Ao abrir o sistema, descarta CFOP fora da lista e busca notas novas no ERP. */
export function useRefreshFaturamentoRecent(options?: { notifySuccess?: boolean }) {
  const notifySuccess = options?.notifySuccess !== false;
  const utils = trpc.useUtils();
  const started = useRef(false);
  const refresh = trpc.faturamento.refreshRecent.useMutation({
    onSuccess: result => {
      if (result.refreshed || result.removedCfop > 0) {
        void utils.faturamento.list.invalidate();
        void utils.faturamento.stats.invalidate();
        void utils.faturamento.porMes.invalidate();
        void utils.faturamento.mesFechadoCheck.invalidate();
      }
      if (!notifySuccess) return;
      if (result.inserted > 0 && result.maxDepois) {
        toast.success(`Faturamento atualizado até ${formatCalendarDate(result.maxDepois)}`);
      } else if (result.removedCfop > 0) {
        toast.success(
          `${result.removedCfop.toLocaleString("pt-BR")} linhas fora do CFOP foram removidas`
        );
      }
    },
    onError: error => {
      toast.error(`Não foi possível atualizar o faturamento: ${error.message}`);
    },
  });

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    refresh.mutate();
  }, [refresh]);

  return refresh;
}
