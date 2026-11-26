import { useEffect, useState } from "react";
import { Check, ChevronsUpDown, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { alternarSelecaoProduto, type ProdutoSelecionado } from "@shared/de-para-combobox";
import { listaComboboxProdutos, rotuloProduto, type ProdutoBuscaItem } from "@shared/produto-busca";

export type ProdutoOpcao = ProdutoSelecionado & { score?: number | null };

type BaseProps = {
  placeholder?: string;
  disabled?: boolean;
  excluir?: string[];
  sugestoes?: ProdutoOpcao[];
  permitirSemReferencia?: boolean;
  id?: string;
};

type SingleProps = BaseProps & {
  multiple?: false;
  value: ProdutoOpcao | null;
  onChange: (value: ProdutoOpcao | null) => void;
};

type MultiProps = BaseProps & {
  multiple: true;
  value: ProdutoOpcao[];
  onChange: (value: ProdutoOpcao[]) => void;
};

const SEM = "__sem_referencia__";

function useDebounced(value: string, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function textoSelecionado(value: ProdutoOpcao | null, permitirSemReferencia: boolean, placeholder: string) {
  if (!value) return permitirSemReferencia ? "Sem referência" : placeholder;
  return rotuloProduto(value);
}

export function ProdutoCombobox(props: SingleProps | MultiProps) {
  const {
    placeholder = "Buscar por código ou descrição",
    disabled,
    excluir = [],
    sugestoes = [],
    permitirSemReferencia = false,
    id,
  } = props;
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const termo = useDebounced(busca, 250);
  const consultar = aberto && termo.trim().length > 0;
  const { data, isFetching, isError } = trpc.produtos.buscar.useQuery(
    { query: termo.trim(), limit: 30, excluir },
    { enabled: consultar }
  );

  const selecionados = props.multiple ? props.value : props.value ? [props.value] : [];
  const proibido = excluir[0] ?? null;

  const escolher = (opcao: ProdutoOpcao | null) => {
    if (props.multiple) {
      if (!opcao) return;
      const resultado = alternarSelecaoProduto(props.value, opcao, { proibido });
      if (resultado.erro) return;
      props.onChange(resultado.selecionados);
      return;
    }
    if (opcao && proibido && opcao.codigo.toUpperCase() === proibido.trim().toUpperCase()) return;
    props.onChange(opcao);
    setAberto(false);
  };

  const lista = listaComboboxProdutos({
    termo: consultar ? termo : "",
    sugestoes,
    resultados: consultar ? (data ?? []) : [],
    excluir,
  });

  return (
    <div className="min-w-0 space-y-2">
      {props.multiple && props.value.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {props.value.map(item => (
            <span
              key={item.codigo}
              className="inline-flex max-w-full items-center gap-1 rounded-md border bg-muted px-2 py-0.5 text-xs"
              title={rotuloProduto(item)}
            >
              <span className="truncate font-mono">{item.codigo}</span>
              <button
                type="button"
                className="rounded-sm text-muted-foreground hover:text-foreground"
                aria-label={`Remover ${item.codigo}`}
                onClick={() =>
                  props.onChange(props.value.filter(atual => atual.codigo.toUpperCase() !== item.codigo.toUpperCase()))
                }
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <Popover open={aberto} onOpenChange={setAberto}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={aberto}
            disabled={disabled}
            className="h-auto min-h-9 w-full justify-between gap-2 whitespace-normal px-3 py-2 text-left font-normal"
          >
            <span className="line-clamp-2 min-w-0 flex-1 break-words">
              {props.multiple
                ? props.value.length
                  ? `${props.value.length} SKU${props.value.length === 1 ? "" : "s"} selecionado${props.value.length === 1 ? "" : "s"}`
                  : placeholder
                : textoSelecionado(props.value, permitirSemReferencia, placeholder)}
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="bottom"
          collisionPadding={8}
          className="z-[80] w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-1.5rem)] p-0"
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Código ou descrição"
              value={busca}
              onValueChange={setBusca}
            />
            <CommandList className="max-h-[min(16rem,50vh)]">
              {consultar && isFetching ? (
                <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Buscando…
                </div>
              ) : null}
              {consultar && isError ? (
                <p className="px-3 py-3 text-sm text-destructive">Não foi possível buscar os produtos.</p>
              ) : null}
              {consultar && !isFetching && !isError && lista.vazio ? (
                <p className="px-3 py-2 text-sm text-muted-foreground">Nenhum produto encontrado</p>
              ) : null}
              {!consultar ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">Digite o código ou parte da descrição.</p>
              ) : null}
              <CommandGroup>
                {permitirSemReferencia ? (
                  <CommandItem value={SEM} onSelect={() => escolher(null)}>
                    <Check className={cn("h-4 w-4", !selecionados.length ? "opacity-100" : "opacity-0")} />
                    Sem referência
                  </CommandItem>
                ) : null}
                {lista.sugestoes.map(item => (
                  <ItemProduto
                    key={`s-${item.codigo}`}
                    item={item}
                    marcado={selecionados.some(atual => atual.codigo.toUpperCase() === item.codigo.toUpperCase())}
                    onSelect={() => escolher(item)}
                  />
                ))}
                {lista.resultados.map(item => (
                  <ItemProduto
                    key={item.codigo}
                    item={item}
                    marcado={selecionados.some(atual => atual.codigo.toUpperCase() === item.codigo.toUpperCase())}
                    onSelect={() => escolher(item)}
                  />
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function ItemProduto({
  item,
  marcado,
  onSelect,
}: {
  item: ProdutoBuscaItem & { score?: number | null };
  marcado: boolean;
  onSelect: () => void;
}) {
  return (
    <CommandItem value={`${item.codigo} ${item.descricao}`} onSelect={onSelect} className="items-start">
      <Check className={cn("mt-0.5 h-4 w-4", marcado ? "opacity-100" : "opacity-0")} />
      <span className="min-w-0 whitespace-normal break-words">{rotuloProduto(item)}</span>
    </CommandItem>
  );
}
