import { Fragment, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  chaveMes,
  colunasGradeMts,
  faixaPvVsRe,
  mesesFuturosGrade,
  mesesPassadosGrade,
  periodoAnoContraAno,
  pvVsRe,
  rotuloMesCurto,
  skuEhExcecao,
  type MesExcecao,
  somaPeriodo,
  variacaoAno,
} from "@shared/grade-colab";

const MES_KEYS = ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9", "m10", "m11", "m12"] as const;
const EST_KEYS = ["e1", "e2", "e3", "e4", "e5", "e6", "e7", "e8", "e9", "e10", "e11", "e12"] as const;

const SKU =
  "sticky left-0 z-30 w-[7.5rem] min-w-[7.5rem] max-w-[7.5rem] align-top shadow-[2px_0_0_0_hsl(var(--border))]";
const DESC =
  "sticky left-[7.5rem] z-30 w-[10rem] min-w-[10rem] max-w-[10rem] whitespace-normal break-words align-top sm:w-[20rem] sm:min-w-[20rem] sm:max-w-[20rem] sm:left-[7.5rem] shadow-[2px_0_0_0_hsl(var(--border))]";
const YOY =
  "sticky left-[17.5rem] z-30 w-[7rem] min-w-[7rem] align-top text-right sm:left-[27.5rem] shadow-[2px_0_0_0_hsl(var(--border))]";

const AJUDA_EXCECAO =
  "Exceção se, em algum mês passado, |realizado ÷ previsto − 1| passar da faixa. Previsto é a foto congelada; sem foto, usa a previsão estatística do mesmo mês. Previsto 0 com realizado maior que 0 é exceção. Os dois em 0 não são.";

type Item = {
  id: number;
  sku: string;
  descricao?: string | null;
  estatUsouFatorSku?: boolean;
} & Record<string, unknown>;

type Realizado = Record<string, Record<number, number[]>>;
type Previsto = Record<string, Record<string, number>>;

function formatNum(value: number) {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function qtdAno(realizado: Realizado | undefined, sku: string, ano: number, mes: number) {
  return Number(realizado?.[sku]?.[ano]?.[mes - 1] || 0);
}

function CelulaYoy({
  atual,
  anterior,
  rotuloAtual,
  rotuloAnterior,
}: {
  atual: number;
  anterior: number;
  rotuloAtual: string;
  rotuloAnterior: string;
}) {
  const variacao = variacaoAno(atual, anterior);
  const title = `${rotuloAtual}: ${formatNum(atual)} · ${rotuloAnterior}: ${formatNum(anterior)}`;
  if (variacao.tipo === "vazio") return <span title={title}>—</span>;
  if (variacao.tipo === "novo") return <span title={title} className="font-medium text-emerald-700">Novo</span>;
  const sobe = variacao.pct >= 0;
  const texto = `${sobe ? "▲ +" : "▼ "}${variacao.pct.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  return (
    <span title={title} className={sobe ? "font-medium text-emerald-700" : "font-medium text-red-700"}>
      {texto}
    </span>
  );
}

export function GradeMts({
  itens,
  anoInicio,
  mesInicio,
  realizado,
  previsto,
  mesesSemFoto,
  descricaoDe,
  somenteLeitura,
  revisarExcecoes,
  onEdit,
}: {
  itens: Item[];
  anoInicio: number;
  mesInicio: number;
  realizado?: Realizado;
  previsto?: Previsto;
  mesesSemFoto: string[];
  descricaoDe: (item: Item) => string;
  somenteLeitura: boolean;
  revisarExcecoes?: boolean;
  onEdit: (itemId: number, key: (typeof MES_KEYS)[number], raw: string) => void;
}) {
  const periodo = periodoAnoContraAno(anoInicio, mesInicio);
  const passados = mesesPassadosGrade(anoInicio, mesInicio);
  const futuros = mesesFuturosGrade(anoInicio, mesInicio);
  const semFoto = new Set(mesesSemFoto);
  const colSpan = colunasGradeMts(anoInicio, mesInicio).length;
  const [faixa, setFaixa] = useState(30);
  const [soExcecoes, setSoExcecoes] = useState(false);
  const faixaAplicada = Math.min(200, Math.max(1, Number.isFinite(faixa) ? faixa : 30));

  const mesesDoItem = (item: Item, sku: string): MesExcecao[] =>
    passados.map(mes => {
      const chave = chaveMes(mes.ano, mes.mes);
      const sem = semFoto.has(chave);
      const indiceFuturo = futuros.findIndex(futuro => futuro.ano === mes.ano && futuro.mes === mes.mes);
      const estatistica = indiceFuturo >= 0 ? Number(item[EST_KEYS[indiceFuturo]] || 0) : null;
      return {
        realizado: qtdAno(realizado, sku, mes.ano, mes.mes),
        previstoCongelado: sem ? null : Number(previsto?.[sku]?.[chave] || 0),
        estatistica,
      };
    });

  const excecoes = useMemo(() => {
    const ids = new Set<number>();
    for (const item of itens) {
      const sku = String(item.sku || "").trim().toUpperCase();
      if (skuEhExcecao(mesesDoItem(item, sku), faixaAplicada)) ids.add(item.id);
    }
    return ids;
  }, [itens, faixaAplicada, passados, futuros, realizado, previsto, semFoto]);

  const visiveis = soExcecoes ? itens.filter(item => excecoes.has(item.id)) : itens;

  return (
    <div className="space-y-3">
      {revisarExcecoes ? (
        <div className="flex max-w-full flex-wrap items-end gap-2">
          <Button
            type="button"
            variant={soExcecoes ? "default" : "outline"}
            className="h-auto whitespace-normal"
            onClick={() => setSoExcecoes(atual => !atual)}
          >
            Revisar só exceções ({excecoes.size})
          </Button>
          <label className="flex items-center gap-2 text-sm">
            Faixa
            <Input
              type="number"
              min={1}
              max={200}
              value={faixa}
              onChange={event => setFaixa(Number(event.target.value))}
              className="h-9 w-20"
              aria-label="Faixa de exceção em porcentagem"
            />
            %
          </label>
          {[20, 30, 50].map(atalho => (
            <Button key={atalho} type="button" size="sm" variant={faixa === atalho ? "secondary" : "outline"} onClick={() => setFaixa(atalho)}>
              {atalho}
            </Button>
          ))}
          <span title={AJUDA_EXCECAO} className="inline-flex h-9 w-9 items-center justify-center text-muted-foreground">
            <Info className="h-4 w-4" />
            <span className="sr-only">{AJUDA_EXCECAO}</span>
          </span>
        </div>
      ) : null}
    <div className="max-h-[70vh] max-w-full overflow-auto rounded-md border">
      <Table>
        <TableHeader className="sticky top-0 z-40 bg-background shadow-sm">
          <TableRow>
            <TableHead rowSpan={2} className={cn(SKU, "bg-background")}>SKU</TableHead>
            <TableHead rowSpan={2} className={cn(DESC, "bg-background")}>Descrição</TableHead>
            <TableHead rowSpan={2} className={cn(YOY, "bg-background")} title="% do realizado de janeiro até o mês do ciclo, contra os mesmos meses do ano anterior">
              % Ano vs Ano ant.
            </TableHead>
            {passados.map(mes => (
              <TableHead key={`g-${chaveMes(mes.ano, mes.mes)}`} colSpan={3} className="border-l text-center text-xs">
                {rotuloMesCurto(mes.ano, mes.mes)}
              </TableHead>
            ))}
            {futuros.map((mes, index) => (
              <TableHead
                key={`gf-${chaveMes(mes.ano, mes.mes)}`}
                colSpan={3}
                className={`border-l text-center text-xs ${index % 2 === 0 ? "bg-sky-50" : "bg-amber-50"}`}
              >
                {rotuloMesCurto(mes.ano, mes.mes)}
              </TableHead>
            ))}
            <TableHead rowSpan={2} className="text-right">Total</TableHead>
          </TableRow>
          <TableRow>
            {passados.map(mes => (
              <Fragment key={`s-${chaveMes(mes.ano, mes.mes)}`}>
                <TableHead className="border-l text-right text-[11px]">Realizado</TableHead>
                <TableHead className="text-right text-[11px]">Previsto</TableHead>
                <TableHead className="text-right text-[11px]">PV vs RE %</TableHead>
              </Fragment>
            ))}
            {futuros.map((mes, index) => {
              const tom = index % 2 === 0 ? "bg-sky-50/80" : "bg-amber-50/80";
              const anterior = { ano: mes.ano - 1, mes: mes.mes };
              return (
                <Fragment key={`sf-${chaveMes(mes.ano, mes.mes)}`}>
                  <TableHead className={`border-l text-right text-[11px] ${tom}`}>{rotuloMesCurto(anterior.ano, anterior.mes)}</TableHead>
                  <TableHead className={`text-right text-[11px] ${tom}`}>{rotuloMesCurto(mes.ano, mes.mes)} prev</TableHead>
                  <TableHead className={`text-right text-[11px] ${tom}`}>{rotuloMesCurto(mes.ano, mes.mes)} colab</TableHead>
                </Fragment>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {itens.length === 0 ? (
            <TableRow>
              <TableCell colSpan={colSpan} className="text-center text-muted-foreground">
                Sem itens neste plano.
              </TableCell>
            </TableRow>
          ) : (
            visiveis.map(item => {
              const sku = String(item.sku || "").trim().toUpperCase();
              const destaque = excecoes.has(item.id);
              const fundo = destaque ? "bg-amber-50" : "bg-background";
              const atual = somaPeriodo(realizado?.[sku]?.[periodo.anoAtual], periodo.mesFim);
              const anterior = somaPeriodo(realizado?.[sku]?.[periodo.anoAnterior], periodo.mesFim);
              let total = 0;
              return (
                <TableRow key={item.id} className="text-sm">
                  <TableCell className={cn(SKU, fundo, "font-medium")}>
                    <span className="inline-flex flex-wrap items-center gap-1">
                      {item.sku}
                      {item.estatUsouFatorSku ? (
                        <Badge variant="outline" className="px-1 py-0 text-[10px]">Fator %</Badge>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell className={cn(DESC, fundo)}>{descricaoDe(item)}</TableCell>
                  <TableCell className={cn(YOY, fundo)}>
                    <CelulaYoy
                      atual={atual}
                      anterior={anterior}
                      rotuloAtual={periodo.rotuloAtual}
                      rotuloAnterior={periodo.rotuloAnterior}
                    />
                  </TableCell>
                  {passados.map(mes => {
                    const chave = chaveMes(mes.ano, mes.mes);
                    const real = qtdAno(realizado, sku, mes.ano, mes.mes);
                    const sem = semFoto.has(chave);
                    const prev = sem ? null : Number(previsto?.[sku]?.[chave] || 0);
                    const aderencia = pvVsRe(real, prev);
                    const faixa = faixaPvVsRe(aderencia);
                    const cor =
                      faixa === "verde"
                        ? "text-emerald-700"
                        : faixa === "amarelo"
                          ? "text-amber-700"
                          : faixa === "vermelho"
                            ? "text-red-700"
                            : "text-muted-foreground";
                    return (
                      <Fragment key={chave}>
                        <TableCell className="border-l p-1 text-right tabular-nums">{real ? formatNum(real) : "·"}</TableCell>
                        <TableCell
                          className="p-1 text-right tabular-nums"
                          title={sem ? "Sem ciclo congelado para este mês" : prev === 0 ? "Previsto zero na foto" : undefined}
                        >
                          {sem ? "—" : formatNum(prev ?? 0)}
                        </TableCell>
                        <TableCell className={`p-1 text-right tabular-nums ${cor}`} title="Realizado ÷ previsto × 100">
                          {aderencia == null ? "—" : `${aderencia.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`}
                        </TableCell>
                      </Fragment>
                    );
                  })}
                  {futuros.map((mes, index) => {
                    const tom = index % 2 === 0 ? "bg-sky-50/40" : "bg-amber-50/50";
                    const aa = qtdAno(realizado, sku, mes.ano - 1, mes.mes);
                    const est = Number(item[EST_KEYS[index]] || 0);
                    const raw = item[MES_KEYS[index]];
                    const empty = raw === null || raw === undefined || String(raw).trim() === "";
                    total += empty ? est : Number(raw || 0);
                    return (
                      <Fragment key={chaveMes(mes.ano, mes.mes)}>
                        <TableCell className={`border-l p-1 text-right tabular-nums text-muted-foreground ${tom}`}>
                          {aa ? formatNum(aa) : "·"}
                        </TableCell>
                        <TableCell className={`p-1 text-right tabular-nums ${tom}`}>{formatNum(est)}</TableCell>
                        <TableCell className={`p-0.5 ${tom}`}>
                          <Input
                            className="h-8 w-[4.5rem] px-1 text-right"
                            placeholder="—"
                            defaultValue={empty ? "" : String(Math.round(Number(raw || 0)))}
                            disabled={somenteLeitura}
                            onBlur={event => onEdit(item.id, MES_KEYS[index]!, event.target.value)}
                          />
                        </TableCell>
                      </Fragment>
                    );
                  })}
                  <TableCell className="text-right font-medium tabular-nums">{formatNum(total)}</TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
    </div>
  );
}
