import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { ChevronDown, CircleHelp, X } from "lucide-react";
import { useLocation } from "wouter";
import {
  FIRST_ACCESS_TOUR_STEPS,
  FLUXO_MENSAL_STEPS,
  FULL_TOUR_STEPS,
  HELP_FAQ,
  SOP_TOUR_FORCE_ALWAYS,
  SOP_TOUR_STORAGE_KEY,
  stepsForTopic,
  topicGroups,
  sopTourStorageKey,
  type TourStep,
} from "./sop-tour-content";

type Rect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

function readTourSeen(userId: string): boolean {
  try {
    return window.localStorage.getItem(sopTourStorageKey(userId)) === "1";
  } catch {
    return true;
  }
}

function markTourSeen(userId: string) {
  try {
    window.localStorage.setItem(sopTourStorageKey(userId), "1");
    window.localStorage.removeItem(SOP_TOUR_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function clearTourSeen(userId: string) {
  try {
    window.localStorage.removeItem(sopTourStorageKey(userId));
    window.localStorage.removeItem(SOP_TOUR_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function isMobileViewport() {
  return window.matchMedia("(max-width: 1023px)").matches;
}

function measureTarget(selector: string): Rect | null {
  const el = document.querySelector(selector);
  if (!(el instanceof HTMLElement)) return null;

  el.scrollIntoView({
    block: isMobileViewport() ? "nearest" : "center",
    inline: "nearest",
  });

  const box = el.getBoundingClientRect();
  if (box.width < 2 || box.height < 2) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const visibleWidth = Math.min(box.right, vw - 4) - Math.max(box.left, 4);
  const visibleHeight = Math.min(box.bottom, vh - 4) - Math.max(box.top, 4);
  if (visibleWidth < 24 || visibleHeight < 18) return null;

  const pad = isMobileViewport() ? 4 : 6;
  return {
    top: Math.max(8, box.top - pad),
    left: Math.max(8, box.left - pad),
    width: Math.min(vw - 16, box.width + pad * 2),
    height: Math.min(vh - 16, box.height + pad * 2),
  };
}

function placeTooltip(rect: Rect | null, mobile: boolean): CSSProperties {
  if (mobile) {
    return {
      opacity: 1,
      left: 12,
      right: 12,
      width: "auto",
      bottom: "max(12px, env(safe-area-inset-bottom))",
      top: "auto",
    };
  }

  const tipWidth = Math.min(420, window.innerWidth - 24);
  const tipHeight = Math.min(420, Math.round(window.innerHeight * 0.55));
  const gap = 12;

  if (!rect) {
    return {
      opacity: 1,
      width: tipWidth,
      top: Math.max(16, window.innerHeight * 0.18),
      left: Math.max(12, (window.innerWidth - tipWidth) / 2),
    };
  }

  const preferRight = rect.left + rect.width + gap + tipWidth < window.innerWidth - 8;
  const spaceAbove = rect.top - gap;
  const spaceBelow = window.innerHeight - (rect.top + rect.height) - gap;
  const preferAbove = spaceAbove >= tipHeight || spaceAbove >= spaceBelow;

  let left = preferRight
    ? rect.left + rect.width + gap
    : Math.max(12, rect.left + rect.width / 2 - tipWidth / 2);
  const alignedTop = rect.top + Math.min(12, Math.max(0, rect.height * 0.08));
  let top = preferRight
    ? alignedTop
    : preferAbove
      ? Math.max(12, rect.top - tipHeight - gap)
      : rect.top + rect.height + gap;

  left = Math.min(Math.max(12, left), window.innerWidth - tipWidth - 12);
  top = Math.min(Math.max(12, top), window.innerHeight - tipHeight - 12);

  return { opacity: 1, width: tipWidth, top, left };
}

export function SopHelpButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-tour="help-button"
      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 text-xs font-semibold text-primary hover:bg-primary/15"
      aria-label="Ajuda e tours"
      title="Ajuda e tours"
    >
      <CircleHelp className="h-4 w-4" aria-hidden />
      <span>Ajuda</span>
    </button>
  );
}

type SopTourProps = {
  ready: boolean;
  userId: string;
  helpOpen: boolean;
  onHelpOpenChange: (open: boolean) => void;
  ensureMenuOpen: (menuLabel: string, sectionLabel?: string) => void;
  onStartTourRef?: React.MutableRefObject<((steps: TourStep[]) => void) | null>;
};

export function SopTour({
  ready,
  userId,
  helpOpen,
  onHelpOpenChange,
  ensureMenuOpen,
  onStartTourRef,
}: SopTourProps) {
  const [, setLocation] = useLocation();
  const [active, setActive] = useState(false);
  const [steps, setSteps] = useState<TourStep[]>(FIRST_ACCESS_TOUR_STEPS);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [mobile, setMobile] = useState(false);
  const [helpTab, setHelpTab] = useState<"faq" | "tours">("tours");
  const [openFaqId, setOpenFaqId] = useState<string | null>(HELP_FAQ[0]?.id ?? null);
  const [tooltipStyle, setTooltipStyle] = useState<CSSProperties>({ opacity: 0 });

  const ensureMenuOpenRef = useRef(ensureMenuOpen);
  const setLocationRef = useRef(setLocation);
  ensureMenuOpenRef.current = ensureMenuOpen;
  setLocationRef.current = setLocation;

  const startTour = useCallback(
    (nextSteps: TourStep[]) => {
      if (!nextSteps.length) return;
      onHelpOpenChange(false);
      setSteps(nextSteps);
      setStepIndex(0);
      setActive(true);
    },
    [onHelpOpenChange]
  );

  useEffect(() => {
    if (onStartTourRef) onStartTourRef.current = startTour;
  }, [onStartTourRef, startTour]);

  const finish = useCallback(() => {
    if (!SOP_TOUR_FORCE_ALWAYS) {
      markTourSeen(userId);
    }
    setActive(false);
  }, [userId]);

  useEffect(() => {
    const sync = () => setMobile(isMobileViewport());
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  useEffect(() => {
    if (!ready || !userId) return;
    if (SOP_TOUR_FORCE_ALWAYS) {
      clearTourSeen(userId);
    } else if (readTourSeen(userId)) {
      return;
    }
    const timer = window.setTimeout(() => {
      startTour(FIRST_ACCESS_TOUR_STEPS);
    }, 700);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, userId]);

  useEffect(() => {
    if (helpOpen) {
      setActive(false);
      setHelpTab("tours");
      setOpenFaqId(HELP_FAQ[0]?.id ?? null);
    }
  }, [helpOpen]);

  useEffect(() => {
    if (!active && !helpOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active, helpOpen]);

  const step = steps[stepIndex];

  useEffect(() => {
    if (!active || !step) return;
    if (step.openMenu) {
      ensureMenuOpenRef.current(step.openMenu, step.openSection);
    }
    if (step.path) {
      setLocationRef.current(step.path);
    }
    if (step.clickTarget) {
      const timer = window.setTimeout(() => {
        const el = document.querySelector(step.selector);
        if (el instanceof HTMLElement) el.click();
      }, 220);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [active, step]);

  const updateLayout = useCallback(() => {
    if (!active || !step) return;
    const next = measureTarget(step.selector);
    setRect(next);
    setTooltipStyle(placeTooltip(next, isMobileViewport()));
  }, [active, step]);

  useLayoutEffect(() => {
    if (!active || !step) return;
    const base = step.waitMs ?? 380;
    const delay = step.openMenu || step.path ? Math.max(base, 450) : base;
    const timer = window.setTimeout(updateLayout, delay);
    const retry = window.setTimeout(updateLayout, delay + 280);
    const retry2 = window.setTimeout(updateLayout, delay + 600);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(retry);
      window.clearTimeout(retry2);
    };
  }, [active, stepIndex, step, updateLayout]);

  useEffect(() => {
    if (!active) return;
    const onResize = () => updateLayout();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    window.visualViewport?.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
      window.visualViewport?.removeEventListener("resize", onResize);
    };
  }, [active, updateLayout]);

  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        finish();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, finish]);

  const groups = topicGroups();
  const isLast = stepIndex >= steps.length - 1;
  const isFirst = stepIndex <= 0;
  const progress = steps.length ? `${stepIndex + 1}/${steps.length}` : "";

  return (
    <>
      {helpOpen ? (
        <div
          className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Ajuda S&OP"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/70 backdrop-blur-[2px]"
            aria-label="Fechar"
            onClick={() => onHelpOpenChange(false)}
          />
          <div className="relative z-10 flex max-h-[min(92dvh,780px)] w-full sm:max-w-lg flex-col overflow-hidden rounded-t-[28px] sm:rounded-3xl border border-border bg-card text-card-foreground shadow-2xl pb-[env(safe-area-inset-bottom)]">
            <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-muted sm:hidden" />

            <div className="shrink-0 px-5 pb-3 pt-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 pr-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
                    Ajuda
                  </p>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight">
                    Como usar o S&OP
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => onHelpOpenChange(false)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-muted-foreground hover:bg-accent"
                  aria-label="Fechar"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <p className="mt-2 text-sm leading-5 text-muted-foreground">
                Tours na tela ou FAQ. Guia escrito completo em Menu → Ajuda.
              </p>

              <div
                className="mt-4 flex rounded-xl bg-muted p-1"
                role="tablist"
                aria-label="Seções da ajuda"
              >
                {(
                  [
                    { id: "tours" as const, label: "Tours guiados" },
                    { id: "faq" as const, label: "Perguntas frequentes" },
                  ] as const
                ).map(tab => {
                  const on = helpTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={on}
                      onClick={() => setHelpTab(tab.id)}
                      className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                        on
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t px-3 py-3">
              {helpTab === "faq" ? (
                <div className="space-y-2">
                  {HELP_FAQ.map(item => {
                    const open = openFaqId === item.id;
                    return (
                      <div key={item.id} className="rounded-2xl border bg-background">
                        <button
                          type="button"
                          onClick={() => setOpenFaqId(open ? null : item.id)}
                          className="flex w-full items-start gap-3 px-3.5 py-3.5 text-left"
                          aria-expanded={open}
                        >
                          <span className="min-w-0 flex-1 text-sm font-semibold leading-5">
                            {item.question}
                          </span>
                          <ChevronDown
                            className={`mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                              open ? "rotate-180" : ""
                            }`}
                            aria-hidden
                          />
                        </button>
                        {open ? (
                          <div className="space-y-3 border-t px-3.5 pb-3.5 pt-2.5">
                            <p className="whitespace-pre-line text-sm leading-5 text-muted-foreground">
                              {item.answer}
                            </p>
                            {item.tourTopicId ? (
                              <button
                                type="button"
                                onClick={() => startTour(stepsForTopic(item.tourTopicId!))}
                                className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-4 text-xs font-bold text-primary-foreground"
                              >
                                Ver na tela (tour)
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => startTour(FIRST_ACCESS_TOUR_STEPS)}
                      className="w-full rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3.5 text-left hover:bg-primary/15"
                    >
                      <span className="block text-[15px] font-semibold">
                        Treinamento completo (novato)
                      </span>
                      <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">
                        ~45 passos: cada item do menu + como usar a tela (recomendado no 1º dia).
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => startTour(FLUXO_MENSAL_STEPS)}
                      className="w-full rounded-2xl border px-4 py-3.5 text-left hover:bg-accent"
                    >
                      <span className="block text-[15px] font-semibold">
                        Só o roteiro do mês
                      </span>
                      <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">
                        6 passos: faturamento → cadastros → Python → colaboração.
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => startTour(FULL_TOUR_STEPS)}
                      className="w-full rounded-2xl border border-dashed px-4 py-3 text-left text-sm hover:bg-accent"
                    >
                      <span className="font-semibold">Relançar treinamento completo</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        Mesmo tour do 1º acesso — use se pulou ou precisa revisar.
                      </span>
                    </button>
                  </div>

                  <div className="mt-5 space-y-4">
                    {groups
                      .map(({ group, topics }) => ({
                        group,
                        // Evita repetir os atalhos já destacados acima.
                        topics: topics.filter(
                          topic => topic.id !== "visao-geral" && topic.id !== "fluxo-mensal"
                        ),
                      }))
                      .filter(({ topics }) => topics.length > 0)
                      .map(({ group, topics }) => (
                        <div key={group}>
                          <p className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                            {group}
                          </p>
                          <div className="space-y-1">
                            {topics.map(topic => (
                              <button
                                key={topic.id}
                                type="button"
                                onClick={() => startTour(topic.steps)}
                                className="w-full rounded-xl border border-transparent px-3 py-3 text-left hover:border-border hover:bg-accent"
                              >
                                <span className="block text-sm font-semibold">{topic.label}</span>
                                <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">
                                  {topic.blurb}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onHelpOpenChange(false);
                      setLocation("/ajuda");
                    }}
                    className="mb-2 mt-4 w-full rounded-2xl border border-dashed px-4 py-3 text-left text-sm hover:bg-accent"
                  >
                    <span className="font-semibold">Abrir guia escrito completo</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      Página Ajuda com cada módulo detalhado (ideal para handoff).
                    </span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {active && step ? (
        <div
          className="fixed inset-0 z-[80]"
          role="dialog"
          aria-modal="true"
          aria-label={`Tour: ${step.title}`}
        >
          {rect ? (
            <div
              className="pointer-events-none absolute rounded-2xl border-2 border-primary bg-transparent"
              style={{
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: Math.min(
                  rect.height,
                  mobile ? Math.max(48, window.innerHeight * 0.42) : rect.height
                ),
                boxShadow:
                  "0 0 0 9999px rgba(0,0,0,0.62), 0 0 0 2px hsl(var(--primary) / 0.55), 0 12px 40px hsl(var(--primary) / 0.25)",
              }}
            />
          ) : (
            <div className="absolute inset-0 bg-black/60" />
          )}

          <div
            className={`absolute z-10 border bg-card text-card-foreground shadow-2xl transition-opacity duration-150 ${
              mobile
                ? "max-h-[min(62dvh,520px)] overflow-y-auto overscroll-contain rounded-[22px] p-4 pb-3"
                : "max-h-[min(70dvh,520px)] overflow-y-auto rounded-2xl p-4"
            }`}
            style={tooltipStyle}
          >
            {mobile ? <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-muted" /> : null}
            <div className="mb-2 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
                  {progress}
                </p>
                <h2 className="mt-1 text-[17px] font-semibold tracking-tight sm:text-lg">
                  {step.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={finish}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-muted-foreground hover:bg-accent"
                aria-label="Fechar tour"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <p className="whitespace-pre-line text-sm leading-5 text-muted-foreground">
              {step.body}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {isFirst ? (
                <button
                  type="button"
                  onClick={finish}
                  className="h-11 rounded-full px-3.5 text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  Pular
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setStepIndex(index => Math.max(0, index - 1))}
                  className="h-11 rounded-full px-3.5 text-sm font-medium hover:bg-accent"
                >
                  Voltar
                </button>
              )}
              <div className="ml-auto flex items-center gap-1.5">
                {!isFirst ? (
                  <button
                    type="button"
                    onClick={finish}
                    className="h-11 rounded-full px-3 text-xs font-medium text-muted-foreground"
                  >
                    Pular
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    if (isLast) {
                      finish();
                      return;
                    }
                    setStepIndex(index => index + 1);
                  }}
                  className="inline-flex h-11 min-w-[7.25rem] items-center justify-center rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground"
                >
                  {isLast ? "Concluir" : "Próximo"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
