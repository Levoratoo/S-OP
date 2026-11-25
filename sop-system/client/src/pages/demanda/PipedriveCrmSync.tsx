import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { exportToCsv } from "@/lib/exportCsv";
import { trpc } from "@/lib/trpc";
import {
  cicloAceitaSyncPipedrive,
  gravidadeAlerta,
  mensagemSyncPipedriveRecusada,
  ORDEM_ALERTAS,
  ROTULOS_ALERTA,
  type TipoAlertaPipedrive,
} from "@shared/pipedrive-crm";
import { formatPreco4 } from "@shared/pv-preco-round";
import { Download, Loader2, RefreshCw, Undo2 } from "lucide-react";
import { toast } from "sonner";

type Previa = {
  previewHash: string;
  totais: {
    negocios: number;
    negociosSemProduto: number;
    linhasProduto: number;
    parcelas: number;
    parcelasFora: number;
    quantidade: number;
    valor: number;
    produtosDesabilitados: number;
    skusNovos: string[];
  };
  meses: Array<{
    indice: number;
    rotulo: string;
    linhas: number;
    antesQtd: number;
    depoisQtd: number;
    antesValor: number;
    depoisValor: number;
  }>;
  marcas: Array<{
    marca: string;
    antesQtd: number;
    depoisQtd: number;
    antesValor: number;
    depoisValor: number;
  }>;
  alertas: Array<{
    tipo: TipoAlertaPipedrive;
    dealId: number;
    titulo: string;
    sku: string;
    detalhe: string;
  }>;
  contagens: Record<TipoAlertaPipedrive, number>;
};

function formatQtd(value: number) {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function formatRs(value: number) {
  return `R$ ${formatPreco4(value)}`;
}

function formatQuando(iso: string) {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return iso;
  return data.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function PipedriveCrmSync({
  cicloId,
  status,
  children,
}: {
  cicloId: number;
  status: string;
  children?: ReactNode;
}) {
  const utils = trpc.useUtils();
  const [aberto, setAberto] = useState(false);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [abaAlerta, setAbaAlerta] = useState<TipoAlertaPipedrive>("sem_codigo");
  const aceitaSync = cicloAceitaSyncPipedrive(status);
  const { data: statusPd, isLoading: carregandoStatus } = trpc.cicloComercial.pipedriveStatus.useQuery(
    { cicloId },
    { enabled: Boolean(cicloId) }
  );
  const tokenConfigurado = statusPd?.tokenConfigurado === true;
  const motivoDesabilitado = !aceitaSync
    ? mensagemSyncPipedriveRecusada(status)
    : !tokenConfigurado
      ? "Configure PIPEDRIVE_API_TOKEN no servidor para habilitar a sincronização."
      : "";
  const desabilitado = !aceitaSync || !tokenConfigurado || carregandoStatus;

  const preview = trpc.cicloComercial.previewPipedrive.useMutation({
    onSuccess: data => {
      setPrevia(data);
      const primeira = ORDEM_ALERTAS.find(tipo => data.contagens[tipo] > 0) ?? "sem_codigo";
      setAbaAlerta(primeira);
      setAberto(true);
    },
    onError: error => toast.error(error.message),
  });
  const sync = trpc.cicloComercial.syncPipedrive.useMutation({
    onSuccess: resultado => {
      toast.success(
        `Pipedrive sincronizado: ${resultado.itensCriados} itens, ${formatQtd(resultado.quantidade)} un., ${formatRs(resultado.valor)}.`
      );
      if (resultado.skusCriados.length) {
        toast.message(
          `${resultado.skusCriados.length} SKU(s) cadastrados automaticamente: ${resultado.skusCriados.slice(0, 6).join(", ")}`
        );
      }
      setAberto(false);
      void utils.cicloComercial.itens.invalidate();
      void utils.cicloComercial.consolidado.invalidate();
      void utils.cicloComercial.pipedriveStatus.invalidate();
      void utils.cicloComercial.pvVsCrm.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const desfazer = trpc.cicloComercial.undoLastPipedriveSync.useMutation({
    onSuccess: resultado => {
      toast.success(`Carga CRM anterior restaurada (${resultado.itensRestaurados} itens).`);
      void utils.cicloComercial.itens.invalidate();
      void utils.cicloComercial.consolidado.invalidate();
      void utils.cicloComercial.pipedriveStatus.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const ultima = statusPd?.ultima && !statusPd.ultima.desfeitoEm ? statusPd.ultima : null;
  const desfeita = statusPd?.ultima?.desfeitoEm ? statusPd.ultima : null;

  const exportarAlertas = () => {
    if (!previa?.alertas.length) {
      toast.message("Não há alertas para exportar.");
      return;
    }
    exportToCsv(
      previa.alertas.map(item => ({
        tipo: ROTULOS_ALERTA[item.tipo],
        dealId: item.dealId,
        titulo: item.titulo,
        sku: item.sku,
        detalhe: item.detalhe,
      })),
      `alertas-pipedrive-ciclo-${cicloId}`,
      [
        { key: "tipo", title: "Alerta" },
        { key: "dealId", title: "Negócio" },
        { key: "titulo", title: "Título" },
        { key: "sku", title: "SKU" },
        { key: "detalhe", title: "Detalhe" },
      ]
    );
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-2 sm:items-end">
      <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex w-full sm:w-auto">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full sm:w-auto"
                disabled={desabilitado || preview.isPending}
                title={motivoDesabilitado || "Busca os negócios abertos com etiqueta Ciclo e mostra a prévia"}
                onClick={() => preview.mutate({ cicloId })}
              >
                {preview.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Sincronizar do Pipedrive
              </Button>
            </span>
          </TooltipTrigger>
          {motivoDesabilitado ? <TooltipContent>{motivoDesabilitado}</TooltipContent> : null}
        </Tooltip>
        {ultima && aceitaSync ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="w-full sm:w-auto"
            disabled={desfazer.isPending}
            onClick={() => desfazer.mutate({ cicloId })}
          >
            {desfazer.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Undo2 className="mr-2 h-4 w-4" />
            )}
            Desfazer última sincronização
          </Button>
        ) : null}
        {children}
      </div>
      {motivoDesabilitado ? (
        <p className="max-w-sm text-xs text-muted-foreground sm:text-right">{motivoDesabilitado}</p>
      ) : null}
      {ultima ? (
        <p className="max-w-sm text-xs text-muted-foreground sm:text-right">
          Última sincronização em {formatQuando(ultima.createdAt)}
          {ultima.usuario ? ` por ${ultima.usuario}` : ""} — {formatQtd(ultima.quantidade)} un.,{" "}
          {formatRs(ultima.valor)}, {ultima.alertasQtd} alerta(s).
        </p>
      ) : desfeita ? (
        <p className="max-w-sm text-xs text-muted-foreground sm:text-right">
          A última sincronização foi desfeita em {formatQuando(desfeita.desfeitoEm ?? desfeita.createdAt)}.
        </p>
      ) : null}

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[90vh] w-[95vw] max-w-6xl overflow-y-auto sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle>Prévia do Pipedrive</DialogTitle>
            <DialogDescription>
              Confirmar apaga toda a carga CRM deste ciclo (origem CRM) e grava de novo a partir do
              Pipedrive. MTS, JITO e PV MTO não são alterados. Linhas sem código e parcelas fora do
              horizonte não entram.
            </DialogDescription>
          </DialogHeader>
          {previa ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <CardResumo titulo="Negócios" valor={formatQtd(previa.totais.negocios)} />
                <CardResumo titulo="Linhas de produto" valor={formatQtd(previa.totais.linhasProduto)} />
                <CardResumo titulo="Quantidade no horizonte" valor={formatQtd(previa.totais.quantidade)} />
                <CardResumo titulo="Valor no horizonte" valor={formatRs(previa.totais.valor)} />
              </div>
              <p className="text-xs text-muted-foreground">
                {formatQtd(previa.totais.parcelas)} parcela(s) dentro do horizonte e{" "}
                {formatQtd(previa.totais.parcelasFora)} fora.
                {previa.totais.negociosSemProduto > 0
                  ? ` ${previa.totais.negociosSemProduto} negócio(s) com etiqueta Ciclo sem produto.`
                  : ""}
                {previa.totais.produtosDesabilitados > 0
                  ? ` ${previa.totais.produtosDesabilitados} produto(s) desabilitado(s) ignorado(s).`
                  : ""}
                {previa.totais.skusNovos.length
                  ? ` ${previa.totais.skusNovos.length} SKU(s) serão cadastrados ao confirmar.`
                  : ""}
              </p>

              <div className="max-h-64 max-w-full overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mês</TableHead>
                      <TableHead className="text-right">Antes qtd</TableHead>
                      <TableHead className="text-right">Depois qtd</TableHead>
                      <TableHead className="text-right">Antes R$</TableHead>
                      <TableHead className="text-right">Depois R$</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previa.meses.map(mes => (
                      <TableRow key={mes.indice}>
                        <TableCell className="whitespace-nowrap">{mes.rotulo}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatQtd(mes.antesQtd)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatQtd(mes.depoisQtd)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatRs(mes.antesValor)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatRs(mes.depoisValor)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground">
                Antes: quantidade e valor (qtd × preço) já gravados na carga CRM. Depois: parcelas do
                Pipedrive que entram no horizonte, somadas por mês e, abaixo, por marca.
              </p>
              {previa.marcas.length ? (
                <div className="max-h-48 max-w-full overflow-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Marca</TableHead>
                        <TableHead className="text-right">Antes qtd</TableHead>
                        <TableHead className="text-right">Depois qtd</TableHead>
                        <TableHead className="text-right">Antes R$</TableHead>
                        <TableHead className="text-right">Depois R$</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previa.marcas.map(marca => (
                        <TableRow key={marca.marca}>
                          <TableCell>{marca.marca}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatQtd(marca.antesQtd)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatQtd(marca.depoisQtd)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatRs(marca.antesValor)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatRs(marca.depoisValor)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : null}

              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Alertas</p>
                <Button type="button" size="sm" variant="outline" onClick={exportarAlertas}>
                  <Download className="mr-2 h-4 w-4" />
                  Exportar CSV
                </Button>
              </div>
              <Tabs value={abaAlerta} onValueChange={valor => setAbaAlerta(valor as TipoAlertaPipedrive)}>
                <div className="max-w-full overflow-x-auto">
                  <TabsList className="inline-flex h-auto w-max min-w-full flex-nowrap">
                    {ORDEM_ALERTAS.map(tipo => {
                      const grave = gravidadeAlerta(tipo) === "vermelho";
                      return (
                        <TabsTrigger key={tipo} value={tipo} className="gap-1 text-xs">
                          {ROTULOS_ALERTA[tipo]}
                          <Badge
                            variant="outline"
                            className={
                              grave
                                ? "border-red-200 bg-red-100 text-red-800"
                                : "border-amber-200 bg-amber-100 text-amber-900"
                            }
                          >
                            {previa.contagens[tipo]}
                          </Badge>
                        </TabsTrigger>
                      );
                    })}
                  </TabsList>
                </div>
                {ORDEM_ALERTAS.map(tipo => {
                  const alertasDaAba = previa?.alertas.filter(item => item.tipo === tipo) ?? [];
                  return (
                  <TabsContent key={tipo} value={tipo} className="mt-3">
                    {alertasDaAba.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhum alerta deste tipo.</p>
                    ) : (
                      <div className="max-h-64 space-y-2 overflow-y-auto">
                        {alertasDaAba.map((item, index) => (
                          <div key={`${item.dealId}-${item.sku}-${index}`} className="break-words rounded-md border p-2 text-sm">
                            <p className="font-medium">
                              #{item.dealId} {item.titulo}
                              {item.sku ? ` · ${item.sku}` : ""}
                            </p>
                            <p className="text-muted-foreground">{item.detalhe}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                  );
                })}
              </Tabs>
            </div>
          ) : null}
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              className="w-full sm:w-auto"
              disabled={!previa || previa.totais.parcelas === 0 || sync.isPending}
              onClick={() => {
                if (!previa) return;
                sync.mutate({ cicloId, previewHash: previa.previewHash });
              }}
            >
              {sync.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirmar e substituir carga CRM
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CardResumo({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className="text-base font-semibold tabular-nums sm:text-lg">{valor}</p>
    </div>
  );
}
