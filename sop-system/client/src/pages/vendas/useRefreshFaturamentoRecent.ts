import { useEffect, useRef } from "react";
import { formatCalendarDate } from "@shared/calendar-date";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

function toastPostSyncAlerts(postSync: {
  clientesError?: string;
  marcasAutoError?: string;
  gestorMarcaError?: string;
  clientes?: { clientes?: { created?: number } };
}) {
  if (postSync.clientesError) {
    toast.error(`Sync clientes: ${postSync.clientesError}`);
  } else {
    const created = postSync.clientes?.clientes?.created;
    if (created && created > 0) {
      toast.message(`+${created} cliente(s) do faturamento`);
    }
  }
  if (postSync.marcasAutoError) toast.error(`Marcas×gestor: ${postSync.marcasAutoError}`);
  if (postSync.gestorMarcaError) toast.error(`Mapa gestor×marca: ${postSync.gestorMarcaError}`);
}

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
        void utils.clientes.list.invalidate();
      }
      if (result.postSync) toastPostSyncAlerts(result.postSync);
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

export { toastPostSyncAlerts };
