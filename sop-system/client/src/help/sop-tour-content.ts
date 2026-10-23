/**
 * Tour + FAQ + guias — escopo: Previsão de Demanda (passo a passo Excel → software).
 */

export type TourStep = {
  id: string;
  selector: string;
  title: string;
  body: string;
  path?: string;
  openMenu?: string;
  openSection?: string;
  clickTarget?: boolean;
  waitMs?: number;
};

export type TourTopicId =
  | "visao-geral"
  | "fluxo-mensal"
  | "demanda"
  | "python"
  | "colaboracao"
  | "cadastros"
  | "admin";

export type TourTopic = {
  id: TourTopicId;
  group: "Começar" | "Ciclo S&OP" | "Configuração";
  label: string;
  blurb: string;
  steps: TourStep[];
};

export type FaqItem = {
  id: string;
  question: string;
  answer: string;
  tourTopicId?: TourTopicId;
};

export type GuideArticle = {
  id: string;
  group: string;
  title: string;
  summary: string;
  path?: string;
  tourTopicId?: TourTopicId;
  body: string;
};

/** v3: escopo só Previsão de Demanda */
export const SOP_TOUR_STORAGE_KEY = "sop-tour-seen-v3";
export const SOP_TOUR_FORCE_ALWAYS = false;

export function sopTourStorageKey(userId: string) {
  return `${SOP_TOUR_STORAGE_KEY}:u:${userId}`;
}

function step(partial: TourStep): TourStep {
  return { waitMs: 420, ...partial };
}

function navStep(
  id: string,
  tourId: string,
  title: string,
  body: string,
  opts: { path?: string; openMenu?: string; openSection?: string } = {}
): TourStep {
  return step({
    id,
    selector: `[data-tour="${tourId}"]`,
    title,
    body,
    ...opts,
  });
}

export const FIRST_ACCESS_TOUR_STEPS: TourStep[] = [
  step({
    id: "intro",
    selector: '[data-tour="nav-brand"]',
    title: "Previsão de Demanda — Printbag",
    body:
      "Este sistema cobre o processo mensal que antes era Excel + script Python:\n" +
      "1) Cadastros (Produto, De-Para, Sazonalidade)\n" +
      "2) Atualizar bases de faturamento\n" +
      "3) Rodar o motor estatístico (Python v5.2)\n" +
      "4) Abrir ciclo e colaborar (MTS / JITO / PV / CRM)",
  }),
  navStep(
    "dash",
    "nav-dashboard",
    "Dashboard",
    "Visão rápida do ciclo e atalhos para cada etapa do passo a passo.",
    { path: "/" }
  ),
  navStep(
    "dem-menu",
    "nav-demanda",
    "Menu Previsão de Demanda",
    "Aqui está o fluxo operacional numerado: Bases → Python → Relatório → Colaboração.",
    { openMenu: "Previsao de Demanda" }
  ),
  navStep(
    "ven-imp",
    "nav-vendas-importar",
    "1. Bases / Faturamento",
    "Atualize o faturamento (ERP ou Excel) de Jan/2020 até o mês fechado anterior. Equivale às querys do “1 - Estatística IA”.",
    { path: "/vendas/importar", openMenu: "Previsao de Demanda" }
  ),
  navStep(
    "py",
    "nav-previsao-python",
    "2. Rodar Previsão Python",
    "Botão “Gerar bases + executar script”: trata faturamento × cadastros e roda o Python v5.2.",
    { path: "/previsao-python", openMenu: "Previsao de Demanda" }
  ),
  navStep(
    "py-ciclo",
    "nav-previsao-ciclo13",
    "3. Relatório Estatístico",
    "Equivalente ao “relatorio_previsao_demanda_…xlsx” — use principalmente a Visão Executiva.",
    { path: "/previsao-python/ciclo-13", openMenu: "Previsao de Demanda" }
  ),
  navStep(
    "dem-col",
    "nav-demanda-colaboracoes",
    "4. Colaboração Comercial",
    "Desagrega o job SUCCESS e abre o ciclo para o Comercial (MTS, JITO, PV, CRM).",
    { path: "/demanda/colaboracoes", openMenu: "Previsao de Demanda" }
  ),
  navStep(
    "dem-acu",
    "nav-demanda-acuracidade",
    "Acuracidade",
    "Previsto × realizado (MAPE, WMAPE, BIAS) — qualidade do modelo.",
    { path: "/demanda/acuracidade", openMenu: "Previsao de Demanda" }
  ),
  navStep(
    "ven-cart",
    "nav-vendas-carteira",
    "Carteira / PV",
    "Base de pedidos em aberto (PV). No Excel vinha de PV + Grid / Pedidos em Aberto S&OP.",
    { path: "/vendas/carteira", openMenu: "Previsao de Demanda" }
  ),
  navStep(
    "cad-menu",
    "nav-cadastros",
    "Cadastros",
    "Comercial (Gestor × Marca, Sazonalidade) e Produto (Produtos, De-Para, Família…).",
    { openMenu: "Cadastros" }
  ),
  navStep(
    "cad-prod",
    "nav-cadastros-produtos",
    "Produtos",
    "Cadastro de SKUs. Marque “Projetar estatística” nos itens que entram no script (Skus Projetar).",
    { path: "/cadastros/produtos", openMenu: "Cadastros", openSection: "Produto" }
  ),
  navStep(
    "cad-depara",
    "nav-cadastros-depara",
    "De-Para",
    "Mapeia SKUs antigos → atuais. Obrigatório antes de rodar a previsão.",
    { path: "/cadastros/depara", openMenu: "Cadastros", openSection: "Produto" }
  ),
  navStep(
    "cad-fam",
    "nav-cadastros-familias",
    "Família",
    "Famílias de produto — no Excel era a aba Família oculto do arquivo de colaboração.",
    { path: "/cadastros/familias", openMenu: "Cadastros", openSection: "Produto" }
  ),
  navStep(
    "cad-gm",
    "nav-cadastros-gestor-marca",
    "Gestor × Marca",
    "Quem responde por cada marca na colaboração comercial.",
    { path: "/cadastros/gestor-marca", openMenu: "Cadastros", openSection: "Comercial" }
  ),
  navStep(
    "cad-saz",
    "nav-cadastros-sazonalidade",
    "Sazonalidade Marca",
    "Rateio % mês a mês por marca — usado na desagregação 12M.",
    { path: "/cadastros/sazonalidade-marca", openMenu: "Cadastros", openSection: "Comercial" }
  ),
  navStep(
    "adm",
    "nav-admin-usuarios",
    "Usuários",
    "Níveis de acesso (Gestor / Gerente / Master).",
    { path: "/admin/usuarios", openMenu: "Administracao" }
  ),
  navStep(
    "ajuda",
    "nav-ajuda",
    "Ajuda",
    "Tours e guias deste fluxo. Pode reabrir quando precisar.",
    { path: "/ajuda" }
  ),
];

export const FLUXO_MENSAL_STEPS: TourStep[] = [
  navStep(
    "f1",
    "nav-vendas-importar",
    "Passo 1 — Faturamento",
    "Atualize a base até o mês fechado anterior.",
    { path: "/vendas/importar", openMenu: "Previsao de Demanda" }
  ),
  navStep(
    "f2",
    "nav-cadastros-produtos",
    "Passo 2 — Produtos / projetar",
    "Confira De-Para e quais SKUs projetam estatística.",
    { path: "/cadastros/produtos", openMenu: "Cadastros", openSection: "Produto" }
  ),
  navStep(
    "f3",
    "nav-cadastros-sazonalidade",
    "Passo 3 — Sazonalidade",
    "Valide % da marca (revisão anual; novas marcas usam similar).",
    { path: "/cadastros/sazonalidade-marca", openMenu: "Cadastros", openSection: "Comercial" }
  ),
  navStep(
    "f4",
    "nav-previsao-python",
    "Passo 4 — Python",
    "Gerar bases + executar até STATUS SUCCESS.",
    { path: "/previsao-python", openMenu: "Previsao de Demanda" }
  ),
  navStep(
    "f5",
    "nav-demanda-colaboracoes",
    "Passo 5 — Colaboração",
    "Desagregar do job e habilitar o Comercial no ciclo.",
    { path: "/demanda/colaboracoes", openMenu: "Previsao de Demanda" }
  ),
  navStep(
    "f6",
    "nav-demanda-acuracidade",
    "Passo 6 — Acuracidade",
    "Revise qualidade do modelo do ciclo.",
    { path: "/demanda/acuracidade", openMenu: "Previsao de Demanda" }
  ),
];

export const TOUR_TOPICS: TourTopic[] = [
  {
    id: "visao-geral",
    group: "Começar",
    label: "Treinamento do fluxo",
    blurb: "Menu e telas do processo de Previsão de Demanda.",
    steps: FIRST_ACCESS_TOUR_STEPS,
  },
  {
    id: "fluxo-mensal",
    group: "Ciclo S&OP",
    label: "Roteiro do mês",
    blurb: "Do faturamento à colaboração.",
    steps: FLUXO_MENSAL_STEPS,
  },
  {
    id: "python",
    group: "Ciclo S&OP",
    label: "Previsão Python",
    blurb: "ETL + script v5.2.",
    steps: FIRST_ACCESS_TOUR_STEPS.filter(s => s.id.startsWith("py")),
  },
  {
    id: "colaboracao",
    group: "Ciclo S&OP",
    label: "Colaboração Comercial",
    blurb: "Ciclo MTS / JITO / PV / CRM.",
    steps: FIRST_ACCESS_TOUR_STEPS.filter(s => s.id.startsWith("dem-col")),
  },
  {
    id: "demanda",
    group: "Ciclo S&OP",
    label: "Menu Previsão de Demanda",
    blurb: "Bases, Python, relatório e colaboração.",
    steps: FIRST_ACCESS_TOUR_STEPS.filter(
      s => s.id.startsWith("dem-") || s.id.startsWith("ven-") || s.id.startsWith("py")
    ),
  },
  {
    id: "cadastros",
    group: "Configuração",
    label: "Cadastros do processo",
    blurb: "Produto, De-Para, Família, Sazonalidade, Gestor × Marca.",
    steps: FIRST_ACCESS_TOUR_STEPS.filter(s => s.id.startsWith("cad-")),
  },
  {
    id: "admin",
    group: "Configuração",
    label: "Administração",
    blurb: "Usuários e acessos.",
    steps: FIRST_ACCESS_TOUR_STEPS.filter(s => s.id.startsWith("adm")),
  },
];

export const FULL_TOUR_STEPS: TourStep[] = FIRST_ACCESS_TOUR_STEPS;

export function stepsForTopic(id: TourTopicId): TourStep[] {
  return TOUR_TOPICS.find(t => t.id === id)?.steps ?? [];
}

export function topicGroups(): Array<{ group: TourTopic["group"]; topics: TourTopic[] }> {
  const order: TourTopic["group"][] = ["Começar", "Ciclo S&OP", "Configuração"];
  return order
    .map(group => ({
      group,
      topics: TOUR_TOPICS.filter(t => t.group === group),
    }))
    .filter(g => g.topics.length > 0);
}

export const HELP_FAQ: FaqItem[] = [
  {
    id: "faq-novo",
    question: "Acabei de entrar. Por onde começo?",
    answer:
      "1) Ajuda → Treinamento do fluxo\n2) Peça o ID do último job Python SUCCESS\n3) No próximo ciclo, rode o Roteiro do mês",
    tourTopicId: "visao-geral",
  },
  {
    id: "faq-ordem",
    question: "Qual a ordem do ciclo mensal?",
    answer:
      "1) Importar faturamento\n2) Conferir Produtos + De-Para + projetar + sazonalidade\n3) Previsão Python até SUCCESS\n4) Desagregar na Colaboração\n5) Editar MTS/JITO/PV/CRM e consolidar",
    tourTopicId: "fluxo-mensal",
  },
  {
    id: "faq-etl",
    question: "O que é “Gerar bases a partir do sistema”?",
    answer:
      "Monta Vendas / Previsto / Clientes que o Python espera — substitui o Power Query do “Estatística IA”.",
    tourTopicId: "python",
  },
  {
    id: "faq-desag",
    question: "Como a desagregação calcula SKU × mês?",
    answer:
      "Total 12M da Visão Executiva × % sazonalidade da marca × rateio do SKU no grupo.",
    tourTopicId: "colaboracao",
  },
  {
    id: "faq-gestor",
    question: "Por que não vejo algumas marcas?",
    answer:
      "Nível 1 só vê marcas de Cadastros → Gestor × Marca. Confira o vínculo.",
    tourTopicId: "admin",
  },
  {
    id: "faq-pipedrive",
    question: "Onde entra o PipeDrive / CRM?",
    answer:
      "Aba CRM na colaboração ainda é edição manual. Integração automática com PipeDrive ainda não está ligada.",
    tourTopicId: "colaboracao",
  },
  {
    id: "faq-skus",
    question: "O que é Skus Projetar?",
    answer:
      "Só SKUs com “Projetar estatística” no cadastro de Produtos entram no script de demanda. No Excel era a aba Skus Projetar.",
    tourTopicId: "cadastros",
  },
];

export const GUIDE_ARTICLES: GuideArticle[] = [
  {
    id: "g-novo",
    group: "Começar",
    title: "Manual do fluxo de Previsão de Demanda",
    summary: "O que este sistema cobre (e o que ficou de fora).",
    path: "/ajuda",
    tourTopicId: "visao-geral",
    body: `ESCOPO (Passo a Passo Word)
• Cadastros: Produtos, Skus Projetar, De-Para, Família, Gestor×Marca, Sazonalidade
• Bases / Faturamento
• Gerar Previsão (1 botão = sync + ETL + Python)
• Colaboração Comercial + Carteira/PV

ARQUIVADOS (menu Arquivados)
• Dashboard, Acuracidade, auxiliares de produto, Importação Base, etc.`,
  },
  {
    id: "g-fluxo",
    group: "Ciclo operacional",
    title: "Fluxo mensal (operador)",
    summary: "Roteiro do dia a dia.",
    tourTopicId: "fluxo-mensal",
    body: `1. Cadastros (Produtos / Skus Projetar / De-Para / Sazonalidade)
2. Bases / Faturamento (mês fechado)
3. Previsão de Demanda → Gerar Previsão (um clique)
4. Job SUCCESS → Abrir novo ciclo S&OP
5. Colaboração Comercial

Guarde o ID do job SUCCESS no chat do ciclo.`,
  },
  {
    id: "g-python",
    group: "Ciclo operacional",
    title: "Previsão Python — motor estatístico",
    summary: "ETL, jobs e Visão Executiva.",
    path: "/previsao-python",
    tourTopicId: "python",
    body: `Gerar bases = tratamento faturamento × cadastros.
Job SUCCESS = único válido para desagregar.
Visualização = MAPE, modelos, riscos/oportunidades.`,
  },
  {
    id: "g-colab",
    group: "Ciclo operacional",
    title: "Colaboração Comercial",
    summary: "Desagregação e edição dos planos.",
    path: "/demanda/colaboracoes",
    tourTopicId: "colaboracao",
    body: `Planos: MTS, JITO, PV_MTO, CRM.
Blur na célula salva.
Status: ABERTO → CONSOLIDADO → FECHADO.`,
  },
  {
    id: "g-cad",
    group: "Fundamentos",
    title: "Cadastros do processo",
    summary: "O que precisa estar certo.",
    tourTopicId: "cadastros",
    body: `Obrigatórios: Produtos (projetar), De-Para, Sazonalidade, Faturamento, Gestor × Marca.
Úteis: Família, Clientes, Importação Base.`,
  },
  {
    id: "g-acessos",
    group: "Fundamentos",
    title: "Níveis de acesso",
    summary: "Gestor, Gerente, Master.",
    path: "/admin/usuarios",
    tourTopicId: "admin",
    body: `1 Gestor — marcas vinculadas
2 Gerente — todas as marcas
3 Master — tudo
Configure em Usuários + Gestor × Marca.`,
  },
];
