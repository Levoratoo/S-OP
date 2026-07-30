import { useState, useEffect, useRef } from "react";
import { Search, X, Wrench, Clock, Settings, ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";

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

type RecursoResultado = {
  id: number;
  nome: string;
  tipo: string;
  tipoExecucao: string;
  tipoAcabamento: string | null;
  linhaProducao: string | null;
  linhaProduto: string | null;
  grupoTrabalho: string | null;
  velocidadeLiquida: number;
  ativo: boolean;
  configuracoesMensais: Array<{
    mes: number;
    turnoId: number | null;
    turnoNome: string | null;
    horasManutencao: number | null;
    horasExtras: number | null;
    velocidadeLiquida: number | null;
  }>;
};

export function GlobalSearch() {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRecurso, setSelectedRecurso] = useState<RecursoResultado | null>(null);
  const [debouncedTerm, setDebouncedTerm] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [, setLocation] = useLocation();

  // Debounce do termo de busca
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedTerm(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Query de busca
  const { data: resultados, isLoading } = trpc.pesquisa.buscarRecursos.useQuery(
    { termo: debouncedTerm },
    { enabled: debouncedTerm.length >= 2 }
  );

  // Atalho de teclado Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen(true);
      }
      if (e.key === "Escape") {
        setIsOpen(false);
        setSelectedRecurso(null);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Focar no input quando abrir
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleClose = () => {
    setIsOpen(false);
    setSearchTerm("");
    setSelectedRecurso(null);
  };

  const handleSelectRecurso = (recurso: RecursoResultado) => {
    setSelectedRecurso(recurso);
  };

  const handleGoToRecurso = () => {
    if (selectedRecurso) {
      handleClose();
      setLocation("/cadastros/recursos");
    }
  };

  const handleGoToCapacidade = () => {
    handleClose();
    setLocation("/capacidade/calculo");
  };

  return (
    <>
      {/* Botão de pesquisa */}
      <Button
        variant="outline"
        className="relative h-9 w-full justify-start text-sm text-muted-foreground sm:pr-12 md:w-40 lg:w-64"
        onClick={() => setIsOpen(true)}
      >
        <Search className="mr-2 h-4 w-4" />
        <span className="hidden lg:inline-flex">Pesquisar recursos...</span>
        <span className="inline-flex lg:hidden">Pesquisar...</span>
        <kbd className="pointer-events-none absolute right-1.5 top-1.5 hidden h-6 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>

      {/* Dialog de pesquisa */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden p-0">
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Pesquisa Global de Recursos
            </DialogTitle>
          </DialogHeader>

          <div className="px-4 pb-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={inputRef}
                placeholder="Digite o nome do recurso..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-10"
              />
              {searchTerm && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                  onClick={() => setSearchTerm("")}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          <div className="flex flex-1 overflow-hidden border-t">
            {/* Lista de resultados */}
            <div className="w-1/3 border-r overflow-y-auto max-h-[60vh]">
              {isLoading && debouncedTerm.length >= 2 && (
                <div className="p-4 text-center text-muted-foreground">
                  Buscando...
                </div>
              )}

              {!isLoading && debouncedTerm.length < 2 && (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  Digite pelo menos 2 caracteres para pesquisar
                </div>
              )}

              {!isLoading && debouncedTerm.length >= 2 && resultados?.length === 0 && (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  Nenhum recurso encontrado
                </div>
              )}

              {resultados && resultados.length > 0 && (
                <div className="p-2">
                  {resultados.map((recurso) => (
                    <button
                      key={recurso.id}
                      className={`w-full text-left p-3 rounded-lg transition-colors ${
                        selectedRecurso?.id === recurso.id
                          ? "bg-primary/10 border border-primary/20"
                          : "hover:bg-muted"
                      }`}
                      onClick={() => handleSelectRecurso(recurso)}
                    >
                      <div className="flex items-center gap-2">
                        <Wrench className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{recurso.nome}</span>
                      </div>
                      <div className="flex gap-2 mt-1">
                        {recurso.linhaProducao && (
                          <Badge variant="outline" className="text-xs">
                            {recurso.linhaProducao}
                          </Badge>
                        )}
                        {recurso.grupoTrabalho && (
                          <Badge variant="secondary" className="text-xs">
                            {recurso.grupoTrabalho}
                          </Badge>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Detalhes do recurso selecionado */}
            <div className="flex-1 overflow-y-auto max-h-[60vh] p-4">
              {!selectedRecurso ? (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  Selecione um recurso para ver os detalhes
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Cabeçalho */}
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-xl font-bold">{selectedRecurso.nome}</h3>
                      <p className="text-muted-foreground">
                        {selectedRecurso.velocidadeLiquida.toLocaleString("pt-BR")} un/h
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={handleGoToRecurso}>
                        <Settings className="h-4 w-4 mr-1" />
                        Cadastro
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleGoToCapacidade}>
                        <ExternalLink className="h-4 w-4 mr-1" />
                        Capacidade
                      </Button>
                    </div>
                  </div>

                  <Separator />

                  {/* Informações do cadastro */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Informações do Cadastro</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-muted-foreground">Tipo:</span>
                          <span className="ml-2 font-medium">{selectedRecurso.tipo}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Execução:</span>
                          <span className="ml-2 font-medium">{selectedRecurso.tipoExecucao}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Linha Produção:</span>
                          <span className="ml-2 font-medium">{selectedRecurso.linhaProducao || "-"}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Grupo Trabalho:</span>
                          <span className="ml-2 font-medium">{selectedRecurso.grupoTrabalho || "-"}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Linha Produto:</span>
                          <span className="ml-2 font-medium">{selectedRecurso.linhaProduto || "-"}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Tipo Acabamento:</span>
                          <span className="ml-2 font-medium">{selectedRecurso.tipoAcabamento || "-"}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Status:</span>
                          <Badge variant={selectedRecurso.ativo ? "default" : "secondary"} className="ml-2">
                            {selectedRecurso.ativo ? "Ativo" : "Inativo"}
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Configurações de turnos */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Turnos Configurados ({new Date().getFullYear()})
                      </CardTitle>
                      <CardDescription>
                        Configuração mensal de turnos e manutenção
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {selectedRecurso.configuracoesMensais.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Nenhum turno configurado para este ano
                        </p>
                      ) : (
                        <div className="grid grid-cols-4 gap-2">
                          {MESES.map((mes) => {
                            const config = selectedRecurso.configuracoesMensais.find(
                              (c) => c.mes === mes.num
                            );
                            return (
                              <div
                                key={mes.num}
                                className={`p-2 rounded border text-center ${
                                  config?.turnoNome
                                    ? "bg-green-50 border-green-200"
                                    : "bg-muted/50"
                                }`}
                              >
                                <div className="text-xs font-medium text-muted-foreground">
                                  {mes.nome}
                                </div>
                                <div className="text-sm font-medium">
                                  {config?.turnoNome || "-"}
                                </div>
                                {config?.horasManutencao ? (
                                  <div className="text-xs text-orange-600">
                                    {config.horasManutencao}h manut.
                                  </div>
                                ) : null}
                                {config?.horasExtras ? (
                                  <div className="text-xs text-blue-600">
                                    +{config.horasExtras}h extra
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </div>

          <div className="border-t px-4 py-2 text-xs text-muted-foreground flex justify-between">
            <span>
              <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">↑↓</kbd> para navegar
              <span className="mx-2">•</span>
              <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">Enter</kbd> para selecionar
              <span className="mx-2">•</span>
              <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">Esc</kbd> para fechar
            </span>
            <span>
              Pressione <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">⌘K</kbd> para abrir
            </span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
