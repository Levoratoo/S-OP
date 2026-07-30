import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Loader2, Calculator, Factory, TrendingUp } from "lucide-react";

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

export default function CalculoCapacidade() {
  const currentYear = new Date().getFullYear();
  const [ano, setAno] = useState(2026); // Padrão 2026 para planejamento
  const [filtroLinha, setFiltroLinha] = useState<string>("todas");
  const [filtroGrupo, setFiltroGrupo] = useState<string>("todos");
  const [filtroLinhaProduto, setFiltroLinhaProduto] = useState<string>("todas");
  const [filtroTipoAcabamento, setFiltroTipoAcabamento] = useState<string>("todos");

  const { data, isLoading } = trpc.capacidade.calcular.useQuery({ ano });

  // Extrair linhas, grupos, linhas de produto e tipos de acabamento únicos para os filtros
  const { linhasUnicas, gruposUnicos, linhasProdutoUnicas, tiposAcabamentoUnicos } = useMemo(() => {
    if (!data?.recursos) return { linhasUnicas: [], gruposUnicos: [], linhasProdutoUnicas: [], tiposAcabamentoUnicos: [] };
    
    const linhas = new Set<string>();
    const grupos = new Set<string>();
    const linhasProduto = new Set<string>();
    const tiposAcabamento = new Set<string>();
    
    data.recursos.forEach((r: any) => {
      if (r.linhaProducao) linhas.add(r.linhaProducao);
      if (r.grupoTrabalho) grupos.add(r.grupoTrabalho);
      if (r.linhaProduto) linhasProduto.add(r.linhaProduto);
      if (r.tipoAcabamento) tiposAcabamento.add(r.tipoAcabamento);
    });
    
    return {
      linhasUnicas: Array.from(linhas).sort(),
      gruposUnicos: Array.from(grupos).sort(),
      linhasProdutoUnicas: Array.from(linhasProduto).sort(),
      tiposAcabamentoUnicos: Array.from(tiposAcabamento).sort(),
    };
  }, [data?.recursos]);

  // Filtrar recursos
  const recursosFiltrados = useMemo(() => {
    if (!data?.recursos) return [];
    
    return data.recursos.filter((r: any) => {
      if (filtroLinha !== "todas" && r.linhaProducao !== filtroLinha) return false;
      if (filtroGrupo !== "todos" && r.grupoTrabalho !== filtroGrupo) return false;
      if (filtroLinhaProduto !== "todas" && r.linhaProduto !== filtroLinhaProduto) return false;
      if (filtroTipoAcabamento !== "todos" && r.tipoAcabamento !== filtroTipoAcabamento) return false;
      return true;
    });
  }, [data?.recursos, filtroLinha, filtroGrupo, filtroLinhaProduto, filtroTipoAcabamento]);

  // Calcular totais por mês
  const totaisPorMes = useMemo(() => {
    const totais: Record<number, number> = {};
    
    MESES.forEach(m => {
      totais[m.num] = recursosFiltrados.reduce((acc: number, r: any) => {
        return acc + (r.capacidadeMensal[m.num] || 0);
      }, 0);
    });
    
    return totais;
  }, [recursosFiltrados]);

  // Calcular total geral
  const totalGeral = useMemo(() => {
    return recursosFiltrados.reduce((acc: number, r: any) => acc + (r.capacidadeTotal || 0), 0);
  }, [recursosFiltrados]);

  // Identificar meses com maior e menor capacidade para cada recurso
  const getMesesDestaque = useMemo(() => {
    const resultado: Record<number, { max: number[], min: number[] }> = {};
    
    recursosFiltrados.forEach((recurso: any) => {
      const valores = MESES.map(m => ({
        mes: m.num,
        valor: recurso.capacidadeMensal[m.num] || 0
      })).filter(v => v.valor > 0); // Apenas meses com valor
      
      if (valores.length > 0) {
        const maxValor = Math.max(...valores.map(v => v.valor));
        const minValor = Math.min(...valores.map(v => v.valor));
        
        resultado[recurso.recursoId] = {
          max: valores.filter(v => v.valor === maxValor).map(v => v.mes),
          min: valores.filter(v => v.valor === minValor && minValor !== maxValor).map(v => v.mes)
        };
      } else {
        resultado[recurso.recursoId] = { max: [], min: [] };
      }
    });
    
    return resultado;
  }, [recursosFiltrados]);

  // Identificar meses com maior e menor capacidade nos totais
  const totaisDestaque = useMemo(() => {
    const valores = MESES.map(m => ({
      mes: m.num,
      valor: totaisPorMes[m.num] || 0
    })).filter(v => v.valor > 0);
    
    if (valores.length === 0) return { max: [], min: [] };
    
    const maxValor = Math.max(...valores.map(v => v.valor));
    const minValor = Math.min(...valores.map(v => v.valor));
    
    return {
      max: valores.filter(v => v.valor === maxValor).map(v => v.mes),
      min: valores.filter(v => v.valor === minValor && minValor !== maxValor).map(v => v.mes)
    };
  }, [totaisPorMes]);

  // Função para obter a classe de cor da célula
  const getCellColor = (recursoId: number, mes: number) => {
    const destaque = getMesesDestaque[recursoId];
    if (!destaque) return "";
    
    if (destaque.max.includes(mes)) return "bg-green-100 text-green-800";
    if (destaque.min.includes(mes)) return "bg-red-100 text-red-800";
    return "";
  };

  // Função para obter a classe de cor da célula de total
  const getTotalCellColor = (mes: number) => {
    if (totaisDestaque.max.includes(mes)) return "bg-green-100 text-green-800";
    if (totaisDestaque.min.includes(mes)) return "bg-red-100 text-red-800";
    return "";
  };

  // Formatar número
  const formatNumber = (num: number | null) => {
    if (num === null || num === undefined) return "-";
    return num.toLocaleString("pt-BR");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cálculo de Capacidade</h1>
        <p className="text-muted-foreground">
          Capacidade produtiva mensal por recurso: (Dias úteis × Horas úteis - H. Manutenção) × Velocidade Líquida
        </p>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">Ano</span>
              <Select value={ano.toString()} onValueChange={(v) => setAno(parseInt(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
                    <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">Linha Produção</span>
              <Select value={filtroLinha} onValueChange={setFiltroLinha}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  {linhasUnicas.map((linha) => (
                    <SelectItem key={linha} value={linha}>{linha}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">Grupo Trabalho</span>
              <Select value={filtroGrupo} onValueChange={setFiltroGrupo}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {gruposUnicos.map((grupo) => (
                    <SelectItem key={grupo} value={grupo}>{grupo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">Linha Produto</span>
              <Select value={filtroLinhaProduto} onValueChange={setFiltroLinhaProduto}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  {linhasProdutoUnicas.map((linhaProduto) => (
                    <SelectItem key={linhaProduto} value={linhaProduto}>{linhaProduto}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">Tipo Acabamento</span>
              <Select value={filtroTipoAcabamento} onValueChange={setFiltroTipoAcabamento}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {tiposAcabamentoUnicos.map((tipo) => (
                    <SelectItem key={tipo} value={tipo}>{tipo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cards de resumo */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Recursos</CardTitle>
            <div className="p-2 rounded-lg bg-blue-100"><Factory className="h-4 w-4 text-blue-600" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{recursosFiltrados.length}</div>
            <p className="text-xs text-muted-foreground">recursos filtrados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Capacidade Total</CardTitle>
            <div className="p-2 rounded-lg bg-green-100"><Calculator className="h-4 w-4 text-green-600" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(totalGeral)}</div>
            <p className="text-xs text-muted-foreground">unidades/ano</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Média Mensal</CardTitle>
            <div className="p-2 rounded-lg bg-purple-100"><TrendingUp className="h-4 w-4 text-purple-600" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(Math.round(totalGeral / 12))}</div>
            <p className="text-xs text-muted-foreground">unidades/mês</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Dias Úteis</CardTitle>
            <div className="p-2 rounded-lg bg-orange-100"><Calculator className="h-4 w-4 text-orange-600" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data?.diasUteisPorMes ? Object.values(data.diasUteisPorMes).reduce((a: number, b: number) => a + b, 0) : 0}
            </div>
            <p className="text-xs text-muted-foreground">dias no ano</p>
          </CardContent>
        </Card>
      </div>

      {/* Legenda de cores */}
      <div className="flex items-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-green-100 border border-green-300"></div>
          <span>Maior capacidade</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-red-100 border border-red-300"></div>
          <span>Menor capacidade</span>
        </div>
      </div>

      {/* Tabela de capacidade */}
      <Card>
        <CardHeader>
          <CardTitle>Capacidade por Recurso e Mês</CardTitle>
          <CardDescription>
            Valores em unidades. Células vazias indicam recursos sem configuração de turno para o mês.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : recursosFiltrados.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Nenhum recurso encontrado com os filtros selecionados
            </p>
          ) : (
            <div className="w-full overflow-x-auto">
              <Table className="w-full text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 bg-background z-10 min-w-[150px]">Recurso</TableHead>
                    {MESES.map((m) => (
                      <TableHead key={m.num} className="text-center min-w-[70px]">
                        {m.nome}
                        <div className="text-xs font-normal text-muted-foreground">
                          {data?.diasUteisPorMes?.[m.num] || 0}d
                        </div>
                      </TableHead>
                    ))}
                    <TableHead className="text-center min-w-[90px] font-bold bg-muted/30">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recursosFiltrados.map((recurso: any) => (
                    <TableRow key={recurso.recursoId}>
                      <TableCell className="sticky left-0 bg-background z-10 font-medium" title={`${recurso.linhaProducao || ''} - ${recurso.grupoTrabalho || ''}`}>
                        <div className="truncate max-w-[150px]">{recurso.recursoNome}</div>
                        <div className="text-xs text-muted-foreground">
                          {recurso.velocidadeLiquida.toLocaleString("pt-BR")} un/h
                        </div>
                      </TableCell>
                      {MESES.map((m) => (
                        <TableCell 
                          key={m.num} 
                          className={`text-center tabular-nums ${getCellColor(recurso.recursoId, m.num)}`}
                        >
                          {formatNumber(recurso.capacidadeMensal[m.num])}
                        </TableCell>
                      ))}
                      <TableCell className="text-center font-bold tabular-nums bg-muted/30">
                        {formatNumber(recurso.capacidadeTotal)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Linha de totais */}
                  <TableRow className="bg-muted/50 font-bold border-t-2">
                    <TableCell className="sticky left-0 bg-muted/50 z-10">TOTAL</TableCell>
                    {MESES.map((m) => (
                      <TableCell 
                        key={m.num} 
                        className={`text-center tabular-nums ${getTotalCellColor(m.num)}`}
                      >
                        {formatNumber(totaisPorMes[m.num])}
                      </TableCell>
                    ))}
                    <TableCell className="text-center tabular-nums bg-muted/30">
                      {formatNumber(totalGeral)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
