import { normalizeMarcaNome } from "@/hooks/useAccessControl";
import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";
import { useMemo } from "react";
import { PvMtoPivotTable, type PvPivotRow } from "@/components/pv/PvMtoPivotTable";

type Props = {
  cicloId: number;
  searchGlobal: string;
  marcasPermitidas?: string[] | null;
};

export function PvMtoPivotGrade({ cicloId, searchGlobal, marcasPermitidas }: Props) {
  const { data, isLoading } = trpc.cicloComercial.pvMtoGrade.useQuery(
    { cicloId },
    { enabled: cicloId > 0 }
  );

  const rows: PvPivotRow[] = useMemo(() => {
    let list = data?.rows ?? [];
    if (marcasPermitidas?.length) {
      list = list.filter(r => marcasPermitidas.includes(normalizeMarcaNome(r.marca)));
    }
    return list.map(r => ({
      marca: r.marca,
      codItem: r.codItem,
      descricao: r.descricao,
      tipo: r.tipo,
      precoUnitario: r.precoUnitario,
      precoOrigem: r.precoOrigem,
      numPedido: r.numPedido,
      meses: r.meses,
      quantidadeTotal: r.quantidadeTotal,
      receitaTotal: r.receitaTotal,
    }));
  }, [data?.rows, marcasPermitidas]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <PvMtoPivotTable
      horizonLabels={data?.horizonLabels ?? []}
      rows={rows}
      searchGlobal={searchGlobal}
      exportFileName={`pv-mto-ciclo-${cicloId}`}
      emptyMessage='Nenhum PV MTO no horizonte — sincronize a carteira ERP ou use "Atualizar da Carteira"'
    />
  );
}