import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { exportToCsv } from "@/lib/exportCsv";
import { listaComboboxProdutos } from "@shared/produto-busca";
import { DECISOES_COMPRA, RISCOS_COMPRA } from "@shared/compra-papel";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Linha = {
  linhaId: string;
  dealId: number;
  titulo: string;
  proprietario: string;
  proprietarioEmail: string;
  marca: string;
  temperatura: string;
  sku: string;
  descricao: string;
  tipo: string;
  meses: string[];
  quantidade: number;
  preco: number;
  valor: number;
  papelId: number | null;
  risco: string | null;
  comprar: string;
  quantidadeCompra: number | null;
  observacao: string;
  decididoPor: string | null;
  decididoEm: string | null;
};

type LinhaArquivo = {
  linhaId: string;
  papel: string;
  risco: string;
  comprar: string;
  quantidade: string;
  observacao: string;
};

async function matrizPlanilha(file: File): Promise<Record<string, string>[]> {
  const csv = /\.csv$/i.test(file.name) || file.type.includes("csv");
  const livro = csv
    ? XLSX.read((await file.text()).replace(/^\uFEFF/, ""), { type: "string", FS: ";" })
    : XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheet = livro.Sheets[livro.SheetNames[0] ?? ""];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: "" });
}

function linhasDoArquivo(json: Array<Record<string, string>>): LinhaArquivo[] {
  return json.map(row => ({
    linhaId: String(row.ID ?? row.linhaId ?? row.id ?? ""),
    papel: String(row.Papel ?? row.papel ?? ""),
    risco: String(row.Risco ?? row.risco ?? ""),
    comprar: String(row.Comprar ?? row.comprar ?? ""),
    quantidade: String(row["Qtd comprar"] ?? row.quantidadeCompra ?? ""),
    observacao: String(row.Observação ?? row.Observacao ?? row.observacao ?? ""),
  }));
}

const COLUNAS = [
  { key: "linhaId", title: "ID" },
  { key: "dealId", title: "Negócio" },
  { key: "titulo", title: "Título" },
  { key: "proprietario", title: "Proprietário" },
  { key: "marca", title: "Marca" },
  { key: "temperatura", title: "Temperatura" },
  { key: "sku", title: "SKU" },
  { key: "descricao", title: "Descrição" },
  { key: "tipo", title: "Tipo" },
  { key: "meses", title: "Entrega" },
  { key: "quantidade", title: "Quantidade" },
  { key: "valor", title: "R$" },
  { key: "papel", title: "Papel" },
  { key: "risco", title: "Risco" },
  { key: "comprar", title: "Comprar" },
  { key: "quantidadeCompra", title: "Qtd comprar" },
  { key: "observacao", title: "Observação" },
] as const;

function PapelCombobox({
  papeis,
  value,
  disabled,
  onChange,
}: {
  papeis: Array<{ id: number; codigo: string; descricao: string; ativo: boolean }>;
  value: number | null;
  disabled?: boolean;
  onChange: (id: number | null) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [termo, setTermo] = useState("");
  const atual = papeis.find(papel => papel.id === value);
  const lista = listaComboboxProdutos({
    termo,
    sugestoes: [],
    resultados: papeis.filter(papel => papel.ativo).map(papel => ({
      codigo: papel.codigo,
      descricao: papel.descricao,
      marca: null,
    })),
  });
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" disabled={disabled} className="h-auto min-h-9 w-full justify-between whitespace-normal text-left font-normal">
          <span className="line-clamp-2">{atual ? `${atual.codigo} — ${atual.descricao}` : "Escolher papel"}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="z-[80] w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-1.5rem)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput value={termo} onValueChange={setTermo} placeholder="Código ou descrição" />
          <CommandList className="max-h-60">
            {lista.vazio ? <p className="px-3 py-2 text-sm text-muted-foreground">Nenhum papel encontrado</p> : null}
            <CommandGroup>
              <CommandItem onSelect={() => { onChange(null); setAberto(false); }}>Sem papel</CommandItem>
              {lista.resultados.map(item => {
                const papel = papeis.find(atualPapel => atualPapel.codigo === item.codigo);
                if (!papel) return null;
                return (
                  <CommandItem key={papel.id} onSelect={() => { onChange(papel.id); setAberto(false); }}>
                    <Check className={cn("h-4 w-4", value === papel.id ? "opacity-100" : "opacity-0")} />
                    <span className="whitespace-normal break-words">{item.codigo} — {item.descricao}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function CompraPapel({ cicloId, status }: { cicloId: number; status: string }) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.compraPapel.visao.useQuery({ cicloId });
  const [marca, setMarca] = useState("all");
  const [tipo, setTipo] = useState("all");
  const [decisao, setDecisao] = useState("all");
  const [risco, setRisco] = useState("all");
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [rascunho, setRascunho] = useState<Record<string, Partial<Linha>>>({});
  const [previa, setPrevia] = useState<Array<{ linhaId: string; erros: string[] }> | null>(null);
  const [podeConfirmar, setPodeConfirmar] = useState(false);
  const [arquivo, setArquivo] = useState<LinhaArquivo[] | null>(null);
  const [papelCodigo, setPapelCodigo] = useState("");
  const [papelDescricao, setPapelDescricao] = useState("");
  const [papelGramatura, setPapelGramatura] = useState("");
  const [papelFormato, setPapelFormato] = useState("");
  const [papelTipo, setPapelTipo] = useState("");
  const [papelUnidade, setPapelUnidade] = useState("KG");
  const [estoquePapelId, setEstoquePapelId] = useState("");
  const [estoqueQtd, setEstoqueQtd] = useState("");
  const [estoqueUnidade, setEstoqueUnidade] = useState("KG");
  const [estoqueData, setEstoqueData] = useState("");

  const salvar = trpc.compraPapel.salvar.useMutation({
    onSuccess: () => {
      toast.success("Decisões gravadas");
      setRascunho({});
      setSelecionados([]);
      utils.compraPapel.visao.invalidate({ cicloId });
    },
    onError: error => toast.error(error.message),
  });
  const criar = trpc.compraPapel.criarPapel.useMutation({
    onSuccess: () => {
      toast.success("Papel cadastrado");
      setPapelCodigo("");
      setPapelDescricao("");
      setPapelGramatura("");
      setPapelFormato("");
      setPapelTipo("");
      utils.compraPapel.visao.invalidate({ cicloId });
    },
    onError: error => toast.error(error.message),
  });
  const atualizarPapel = trpc.compraPapel.atualizarPapel.useMutation({
    onSuccess: () => utils.compraPapel.visao.invalidate({ cicloId }),
    onError: error => toast.error(error.message),
  });
  const importarEstoque = trpc.compraPapel.importarEstoque.useMutation({
    onSuccess: result => {
      toast.success(`${result.gravados} estoque(s) gravados`);
      if (result.erros.length) toast.error(result.erros.slice(0, 3).join(" "));
      utils.compraPapel.visao.invalidate({ cicloId });
    },
    onError: error => toast.error(error.message),
  });
  const prever = trpc.compraPapel.preverImportacao.useMutation({
    onSuccess: result => {
      setPrevia(result.previa);
      setPodeConfirmar(result.podeConfirmar);
    },
    onError: error => toast.error(error.message),
  });
  const confirmar = trpc.compraPapel.confirmarImportacao.useMutation({
    onSuccess: () => {
      toast.success("Planilha do PCM gravada");
      setPrevia(null);
      setArquivo(null);
      utils.compraPapel.visao.invalidate({ cicloId });
    },
    onError: error => toast.error(error.message),
  });

  const linhas = (data?.linhas ?? []) as Linha[];
  const editavel = Boolean(data?.editavel);
  const estoquePorPapel = new Map((data?.estoque ?? []).map(item => [item.papelId, item]));
  const filtradas = useMemo(() => {
    return linhas.filter(linha => {
      if (marca !== "all" && linha.marca !== marca) return false;
      if (tipo !== "all" && linha.tipo !== tipo) return false;
      if (decisao !== "all" && (rascunho[linha.linhaId]?.comprar ?? linha.comprar) !== decisao) return false;
      if (risco !== "all" && (rascunho[linha.linhaId]?.risco ?? linha.risco) !== risco) return false;
      return true;
    });
  }, [linhas, marca, tipo, decisao, risco, rascunho]);
  const marcas = [...new Set(linhas.map(linha => linha.marca).filter(Boolean))].sort();
  const resumo = useMemo(() => {
    const porDecisao: Record<string, { qtd: number; valor: number; n: number }> = {};
    let pendentes = 0;
    for (const linha of linhas) {
      const comprar = String(rascunho[linha.linhaId]?.comprar ?? linha.comprar);
      if (comprar !== "SIM" && comprar !== "NAO") pendentes += 1;
      const atual = porDecisao[comprar] ?? { qtd: 0, valor: 0, n: 0 };
      atual.n += 1;
      atual.qtd += linha.quantidade;
      atual.valor += linha.valor;
      porDecisao[comprar] = atual;
    }
    return { total: linhas.length, pendentes, decididas: linhas.length - pendentes, porDecisao };
  }, [linhas, rascunho]);

  const valorLinha = (linha: Linha) => ({ ...linha, ...rascunho[linha.linhaId] });
  const alterar = (linhaId: string, patch: Partial<Linha>) => setRascunho(atual => ({ ...atual, [linhaId]: { ...atual[linhaId], ...patch } }));
  const gravar = (ids: string[]) => {
    salvar.mutate({
      cicloId,
      itens: linhas.filter(linha => ids.includes(linha.linhaId)).map(linha => {
        const atual = valorLinha(linha);
        return {
          linhaId: linha.linhaId,
          papelId: atual.papelId ?? null,
          risco: (atual.risco as "BAIXO" | "MEDIO" | "ALTO" | null) ?? null,
          comprar: (atual.comprar as "SIM" | "NAO" | "PENDENTE") || "PENDENTE",
          quantidade: atual.quantidadeCompra ?? null,
          observacao: atual.observacao ?? "",
        };
      }),
    });
  };

  const exportar = (formato: "csv" | "xlsx") => {
    const rows = linhas.map(linha => {
      const papel = data?.papeis.find(item => item.id === linha.papelId);
      return {
        linhaId: linha.linhaId,
        dealId: linha.dealId,
        titulo: linha.titulo,
        proprietario: linha.proprietario,
        marca: linha.marca,
        temperatura: linha.temperatura,
        sku: linha.sku,
        descricao: linha.descricao,
        tipo: linha.tipo,
        meses: linha.meses.join(", "),
        quantidade: linha.quantidade,
        valor: linha.valor,
        papel: papel?.codigo ?? "",
        risco: linha.risco ?? "",
        comprar: linha.comprar,
        quantidadeCompra: linha.quantidadeCompra ?? "",
        observacao: linha.observacao ?? "",
      };
    });
    if (formato === "csv") {
      exportToCsv(rows, `compra-papel-ciclo-${cicloId}`, COLUNAS.map(coluna => ({ key: coluna.key, title: coluna.title })));
      return;
    }
    const planilha = XLSX.utils.json_to_sheet(rows);
    const livro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(livro, planilha, "Compra de papel");
    XLSX.writeFile(livro, `compra-papel-ciclo-${cicloId}.xlsx`);
  };

  const lerArquivo = async (file: File) => {
    const linhasArquivo = linhasDoArquivo(await matrizPlanilha(file));
    setArquivo(linhasArquivo);
    prever.mutate({ cicloId, linhas: linhasArquivo });
  };

  if (isLoading || !data) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Compra de papel</CardTitle>
        <CardDescription>
          Negócios do CRM com entrega em {data.janela.map(mes => `${String(mes.mes).padStart(2, "0")}/${mes.ano}`).join(", ")}.
          Temperatura vem das etiquetas Frio, Morno e Quente; se não houver, da probabilidade do negócio.
          Sem uma sincronização do Pipedrive neste ciclo, o dono fica em branco e o número do negócio é o id interno da linha.
          {data.comentario ? ` ${data.comentario}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex max-w-full flex-wrap gap-3 text-sm">
          <span>Linhas: <strong>{resumo.total}</strong></span>
          <span>Decididas: <strong>{resumo.decididas}</strong></span>
          <span>Pendentes: <strong>{resumo.pendentes}</strong></span>
          {Object.entries(resumo.porDecisao).map(([chave, valor]) => (
            <span key={chave}>{chave}: {valor.n} · {valor.qtd.toLocaleString("pt-BR")} un · R$ {valor.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
          ))}
        </div>
        <div className="flex max-w-full flex-wrap items-end gap-2">
          <Filtro label="Marca" value={marca} onChange={setMarca} opcoes={marcas} />
          <Filtro label="Tipo" value={tipo} onChange={setTipo} opcoes={["Cliente novo", "Recompra"]} />
          <Filtro label="Decisão" value={decisao} onChange={setDecisao} opcoes={[...DECISOES_COMPRA]} />
          <Filtro label="Risco" value={risco} onChange={setRisco} opcoes={[...RISCOS_COMPRA]} />
          <Button type="button" size="sm" variant="outline" onClick={() => exportar("csv")}>CSV</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => exportar("xlsx")}>XLSX</Button>
          {editavel ? (
            <Label className="inline-flex h-9 cursor-pointer items-center rounded-md border px-3 text-sm">
              Importar PCM
              <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={event => {
                const file = event.target.files?.[0];
                if (file) void lerArquivo(file);
                event.target.value = "";
              }} />
            </Label>
          ) : null}
        </div>
        {editavel ? (
          <div className="flex max-w-full flex-wrap items-end gap-2 rounded-md border p-3">
            <div className="space-y-1">
              <Label>Novo papel</Label>
              <Input value={papelCodigo} onChange={event => setPapelCodigo(event.target.value)} placeholder="Código" className="w-32" />
            </div>
            <Input value={papelDescricao} onChange={event => setPapelDescricao(event.target.value)} placeholder="Descrição" className="w-64" />
            <Input value={papelGramatura} onChange={event => setPapelGramatura(event.target.value)} placeholder="Gramatura" className="w-28" />
            <Input value={papelFormato} onChange={event => setPapelFormato(event.target.value)} placeholder="Formato" className="w-28" />
            <Input value={papelTipo} onChange={event => setPapelTipo(event.target.value)} placeholder="Tipo" className="w-28" />
            <Input value={papelUnidade} onChange={event => setPapelUnidade(event.target.value)} placeholder="Unidade" className="w-20" />
            <Button
              type="button"
              size="sm"
              onClick={() => criar.mutate({
                codigo: papelCodigo,
                descricao: papelDescricao,
                gramatura: papelGramatura || undefined,
                formato: papelFormato || undefined,
                tipo: papelTipo || undefined,
                unidade: papelUnidade || undefined,
              })}
            >
              Cadastrar papel
            </Button>
            <Label className="inline-flex h-9 cursor-pointer items-center rounded-md border px-3 text-sm">
              Importar estoque
              <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={event => {
                const file = event.target.files?.[0];
                if (!file) return;
                void matrizPlanilha(file).then(json => {
                  importarEstoque.mutate({
                    linhas: json.map(row => {
                      const bruto = String(row.quantidade ?? row.Quantidade ?? "0").trim();
                      const quantidade = Number(bruto.includes(",") ? bruto.replace(/\./g, "").replace(",", ".") : bruto);
                      return {
                        codigo: String(row.codigo ?? row.Código ?? row.Codigo ?? ""),
                        quantidade,
                        unidade: String(row.unidade ?? row.Unidade ?? "KG"),
                        dataBase: String(row["data-base"] ?? row.dataBase ?? row.Data ?? "").slice(0, 10),
                      };
                    }).filter(row => row.codigo && Number.isFinite(row.quantidade) && /^\d{4}-\d{2}-\d{2}$/.test(row.dataBase)),
                  });
                });
                event.target.value = "";
              }} />
            </Label>
            <Button type="button" size="sm" variant="secondary" disabled={!selecionados.length} onClick={() => gravar(selecionados)}>
              Gravar selecionados
            </Button>
            <Button type="button" size="sm" disabled={salvar.isPending} onClick={() => gravar(linhas.map(linha => linha.linhaId))}>Gravar decisões</Button>
          </div>
        ) : null}
        {editavel ? (
          <div className="flex max-w-full flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label>Estoque manual</Label>
              <Select value={estoquePapelId || undefined} onValueChange={setEstoquePapelId}>
                <SelectTrigger className="w-48"><SelectValue placeholder="Papel" /></SelectTrigger>
                <SelectContent>
                  {data.papeis.filter(papel => papel.ativo).map(papel => (
                    <SelectItem key={papel.id} value={String(papel.id)}>{papel.codigo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Input value={estoqueQtd} onChange={event => setEstoqueQtd(event.target.value)} placeholder="Quantidade" className="w-28" />
            <Input value={estoqueUnidade} onChange={event => setEstoqueUnidade(event.target.value)} placeholder="Unidade" className="w-20" />
            <Input type="date" value={estoqueData} onChange={event => setEstoqueData(event.target.value)} className="w-40" />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!estoquePapelId || !estoqueData}
              onClick={() => {
                const papel = data.papeis.find(item => item.id === Number(estoquePapelId));
                const quantidade = Number(estoqueQtd.trim().includes(",") ? estoqueQtd.replace(/\./g, "").replace(",", ".") : estoqueQtd);
                if (!papel || !Number.isFinite(quantidade)) return;
                importarEstoque.mutate({ linhas: [{ codigo: papel.codigo, quantidade, unidade: estoqueUnidade || papel.unidade, dataBase: estoqueData }] });
              }}
            >
              Gravar estoque
            </Button>
            {data.papeis.map(papel => (
              <Button key={papel.id} type="button" size="sm" variant="ghost" onClick={() => atualizarPapel.mutate({ id: papel.id, ativo: !papel.ativo })}>
                {papel.codigo} {papel.ativo ? "ativo" : "inativo"}
              </Button>
            ))}
          </div>
        ) : null}
        {!editavel ? (
          <p className="text-sm text-muted-foreground">Ciclo {status}: decisões somente leitura, a partir da foto congelada.</p>
        ) : null}
        {editavel && selecionados.length ? (
          <div className="flex flex-wrap gap-2">
            <Select onValueChange={valor => selecionados.forEach(id => alterar(id, { comprar: valor }))}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Decisão em massa" /></SelectTrigger>
              <SelectContent>{DECISOES_COMPRA.map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
            </Select>
            <Select onValueChange={valor => selecionados.forEach(id => alterar(id, { risco: valor }))}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Risco em massa" /></SelectTrigger>
              <SelectContent>{RISCOS_COMPRA.map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
            </Select>
            <Select onValueChange={valor => selecionados.forEach(id => alterar(id, { papelId: Number(valor) }))}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Papel em massa" /></SelectTrigger>
              <SelectContent>
                {data.papeis.filter(papel => papel.ativo).map(papel => (
                  <SelectItem key={papel.id} value={String(papel.id)}>{papel.codigo}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        {previa ? (
          <div className="space-y-2 rounded-md border p-3">
            <p className="text-sm font-medium">Prévia da importação</p>
            {previa.map((linha, indice) => (
              <p key={`${linha.linhaId}-${indice}`} className={linha.erros.length ? "text-sm text-destructive" : "text-sm"}>
                {linha.linhaId}: {linha.erros.length ? linha.erros.join(" ") : "pronta para gravar"}
              </p>
            ))}
            <Button
              type="button"
              size="sm"
              disabled={!podeConfirmar || confirmar.isPending}
              onClick={() => arquivo && confirmar.mutate({ cicloId, linhas: arquivo })}
            >
              Confirmar importação
            </Button>
          </div>
        ) : null}
        <div className="max-h-[70vh] max-w-full overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead />
                <TableHead className="sticky left-0 z-20 min-w-[8rem] bg-background">Marca</TableHead>
                <TableHead className="sticky left-[8rem] z-20 min-w-[7.5rem] bg-background">SKU</TableHead>
                <TableHead className="min-w-[10rem] whitespace-normal sm:min-w-[16rem]">Descrição</TableHead>
                <TableHead>Negócio</TableHead>
                <TableHead>Proprietário</TableHead>
                <TableHead>Quem / quando</TableHead>
                <TableHead>Temperatura</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Entrega</TableHead>
                <TableHead className="text-right">Qtd</TableHead>
                <TableHead className="text-right">R$</TableHead>
                <TableHead className="min-w-[14rem]">Papel</TableHead>
                <TableHead>Estoque</TableHead>
                <TableHead>Risco</TableHead>
                <TableHead>Comprar?</TableHead>
                <TableHead>Qtd comprar</TableHead>
                <TableHead>Observação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.map(linha => {
                const atual = valorLinha(linha);
                const estoque = atual.papelId ? estoquePorPapel.get(atual.papelId) : undefined;
                return (
                  <TableRow key={linha.linhaId}>
                    <TableCell>
                      {editavel ? (
                        <input
                          type="checkbox"
                          checked={selecionados.includes(linha.linhaId)}
                          onChange={event => setSelecionados(lista => event.target.checked ? [...lista, linha.linhaId] : lista.filter(id => id !== linha.linhaId))}
                        />
                      ) : null}
                    </TableCell>
                    <TableCell className="sticky left-0 z-10 bg-background">{linha.marca || "—"}</TableCell>
                    <TableCell className="sticky left-[8rem] z-10 bg-background font-mono text-xs">{linha.sku}</TableCell>
                    <TableCell className="whitespace-normal break-words">{linha.descricao}</TableCell>
                    <TableCell className="text-xs">#{linha.dealId} {linha.titulo}</TableCell>
                    <TableCell>
                      <div>{linha.proprietario || "—"}</div>
                      {linha.proprietarioEmail ? <div className="text-xs text-muted-foreground">{linha.proprietarioEmail}</div> : null}
                    </TableCell>
                    <TableCell className="text-xs">
                      {atual.decididoPor || "—"}
                      {atual.decididoEm ? <div>{new Date(atual.decididoEm).toLocaleString("pt-BR")}</div> : null}
                    </TableCell>
                    <TableCell>{linha.temperatura || "—"}</TableCell>
                    <TableCell>{linha.tipo}</TableCell>
                    <TableCell>{linha.meses.join(", ")}</TableCell>
                    <TableCell className="text-right tabular-nums">{linha.quantidade.toLocaleString("pt-BR")}</TableCell>
                    <TableCell className="text-right tabular-nums">{linha.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell>
                      <PapelCombobox
                        papeis={data.papeis}
                        value={atual.papelId ?? null}
                        disabled={!editavel}
                        onChange={papelId => alterar(linha.linhaId, { papelId })}
                      />
                    </TableCell>
                    <TableCell className="text-xs">{estoque ? `${estoque.quantidade.toLocaleString("pt-BR")} ${estoque.unidade} · ${estoque.dataBase}` : "—"}</TableCell>
                    <TableCell>
                      <Select value={atual.risco ?? undefined} onValueChange={valor => alterar(linha.linhaId, { risco: valor })} disabled={!editavel}>
                        <SelectTrigger className="w-28"><SelectValue placeholder="Risco" /></SelectTrigger>
                        <SelectContent>{RISCOS_COMPRA.map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select value={atual.comprar} onValueChange={valor => alterar(linha.linhaId, { comprar: valor })} disabled={!editavel}>
                        <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>{DECISOES_COMPRA.map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        className="w-24"
                        disabled={!editavel}
                        defaultValue={atual.quantidadeCompra ?? ""}
                        onBlur={event => alterar(linha.linhaId, { quantidadeCompra: event.target.value.trim() ? Number(event.target.value.replace(",", ".")) : null })}
                      />
                    </TableCell>
                    <TableCell>
                      <Textarea className="min-h-9 w-40" disabled={!editavel} defaultValue={atual.observacao} onBlur={event => alterar(linha.linhaId, { observacao: event.target.value })} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function Filtro({ label, value, onChange, opcoes }: { label: string; value: string; onChange: (valor: string) => void; opcoes: string[] }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos</SelectItem>
          {opcoes.map(opcao => <SelectItem key={opcao} value={opcao}>{opcao}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
