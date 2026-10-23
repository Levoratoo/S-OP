import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useHelpTour } from "@/help/HelpTourContext";
import {
  FIRST_ACCESS_TOUR_STEPS,
  FLUXO_MENSAL_STEPS,
  FULL_TOUR_STEPS,
  GUIDE_ARTICLES,
  HELP_FAQ,
  TOUR_TOPICS,
  stepsForTopic,
  type TourTopicId,
} from "@/help/sop-tour-content";
import { BookOpen, CircleHelp, Play, Search } from "lucide-react";
import { useLocation } from "wouter";

export default function Ajuda() {
  const { startTour, openHelpModal } = useHelpTour();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [openArticleId, setOpenArticleId] = useState<string | null>(GUIDE_ARTICLES[0]?.id ?? null);

  const filteredArticles = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return GUIDE_ARTICLES;
    return GUIDE_ARTICLES.filter(
      a =>
        a.title.toLowerCase().includes(term) ||
        a.summary.toLowerCase().includes(term) ||
        a.body.toLowerCase().includes(term) ||
        a.group.toLowerCase().includes(term)
    );
  }, [search]);

  const groups = useMemo(() => {
    const map = new Map<string, typeof GUIDE_ARTICLES>();
    for (const article of filteredArticles) {
      if (!map.has(article.group)) map.set(article.group, []);
      map.get(article.group)!.push(article);
    }
    return Array.from(map.entries());
  }, [filteredArticles]);

  const runTopic = (id: TourTopicId) => startTour(stepsForTopic(id));

  return (
    <div className="mx-auto max-w-5xl space-y-6" data-tour="page-ajuda">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <CircleHelp className="h-7 w-7 text-primary" />
            Ajuda &amp; Guia do Sistema
          </h1>
          <p className="mt-1 text-muted-foreground">
            Manual do fluxo de Previsão de Demanda — tours na tela + guias do ciclo mensal.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={openHelpModal}>
            Abrir painel rápido
          </Button>
          <Button onClick={() => startTour(FLUXO_MENSAL_STEPS)}>
            <Play className="mr-2 h-4 w-4" />
            Iniciar ciclo mensal
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="cursor-pointer hover:border-primary/40" onClick={() => startTour(FIRST_ACCESS_TOUR_STEPS)}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Treinamento completo</CardTitle>
            <CardDescription>~15 passos — só o fluxo de Previsão de Demanda</CardDescription>
          </CardHeader>
        </Card>
        <Card className="cursor-pointer hover:border-primary/40" onClick={() => startTour(FLUXO_MENSAL_STEPS)}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Roteiro do mês</CardTitle>
            <CardDescription>6 passos: faturamento → Python → colaboração</CardDescription>
          </CardHeader>
        </Card>
        <Card className="cursor-pointer hover:border-primary/40" onClick={() => startTour(FULL_TOUR_STEPS)}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Relançar treinamento</CardTitle>
            <CardDescription>Mesmo tour do 1º acesso (se pulou ou quer revisar)</CardDescription>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tours por tema</CardTitle>
          <CardDescription>Clique para destacar na tela onde o operador deve clicar</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {TOUR_TOPICS.map(topic => (
            <button
              key={topic.id}
              type="button"
              onClick={() => runTopic(topic.id)}
              className="rounded-lg border px-3 py-3 text-left hover:bg-accent"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{topic.label}</span>
                <Badge variant="outline">{topic.group}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{topic.blurb}</p>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-4 w-4" />
            Guia escrito (detalhado)
          </CardTitle>
          <CardDescription>
            Leia com calma — é a referência para quem assumir o processo
          </CardDescription>
          <div className="relative pt-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar no guia…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {groups.map(([group, articles]) => (
            <div key={group} className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {group}
              </p>
              {articles.map(article => {
                const open = openArticleId === article.id;
                return (
                  <div key={article.id} className="rounded-xl border">
                    <button
                      type="button"
                      className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left"
                      onClick={() => setOpenArticleId(open ? null : article.id)}
                    >
                      <div>
                        <p className="font-semibold">{article.title}</p>
                        <p className="text-sm text-muted-foreground">{article.summary}</p>
                      </div>
                      <Badge variant="secondary">{open ? "Fechar" : "Abrir"}</Badge>
                    </button>
                    {open ? (
                      <div className="space-y-3 border-t px-4 py-4">
                        <pre className="whitespace-pre-wrap font-sans text-sm leading-6 text-muted-foreground">
                          {article.body}
                        </pre>
                        <div className="flex flex-wrap gap-2">
                          {article.path ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setLocation(article.path!)}
                            >
                              Ir para a tela
                            </Button>
                          ) : null}
                          {article.tourTopicId ? (
                            <Button size="sm" onClick={() => runTopic(article.tourTopicId!)}>
                              <Play className="mr-1 h-3.5 w-3.5" />
                              Tour deste tema
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
          {filteredArticles.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">Nenhum artigo para essa busca.</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">FAQ</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {HELP_FAQ.map(item => (
            <div key={item.id} className="rounded-lg border p-3">
              <p className="font-medium">{item.question}</p>
              <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{item.answer}</p>
              {item.tourTopicId ? (
                <Button
                  size="sm"
                  variant="link"
                  className="mt-1 h-auto px-0"
                  onClick={() => runTopic(item.tourTopicId!)}
                >
                  Ver tour relacionado
                </Button>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
