import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  CICLO_STATUS_LABEL,
  CICLO_STATUS_ORDER,
  isCicloSomenteLeitura,
  nextCicloStatus,
  prevCicloStatus,
  type CicloStatus,
} from "@shared/ciclo-status";
import { trpc } from "@/lib/trpc";
import { Lock } from "lucide-react";
import { toast } from "sonner";

type Props = { cicloId: number; status: string };

export function CicloLifecycleBar({ cicloId, status }: Props) {
  const utils = trpc.useUtils();
  const { data: historico } = trpc.cicloComercial.historicoStatus.useQuery({ cicloId });
  const { data: snap } = trpc.cicloComercial.snapshot.useQuery({ cicloId });
  const [comentario, setComentario] = useState("");
  const [open, setOpen] = useState<"avancar" | "voltar" | null>(null);
  const atual = (CICLO_STATUS_ORDER as readonly string[]).includes(status) ? (status as CicloStatus) : "ABERTO";
  const proximo = nextCicloStatus(atual);
  const anterior = prevCicloStatus(atual);
  const travado = isCicloSomenteLeitura(atual);

  const mut = trpc.cicloComercial.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Status do ciclo atualizado");
      setOpen(null);
      setComentario("");
      utils.cicloComercial.list.invalidate();
      utils.cicloComercial.getById.invalidate({ id: cicloId });
      utils.cicloComercial.historicoStatus.invalidate({ cicloId });
    },
    onError: e => toast.error(e.message),
  });

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2">
        {travado ? <Lock className="h-4 w-4" /> : null}
        <Badge>{CICLO_STATUS_LABEL[atual]}</Badge>
        <div className="flex flex-wrap gap-1 text-[11px] text-muted-foreground">
          {CICLO_STATUS_ORDER.map(s => (
            <span key={s} className={s === atual ? "font-semibold text-foreground" : ""}>
              {CICLO_STATUS_LABEL[s]}
              {s !== "CONGELADO" ? " → " : ""}
            </span>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {proximo && !travado ? (
          <Button size="sm" onClick={() => setOpen("avancar")}>
            Avançar para {CICLO_STATUS_LABEL[proximo]}
          </Button>
        ) : null}
        {atual === "APROVADO" ? (
          <Button size="sm" variant="secondary" onClick={() => setOpen("avancar")}>
            Congelar
          </Button>
        ) : null}
        {anterior && !travado ? (
          <Button size="sm" variant="outline" onClick={() => setOpen("voltar")}>
            Reabrir um passo
          </Button>
        ) : null}
      </div>
      {open ? (
        <div className="space-y-2">
          <Textarea
            value={comentario}
            onChange={e => setComentario(e.target.value)}
            placeholder={open === "voltar" ? "Motivo obrigatório" : "Comentário (opcional). Aprovar gera foto imutável."}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={mut.isPending || (open === "voltar" && !comentario.trim())}
              onClick={() => {
                const next = open === "voltar" ? anterior : atual === "APROVADO" ? "CONGELADO" : proximo;
                if (!next) return;
                mut.mutate({ id: cicloId, status: next, comentario });
              }}
            >
              Confirmar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}
      {snap?.retroativo ? (
        <p className="text-xs text-amber-700">
          Foto retroativa: De-Para e preços são os da data de geração, não os da época do ciclo.
          {snap.comentario ? ` ${snap.comentario}` : ""}
        </p>
      ) : null}
      {historico && historico.length > 0 ? (
        <ol className="max-h-28 space-y-1 overflow-auto text-xs text-muted-foreground">
          {historico.map(h => (
            <li key={h.id}>
              {h.statusDe && h.statusDe !== h.statusPara
                ? `${h.statusDe} → ${h.statusPara}`
                : "Registro"}
              {h.comentario ? ` · ${h.comentario}` : ""}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
