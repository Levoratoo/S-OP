import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { normalizeMarcaNome, useAccessControl } from "@/hooks/useAccessControl";
import { trpc } from "@/lib/trpc";
import { canonicalizeLinha, normalizeText } from "@shared/linha";
import { Loader2 } from "lucide-react";

const MESES = [
  { num: 1, nome: "Jan" },
  { num: 2, nome: "Fev" },
  { num: 3, nome: "Mar" },
  { num: 4, nome: "Abr" },
  { num: 5, nome: "Mai" },
  { num: 6, nome: "Jun" },
  { num: 7, nome: "Jul" },
  { num: 8, nome: "Ago" },
  { num: 9, nome: "Set" },
  { num: 10, nome: "Out" },
  { num: 11, nome: "Nov" },
  { num: 12, nome: "Dez" },
];

const MES_KEYS = ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9", "m10", "m11", "m12"] as const;

function norm(value: string | null | undefined) {
  return normalizeText(value);
}

function fmt(n: number) {
  return Math.round(n).toLocaleString("pt-BR");
}

function pct(n: number | null) {
  if (n === null || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(0)}%`;
}

export default function CapacidadeVsDemanda() {
  const { podeVerTodasMarcas, marcasPermitidasNomes, isGestor } = useAccessControl();
  const [cicloId, setCicloId] = useState<number | null>(null);
  const [ano, setAno] = useState(new Date().getFullYear());

  const { data: ciclos, isLoading: loadingCiclos } = trpc.cicloComercial.list.useQuery();
  const selectedCicloId = cicloId ?? ciclos?.[0]?.id ?? null;

  const { data: itens, isLoading: loadingItens } = trpc.cicloComercial.itens.useQuery(
    { cicloId: selectedCicloId ?? 0 },
    { enabled: Boolean(selectedCicloId) }
  );

  const { data: capacidade, isLoading: loadingCap } = trpc.capacidade.calcular.useQuery({ ano });
  const { data: produtos } = trpc.produtos.list.useQuery();
  const { data: fluxosComRecursos } = trpc.fluxos.listComRecursos.useQuery();

  const itensFiltrados = useMemo(() => {
    const list = itens ?? [];
    if (podeVerTodasMarcas) return list;
    return list.filter(item =>
      marcasPermitidasNomes.includes(normalizeMarcaNome(item.marca))
    );
  }, [itens, podeVerTodasMarcas, marcasPermitidasNomes]);

  const analise = useMemo(() => {
    if (!itensFiltrados || !capacidade) return null;

    const produtoBySku = new Map(
      (produtos ?? []).map(p => [norm(p.codItem || p.codigo), p] as const)
    );
    const fluxoById = new Map((fluxosComRecursos ?? []).map(f => [f.id, f] as const));
    const capByRecursoId = new Map(
      capacidade.recursos.map(r => [r.recursoId, r] as const)
    );

    const demandaPorMes: Record<number, number> = {};
    const capacidadePorMes: Record<number, number> = {};
    for (let m = 1; m <= 12; m++) {
      demandaPorMes[m] = 0;
      capacidadePorMes[m] = 0;
    }

    /** Capacidade alocada por chave de match (recurso ou linha). */
    const demandaPorChave = new Map<string, Record<number, number>>();
    const capPorChave = new Map<string, Record<number, number>>();
    const matchStats = { viaFluxo: 0, viaLinha: 0, semMatch: 0 };

    const ensureBucket = (map: Map<string, Record<number, number>>, key: string) => {
      if (!map.has(key)) {
        const z: Record<number, number> = {};
        for (let m = 1; m <= 12; m++) z[m] = 0;
        map.set(key, z);
      }
      return map.get(key)!;
    };

    for (const item of itensFiltrados) {
      const prod = produtoBySku.get(norm(item.sku));
      let matchKey: string | null = null;
      let matchLabel = "";
      let matchKind: "fluxo" | "linha" | "none" = "none";

      if (prod?.fluxoId) {
        const fluxo = fluxoById.get(prod.fluxoId);
        const recursoIds = (fluxo?.recursos ?? [])
          .map(r => r?.id)
          .filter((id): id is number => typeof id === "number");
        if (recursoIds.length > 0) {
          matchKind = "fluxo";
          matchKey = `fluxo:${prod.fluxoId}`;
          matchLabel = fluxo?.nome ? `Fluxo: ${fluxo.nome}` : `Fluxo #${prod.fluxoId}`;
          // Demanda do SKU vai para o fluxo; capacidade = soma dos recursos do fluxo
          const demBucket = ensureBucket(demandaPorChave, matchKey);
          MES_KEYS.forEach((k, idx) => {
            const q = Number(item[k] || 0) || 0;
            demBucket[idx + 1] += q;
            demandaPorMes[idx + 1] += q;
          });
          if (!capPorChave.has(matchKey)) {
            const capBucket = ensureBucket(capPorChave, matchKey);
            for (const rid of recursoIds) {
              const rec = capByRecursoId.get(rid);
              if (!rec) continue;
              for (let m = 1; m <= 12; m++) {
                capBucket[m] += rec.capacidadeMensal[m] ?? 0;
              }
            }
          }
          matchStats.viaFluxo += 1;
          continue;
        }
      }

      const linhaKey = canonicalizeLinha(item.linha) || "sem-linha";
      matchKind = "linha";
      matchKey = `linha:${linhaKey}`;
      matchLabel = linhaKey === "sem-linha" ? "Sem linha" : `Linha: ${linhaKey}`;
      const demBucket = ensureBucket(demandaPorChave, matchKey);
      MES_KEYS.forEach((k, idx) => {
        const q = Number(item[k] || 0) || 0;
        demBucket[idx + 1] += q;
        demandaPorMes[idx + 1] += q;
      });
      if (!capPorChave.has(matchKey)) {
        const capBucket = ensureBucket(capPorChave, matchKey);
        for (const rec of capacidade.recursos) {
          if (canonicalizeLinha(rec.linhaProduto) === linhaKey) {
            for (let m = 1; m <= 12; m++) {
              capBucket[m] += rec.capacidadeMensal[m] ?? 0;
            }
          }
        }
        matchStats.viaLinha += 1;
      } else {
        matchStats.viaLinha += 1;
      }
      void matchKind;
      void matchLabel;
    }

    // Capacidade total do ano (todos os recursos) para o card geral
    for (const rec of capacidade.recursos) {
      for (let m = 1; m <= 12; m++) {
        capacidadePorMes[m] += rec.capacidadeMensal[m] ?? 0;
      }
    }

    // Contar chaves sem capacidade no match
    Array.from(demandaPorChave.entries()).forEach(([key, dem]) => {
      const cap = capPorChave.get(key);
      const demTotal = Object.values(dem).reduce((a: number, b: number) => a + b, 0);
      const capTotal = cap
        ? Object.values(cap).reduce((a: number, b: number) => a + b, 0)
        : 0;
      if (demTotal > 0 && capTotal <= 0) matchStats.semMatch += 1;
    });

    const resumoMensal = MESES.map(({ num }) => {
      const demanda = demandaPorMes[num];
      const cap = capacidadePorMes[num];
      const gap = cap - demanda;
      const utilizacao = cap > 0 ? demanda / cap : demanda > 0 ? null : 0;
      const status =
        demanda <= 0 && cap <= 0
          ? "vazio"
          : demanda > cap
            ? "estouro"
            : utilizacao !== null && utilizacao >= 0.9
              ? "alerta"
              : "ok";
      return { mes: num, demanda, capacidade: cap, gap, utilizacao, status };
    });

    const chaves = Array.from(
      new Set([...Array.from(demandaPorChave.keys()), ...Array.from(capPorChave.keys())])
    ).sort();

    const porMatch = chaves.map(key => {
      const dem = demandaPorChave.get(key) || {};
      const cap = capPorChave.get(key) || {};
      let demandaTotal = 0;
      let capacidadeTotal = 0;
      let mesesEstourados = 0;
      const meses = MESES.map(({ num }) => {
        const demanda = dem[num] || 0;
        const capacidadeVal = cap[num] || 0;
        demandaTotal += demanda;
        capacidadeTotal += capacidadeVal;
        if (demanda > capacidadeVal && demanda > 0) mesesEstourados += 1;
        return {
          mes: num,
          demanda,
          capacidade: capacidadeVal,
          gap: capacidadeVal - demanda,
        };
      });
      const isFluxo = key.startsWith("fluxo:");
      const fluxoId = isFluxo ? Number(key.slice(6)) : null;
      const fluxo = fluxoId != null ? fluxoById.get(fluxoId) : null;
      const label = isFluxo
        ? fluxo?.nome
          ? `Fluxo: ${fluxo.nome}`
          : key
        : key.startsWith("linha:")
          ? key.slice(6) === "sem-linha"
            ? "Sem linha"
            : `Linha: ${key.slice(6)}`
          : key;
      return {
        key,
        label,
        tipo: isFluxo ? "fluxo" : "linha",
        meses,
        demandaTotal,
        capacidadeTotal,
        gapTotal: capacidadeTotal - demandaTotal,
        mesesEstourados,
      };
    });

    return {
      resumoMensal,
      porMatch,
      matchStats,
      totais: {
        demanda: Object.values(demandaPorMes).reduce((a, b) => a + b, 0),
        capacidade: Object.values(capacidadePorMes).reduce((a, b) => a + b, 0),
        mesesEstourados: resumoMensal.filter(m => m.status === "estouro").length,
      },
    };
  }, [itensFiltrados, capacidade, produtos, fluxosComRecursos]);

  const loading = loadingCiclos || loadingItens || loadingCap;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Capacidade × Demanda</h1>
        <p className="text-muted-foreground">
          Match preferencial: SKU → fluxo → recursos · fallback por linha de produto
          {isGestor ? " · filtrado pelas suas marcas" : ""}.
        </p>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="space-y-1">
          <Label>Ciclo comercial</Label>
          <Select
            value={selectedCicloId ? String(selectedCicloId) : undefined}
            onValueChange={v => setCicloId(Number(v))}
          >
            <SelectTrigger className="w-80">
              <SelectValue placeholder="Selecione o ciclo" />
            </SelectTrigger>
            <SelectContent>
              {(ciclos ?? []).map(c => (
                <SelectItem key={c.id} value={String(c.id)}>
                  #{c.id} — {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Ano capacidade</Label>
          <Select value={String(ano)} onValueChange={v => setAno(Number(v))}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[ano - 1, ano, ano + 1, ano + 2].map(y => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!selectedCicloId ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Crie/desagregue um ciclo em Colaboração Comercial para confrontar com a capacidade.
          </CardContent>
        </Card>
      ) : loading || !analise ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Demanda ciclo</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">
                {fmt(analise.totais.demanda)}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Capacidade {ano}</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">
                {fmt(analise.totais.capacidade)}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Meses em estouro</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">
                {analise.totais.mesesEstourados}
                <span className="ml-2 text-sm font-normal text-muted-foreground">/ 12</span>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Match</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm text-muted-foreground">
                <div className="flex justify-between">
                  <span>Via fluxo</span>
                  <span>{analise.matchStats.viaFluxo}</span>
                </div>
                <div className="flex justify-between">
                  <span>Via linha</span>
                  <span>{analise.matchStats.viaLinha}</span>
                </div>
                <div className="flex justify-between">
                  <span>Sem cap.</span>
                  <span>{analise.matchStats.semMatch}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Resumo mensal</CardTitle>
              <CardDescription>
                Gap = capacidade − demanda · Utilização = demanda / capacidade
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mês</TableHead>
                    <TableHead className="text-right">Demanda</TableHead>
                    <TableHead className="text-right">Capacidade</TableHead>
                    <TableHead className="text-right">Gap</TableHead>
                    <TableHead className="text-right">Utilização</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analise.resumoMensal.map(row => (
                    <TableRow key={row.mes}>
                      <TableCell>{MESES[row.mes - 1].nome}</TableCell>
                      <TableCell className="text-right">{fmt(row.demanda)}</TableCell>
                      <TableCell className="text-right">{fmt(row.capacidade)}</TableCell>
                      <TableCell
                        className={`text-right ${row.gap < 0 ? "text-destructive font-medium" : ""}`}
                      >
                        {fmt(row.gap)}
                      </TableCell>
                      <TableCell className="text-right">{pct(row.utilizacao)}</TableCell>
                      <TableCell>
                        {row.status === "estouro" && <Badge variant="destructive">Estouro</Badge>}
                        {row.status === "alerta" && <Badge variant="secondary">Alerta ≥90%</Badge>}
                        {row.status === "ok" && <Badge>OK</Badge>}
                        {row.status === "vazio" && <Badge variant="outline">Vazio</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Por fluxo / linha</CardTitle>
              <CardDescription>
                SKU com <code>fluxoId</code> soma capacidade dos recursos do fluxo; demais usam
                match por <code>linha</code> × <code>linhaProduto</code>
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Match</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Demanda 12M</TableHead>
                    <TableHead className="text-right">Capacidade 12M</TableHead>
                    <TableHead className="text-right">Gap</TableHead>
                    <TableHead className="text-right">Meses estouro</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analise.porMatch.map(row => (
                    <TableRow key={row.key}>
                      <TableCell className="font-medium">{row.label}</TableCell>
                      <TableCell>
                        <Badge variant={row.tipo === "fluxo" ? "default" : "outline"}>
                          {row.tipo}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{fmt(row.demandaTotal)}</TableCell>
                      <TableCell className="text-right">{fmt(row.capacidadeTotal)}</TableCell>
                      <TableCell
                        className={`text-right ${row.gapTotal < 0 ? "text-destructive font-medium" : ""}`}
                      >
                        {fmt(row.gapTotal)}
                      </TableCell>
                      <TableCell className="text-right">{row.mesesEstourados}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
