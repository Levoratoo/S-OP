/**
 * Tour guiado + FAQ + guias — onboarding completo do S&OP Printbag.
 * Pensado para quem entrou na empresa e não tem ninguém para ensinar.
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
  | "capacidade"
  | "vendas"
  | "producao"
  | "cadastros"
  | "integracoes"
  | "admin";

export type TourTopic = {
  id: TourTopicId;
  group: "Começar" | "Ciclo S&OP" | "Módulos" | "Configuração";
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

/** v2: força reabrir o tour completo para quem já viu a versão curta */
export const SOP_TOUR_STORAGE_KEY = "sop-tour-seen-v2";
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

/* -------------------------------------------------------------------------- */
/*  ONBOARDING COMPLETO (1º acesso) — menu + como usar cada área               */
/* -------------------------------------------------------------------------- */

export const FIRST_ACCESS_TOUR_STEPS: TourStep[] = [
  step({
    id: "intro",
    selector: '[data-tour="nav-brand"]',
    title: "Bem-vindo — o que é este sistema?",
    body:
      "Você está no Sistema S&OP (Sales & Operations Planning) da Printbag.\n\n" +
      "Ele substitui o processo mensal que antes era feito em Excel:\n" +
      "1) Preparar bases de vendas/previsto/clientes\n" +
      "2) Rodar o motor estatístico (Python)\n" +
      "3) Desagregar e colaborar com o Comercial (MTS / JITO / PV / CRM)\n" +
      "4) Confrontar demanda × capacidade\n\n" +
      "Este tour é o treinamento completo. Leia com calma, clique em Próximo e não pule se for a primeira vez.\n" +
      "Pode reabrir depois em Ajuda (menu embaixo).",
  }),
  step({
    id: "menu-mapa",
    selector: '[data-tour="nav-sidebar"]',
    title: "Mapa do menu (onde tudo mora)",
    body:
      "O menu esquerdo é o GPS do sistema. Blocos:\n\n" +
      "• Dashboard — visão geral\n" +
      "• Previsão de Demanda — colaboração, acurácia, consensos\n" +
      "• Análise de Capacidade — cálculo e confronto com demanda\n" +
      "• Gestão de Produção — metas / IROG\n" +
      "• Gestão de Vendas — faturamento, carteira, forecast\n" +
      "• Cadastros — mestres (produto, marca, turnos, fluxos…)\n" +
      "• Previsão Python — motor estatístico (o “Passo 2”)\n" +
      "• Previsão Demanda Estatística — viewer ciclo 13\n" +
      "• Integrações — SharePoint\n" +
      "• Administração — usuários e níveis\n" +
      "• Ajuda — tours e manual\n\n" +
      "Clique no nome do grupo para expandir. Vamos entrar em cada um.",
  }),
  step({
    id: "menu-search",
    selector: '[data-tour="nav-search"]',
    title: "Busca global",
    body:
      "Acima do menu há a busca. Use para achar recursos/cadastros rápido sem navegar pasta por pasta.\n\n" +
      "Dica: se não lembrar o caminho, digite o nome do recurso ou SKU.",
  }),

  // —— Dashboard ——
  navStep(
    "dash",
    "nav-dashboard",
    "Dashboard (página inicial)",
    "É a home após o login.\n\n" +
      "Use para ver atalhos e o status geral do S&OP. Não é aqui que se fecha o ciclo — o trabalho pesado está em Previsão Python + Colaboração + Capacidade × Demanda.\n\n" +
      "Como usar: entre no início do dia para se orientar; depois vá ao fluxo do mês.",
    { path: "/" }
  ),

  // —— Vendas (antes do ciclo, porque alimenta o ETL) ——
  navStep(
    "ven-grupo",
    "nav-vendas",
    "Gestão de Vendas — por que começar por aqui?",
    "Sem faturamento atualizado, a previsão estatística e a sazonalidade ficam erradas.\n\n" +
      "Ordem típica no mês:\n" +
      "1) Importar Faturamento\n" +
      "2) Conferir no Histórico\n" +
      "3) (opcional) Dashboard / Carteira / Forecast\n" +
      "4) Só então gerar bases no Previsão Python",
    { openMenu: "Gestao de Vendas" }
  ),
  navStep(
    "ven-imp",
    "nav-vendas-importar",
    "Importar Faturamento — combustível do ciclo",
    "COMO USAR\n" +
      "1. Menu → Gestão de Vendas → Importar Faturamento\n" +
      "2. Selecione o arquivo do período fechado (Excel/CSV conforme o layout da empresa)\n" +
      "3. Confirme a importação e espere concluir sem erro\n\n" +
      "QUANDO FAZER\n" +
      "Todo início de ciclo S&OP, antes de “Gerar bases” no Python.\n\n" +
      "SE DER ERRADO\n" +
      "Verifique colunas/códigos de produto. Use De-Para se o código do arquivo ≠ SKU do cadastro.",
    { path: "/vendas/importar", openMenu: "Gestao de Vendas" }
  ),
  navStep(
    "ven-hist",
    "nav-vendas-historico",
    "Histórico de Vendas — validar o que entrou",
    "COMO USAR\n" +
      "Abra após importar. Filtre por período/produto e confira se os volumes fazem sentido.\n\n" +
      "É a “prova” de que a base do ETL está boa. Se o histórico estiver vazio ou velho, não rode o Python ainda.",
    { path: "/vendas/historico", openMenu: "Gestao de Vendas" }
  ),
  navStep(
    "ven-dash",
    "nav-vendas-dashboard",
    "Dashboard Vendas",
    "Painel de indicadores comerciais.\n\n" +
      "Gestores (nível 1) veem só as marcas vinculadas em Cadastros → Gestor × Marca.\n" +
      "Gerente/Master veem tudo.\n\n" +
      "Use para acompanhamento; não substitui a Colaboração Comercial.",
    { path: "/vendas/dashboard", openMenu: "Gestao de Vendas" }
  ),
  navStep(
    "ven-cart",
    "nav-vendas-carteira",
    "Carteira de Pedidos",
    "Pedidos em carteira para cruzar com a previsão.\n\n" +
      "COMO USAR\n" +
      "Consulte o que já está vendido/comprometido e use como referência ao ajustar a grade na Colaboração (principalmente PV-MTO).",
    { path: "/vendas/carteira", openMenu: "Gestao de Vendas" }
  ),
  navStep(
    "ven-fc",
    "nav-vendas-forecast",
    "Forecast comercial",
    "Visão de forecast complementar ao motor estatístico.\n\n" +
      "Não confunda com Previsão Python: aqui é camada comercial; o motor oficial do ciclo está em Previsão Python + Colaboração.",
    { path: "/vendas/forecast", openMenu: "Gestao de Vendas" }
  ),

  // —— Cadastros críticos ——
  navStep(
    "cad-grupo",
    "nav-cadastros",
    "Cadastros — a base que ninguém pode errar",
    "Sem cadastro certo, o ciclo inteiro falha.\n\n" +
      "Seções:\n" +
      "• Comercial — gestor×marca, sazonalidade, clientes\n" +
      "• Produto — SKU, de-para, linhas, modelos…\n" +
      "• Operações — dias úteis, turnos, recursos, fluxos\n" +
      "• Geral — membros, importação em massa\n\n" +
      "Master edita cadastros. Gestor normalmente só consulta.",
    { openMenu: "Cadastros" }
  ),
  navStep(
    "cad-gm",
    "nav-cadastros-gestor-marca",
    "Gestor × Marca — quem vê o quê",
    "COMO USAR\n" +
      "1. Cadastros → Comercial → Gestor × Marca\n" +
      "2. Vincule cada usuário gestor às marcas que ele responde\n\n" +
      "EFEITO\n" +
      "Na Colaboração e Capacidade × Demanda, o gestor só enxerga essas marcas.\n\n" +
      "Se alguém disser “não vejo minha marca”, o problema quase sempre é aqui.",
    { path: "/cadastros/gestor-marca", openMenu: "Cadastros", openSection: "Comercial" }
  ),
  navStep(
    "cad-saz",
    "nav-cadastros-sazonalidade",
    "Sazonalidade Marca — % de cada mês",
    "Define quanto % do total anual da marca cai em cada mês (soma ~100%).\n\n" +
      "COMO USAR\n" +
      "• Editar mês a mês na grade\n" +
      "• Ou “Calcular do faturamento” (histórico)\n" +
      "• Ou importar Excel\n" +
      "• Ou seed uniforme (1/12) se estiver vazia\n\n" +
      "A desagregação do ciclo MULTIPLICA o total 12M por esses %.\n" +
      "Sazonalidade errada = grade comercial errada.",
    { path: "/cadastros/sazonalidade-marca", openMenu: "Cadastros", openSection: "Comercial" }
  ),
  navStep(
    "cad-cli",
    "nav-cadastros-clientes",
    "Clientes",
    "Cadastro mestre de clientes (CNPJ, status, etc.).\n\n" +
      "Entra nas bases de previsão (Clientes) e análises por cliente no workbook Python.\n" +
      "Mantenha ativos/inativos corretos.",
    { path: "/cadastros/clientes", openMenu: "Cadastros", openSection: "Comercial" }
  ),
  navStep(
    "cad-prod",
    "nav-cadastros-produtos",
    "Produtos — o SKU mestre",
    "TELA MAIS IMPORTANTE DO CADASTRO.\n\n" +
      "Confira sempre:\n" +
      "• Código (codItem / SKU)\n" +
      "• Marca e Linha (agregação Tipo-Marca-Linha)\n" +
      "• Tipo estoque MTS ou MTO (define plano na colaboração)\n" +
      "• Flag “Projetar estatística” — se OFF, o SKU não entra no motor\n" +
      "• Fluxo — liga o produto aos recursos de capacidade\n\n" +
      "COMO USAR\n" +
      "Cadastre/edite, use o switch Projetar, associe fluxo. Importe em lote se necessário.",
    { path: "/cadastros/produtos", openMenu: "Cadastros", openSection: "Produto" }
  ),
  navStep(
    "cad-depara",
    "nav-cadastros-depara",
    "De-Para de códigos",
    "Quando o código do ERP/arquivo ≠ código comercial do sistema.\n\n" +
      "COMO USAR\n" +
      "Cadastre SKU antigo → SKU novo. Sem isso, importação e ETL “perdem” volume.",
    { path: "/cadastros/depara", openMenu: "Cadastros", openSection: "Produto" }
  ),
  navStep(
    "cad-aux",
    "nav-cadastros-linhas",
    "Tabelas auxiliares de produto",
    "Status, Tipo Negócio, Tipo Estoque, Linhas, Modelos, Tamanhos.\n\n" +
      "São listas que o cadastro de Produto usa. Mantenha padronizado (mesmo nome = mesmo match na capacidade).\n\n" +
      "Ex.: linha do produto deve bater com linhaProduto do recurso.",
    { path: "/cadastros/linhas", openMenu: "Cadastros", openSection: "Produto" }
  ),
  navStep(
    "cad-dias",
    "nav-cadastros-dias-uteis",
    "Dias Úteis",
    "Calendário do ano (seg-sex, seg-sáb, 7 dias).\n\n" +
      "Alimenta o Cálculo de Capacidade.\n" +
      "COMO USAR: preencha o ano corrente (e o próximo) antes de analisar capacidade.",
    { path: "/cadastros/dias-uteis", openMenu: "Cadastros", openSection: "Operacoes" }
  ),
  navStep(
    "cad-turnos",
    "nav-cadastros-turnos",
    "Turnos",
    "Jornadas (ex.: 2/10, 3/8) e dias trabalhados.\n\n" +
      "No cálculo: horas úteis = horas do turno × nº de turnos.\n" +
      "Cadastre os turnos reais da fábrica antes de configurar recursos mensais.",
    { path: "/cadastros/turnos", openMenu: "Cadastros", openSection: "Operacoes" }
  ),
  navStep(
    "cad-rec",
    "nav-cadastros-recursos",
    "Recursos — máquinas / células",
    "Cada recurso tem linhaProduto, velocidade líquida, tipo, e configs mês a mês (turno, HE, manutenção).\n\n" +
      "COMO USAR\n" +
      "1. Cadastre o recurso\n" +
      "2. Preencha velocidade\n" +
      "3. Configure os meses no cálculo de capacidade\n\n" +
      "Depois associe recursos a um Fluxo e o Fluxo ao Produto.",
    { path: "/cadastros/recursos", openMenu: "Cadastros", openSection: "Operacoes" }
  ),
  navStep(
    "cad-fluxo",
    "nav-cadastros-fluxos",
    "Fluxos — caminho produtivo do SKU",
    "Um fluxo = sequência de recursos que o produto usa.\n\n" +
      "COMO USAR\n" +
      "1. Crie o fluxo\n" +
      "2. Associe os recursos (ordem)\n" +
      "3. No Produto, escolha esse fluxo\n\n" +
      "Na tela Capacidade × Demanda o match preferencial é: SKU → fluxo → soma da capacidade dos recursos.",
    { path: "/cadastros/fluxos", openMenu: "Cadastros", openSection: "Operacoes" }
  ),
  navStep(
    "cad-imp",
    "nav-cadastros-importacao",
    "Importação Base",
    "Carga em massa dos CSVs mestres (setup inicial ou atualização grande).\n\n" +
      "Use quando for popular ambiente novo. No dia a dia, prefira as telas de cadastro ou import específica (ex.: faturamento).",
    { path: "/cadastros/importacao-base", openMenu: "Cadastros", openSection: "Geral" }
  ),

  // —— Python ——
  navStep(
    "py-menu",
    "nav-previsao-python",
    "Previsão Python — o motor (Passo 2)",
    "Aqui roda o script estatístico (v5.7): vários modelos, backtest, Visão Executiva, total 12 meses.\n\n" +
      "FLUXO NA TELA\n" +
      "A) “Gerar bases do sistema e executar” → ETL automático + job\n" +
      "   OU upload manual das 3 planilhas (Vendas / Previsto / Clientes)\n" +
      "B) Espere status SUCCESS\n" +
      "C) Abra a visualização (analytics, MAPE, ranking de modelos)\n" +
      "D) Anote o ID do job — vai usar na Colaboração\n\n" +
      "Nunca desagregue job ERROR ou RUNNING.",
    { path: "/previsao-python" }
  ),
  step({
    id: "py-etl-btn",
    selector: '[data-tour="page-python-gerar-bases"]',
    title: "Botão: Gerar bases + executar",
    path: "/previsao-python",
    body:
      "Este botão é o Passo 1 automatizado (antigo Power Query / Estatística IA).\n\n" +
      "Ele monta as 3 bases a partir de:\n" +
      "• Faturamento importado\n" +
      "• Produtos com “Projetar estatística”\n" +
      "• Cadastros / de-para\n\n" +
      "Depois dispara o Python. Acompanhe o job na lista abaixo.",
  }),
  step({
    id: "py-jobs-list",
    selector: '[data-tour="page-python-jobs"]',
    title: "Histórico de jobs — ler o status",
    path: "/previsao-python",
    body:
      "PENDING → na fila\nRUNNING → processando (pode demorar)\nSUCCESS → pode desagregar e visualizar\nERROR → abra o log, corrija dados/ambiente e rode de novo\n\n" +
      "Clique no job SUCCESS para visualizar Visão Executiva, acurácia e cenários.\n" +
      "Guarde o número do job no e-mail/chat do ciclo do mês.",
  }),
  navStep(
    "py-c13",
    "nav-previsao-ciclo13",
    "Previsão Demanda Estatística (Ciclo 13)",
    "Entrada/viewer focada no workbook estatístico estendido.\n\n" +
      "Use quando o analista trabalha direto na planilha do motor (upload/visualização ciclo 13).\n" +
      "O fluxo operacional padrão do Comercial continua: job SUCCESS → Colaboração.",
    { path: "/previsao-python/ciclo-13" }
  ),

  // —— Demanda / Colaboração ——
  navStep(
    "dem-grupo",
    "nav-demanda",
    "Previsão de Demanda — módulo comercial",
    "Aqui mora o Passo 3 (colaboração) e as telas de acompanhamento.\n\n" +
      "Itens:\n" +
      "• Dashboard Demanda\n" +
      "• Acuracidade (do job Python)\n" +
      "• Previsões (CRUD manual — legado)\n" +
      "• Colaboração Comercial ← grade oficial do ciclo\n" +
      "• Consensos\n" +
      "• Orçamentos",
    { openMenu: "Previsao de Demanda" }
  ),
  navStep(
    "dem-dash",
    "nav-demanda-dashboard",
    "Dashboard Demanda",
    "Painel do módulo de demanda. Ponto de entrada para indicadores.\n\n" +
      "O trabalho de fechar número do mês é na Colaboração Comercial.",
    { path: "/demanda/dashboard", openMenu: "Previsao de Demanda" }
  ),
  navStep(
    "dem-acu",
    "nav-demanda-acuracidade",
    "Acuracidade — qualidade do motor",
    "COMO USAR\n" +
      "1. Selecione o job Python SUCCESS (ou deixe o mais recente)\n" +
      "2. Veja MAPE médio/mediano, acuracidade, ranking de modelos\n" +
      "3. Abra top erros e top acertos por SKU\n\n" +
      "Se não houver job, cai no fallback das previsões CRUD (menos útil).\n" +
      "Use para validar se o modelo está confiável antes de colaborar.",
    { path: "/demanda/acuracidade", openMenu: "Previsao de Demanda" }
  ),
  navStep(
    "dem-prev",
    "nav-demanda-previsoes",
    "Previsões (CRUD) — não é o motor",
    "Cadastro manual mês a mês (produto/família/valor/MAPE).\n\n" +
      "ATENÇÃO: não substitui Previsão Python.\n" +
      "Use só para ajustes pontuais/legado. O ciclo oficial é job → colaboração.",
    { path: "/demanda/previsoes", openMenu: "Previsao de Demanda" }
  ),
  navStep(
    "dem-col",
    "nav-demanda-colaboracoes",
    "Colaboração Comercial — grade do ciclo",
    "AQUI O COMERCIAL TRABALHA.\n\n" +
      "COMO USAR (passo a passo)\n" +
      "1. Pegue o ID do job Python SUCCESS\n" +
      "2. Cole / selecione e clique “Desagregar do job”\n" +
      "3. O sistema cria o ciclo: total 12M × sazonalidade marca × rateio SKU\n" +
      "4. Abas MTS / JITO / PV_MTO / CRM — edite M1…M12 (sair da célula salva)\n" +
      "5. Aba “Resumos do ciclo” — confira totais, gap vs estatística, por marca\n" +
      "6. Marque CONSOLIDADO e depois FECHADO quando o time fechar\n\n" +
      "Gestor só vê suas marcas.",
    { path: "/demanda/colaboracoes", openMenu: "Previsao de Demanda" }
  ),
  step({
    id: "dem-col-desag",
    selector: '[data-tour="page-colab-desagregar"]',
    title: "Desagregar — o botão que cria o ciclo",
    path: "/demanda/colaboracoes",
    openMenu: "Previsao de Demanda",
    body:
      "Sem desagregar, a grade fica vazia.\n\n" +
      "O motor pega Visão Executiva (Tipo-Marca-Linha / total 12M), aplica % da sazonalidade e rateia nos SKUs (preferência rateio 6 meses).\n\n" +
      "Depois você só ajusta o que o Comercial discorda da estatística.",
  }),
  step({
    id: "dem-col-grade",
    selector: '[data-tour="page-colab-grade"]',
    title: "Grade — editar MTS / JITO / PV / CRM",
    path: "/demanda/colaboracoes",
    openMenu: "Previsao de Demanda",
    body:
      "Cada aba é um plano:\n" +
      "• MTS — make to stock\n" +
      "• JITO — intermediário / just in time conforme regra\n" +
      "• PV_MTO — pedido/venda sob encomenda\n" +
      "• CRM — canal CRM (manual até PipeDrive)\n\n" +
      "Edite as células, use a busca por SKU/marca/linha.\n" +
      "Total da linha aparece à direita.",
  }),
  step({
    id: "dem-col-res",
    selector: '[data-tour="page-colab-consolidado"]',
    title: "Resumos do ciclo — fechar o número",
    path: "/demanda/colaboracoes",
    openMenu: "Previsao de Demanda",
    clickTarget: true,
    body:
      "Aba Resumos:\n" +
      "• Totais por plano e PV − CRM\n" +
      "• Por marca (colaborado vs estatística)\n" +
      "• Amostra da base ciclo mês a mês\n\n" +
      "No card Ciclo: mude para CONSOLIDADO quando o time concordar; FECHADO ao encerrar o mês.",
  }),
  navStep(
    "dem-con",
    "nav-demanda-consensos",
    "Consensos — registro do fechamento",
    "COMO USAR\n" +
      "Crie o consenso do ano/ciclo com status (Aberto → Em revisão → Aprovado → Fechado) e observações.\n\n" +
      "Os volumes oficiais continuam na Colaboração; aqui fica o rito formal do S&OP.",
    { path: "/demanda/consensos", openMenu: "Previsao de Demanda" }
  ),
  navStep(
    "dem-orc",
    "nav-demanda-orcamentos",
    "Orçamentos",
    "Camada orçamentária ligada ao planejamento.\n\n" +
      "Use conforme o processo financeiro da empresa; não substitui a grade da Colaboração.",
    { path: "/demanda/orcamentos", openMenu: "Previsao de Demanda" }
  ),

  // —— Capacidade ——
  navStep(
    "cap-grupo",
    "nav-capacidade",
    "Análise de Capacidade",
    "Depois da demanda colaborada, pergunte: a fábrica aguenta?\n\n" +
      "1) Cálculo de Capacidade (fórmula pura)\n" +
      "2) Capacidade × Demanda (confronto com o ciclo)\n" +
      "3) Dashboard Capacidade (visão geral)",
    { openMenu: "Analise de Capacidade" }
  ),
  navStep(
    "cap-calc",
    "nav-capacidade-calculo",
    "Cálculo de Capacidade — a fórmula",
    "Fórmula:\n" +
      "(dias úteis × horas úteis do turno + horas extras − manutenção) × velocidade líquida\n\n" +
      "COMO USAR\n" +
      "1. Garanta Dias Úteis + Turnos + Recursos cadastrados\n" +
      "2. Abra Cálculo, escolha o ano\n" +
      "3. Configure mês a mês (turno, HE, manutenção, velocidade)\n" +
      "4. Veja a capacidade resultante por recurso",
    { path: "/capacidade/calculo", openMenu: "Analise de Capacidade" }
  ),
  navStep(
    "cap-vs",
    "nav-capacidade-vs-demanda",
    "Capacidade × Demanda — onde dói",
    "COMO USAR\n" +
      "1. Selecione o ciclo comercial desagregado\n" +
      "2. Escolha o ano da capacidade\n" +
      "3. Leia o resumo mensal: Gap = capacidade − demanda; Estouro = demanda > capacidade\n" +
      "4. Veja por fluxo/linha e o card Match (via fluxo vs via linha)\n\n" +
      "Se não bater: confira fluxo no produto e linhaProduto no recurso.",
    { path: "/capacidade/vs-demanda", openMenu: "Analise de Capacidade" }
  ),
  navStep(
    "cap-dash",
    "nav-capacidade-dashboard",
    "Dashboard Capacidade",
    "Visão consolidada dos recursos no tempo.\n\n" +
      "Bom para apresentação; o diagnóstico fino fica em Capacidade × Demanda.",
    { path: "/capacidade/dashboard", openMenu: "Analise de Capacidade" }
  ),

  // —— Produção ——
  navStep(
    "prod-metas",
    "nav-producao-metas",
    "Metas de Produção / IROG",
    "Acompanhe disponibilidade, performance, qualidade e IROG.\n\n" +
      "É o lado chão de fábrica do S&OP — complementa capacidade, não substitui a colaboração de demanda.",
    { path: "/producao/metas", openMenu: "Gestao de Producao" }
  ),

  // —— Integrações / Admin / Ajuda ——
  navStep(
    "int-sp",
    "nav-integracao-sharepoint",
    "SharePoint",
    "COMO USAR\n" +
      "1. Configure site/pastas e credenciais\n" +
      "2. Teste conexão\n" +
      "3. Rode sync (produtos/faturamento/clientes conforme configurado)\n" +
      "4. Veja logs\n\n" +
      "PipeDrive/CRM automático ainda não está integrado — a aba CRM da colaboração é manual.",
    { path: "/integracao/sharepoint", openMenu: "Integracoes" }
  ),
  navStep(
    "adm-user",
    "nav-admin-usuarios",
    "Usuários e níveis de acesso",
    "NÍVEIS\n" +
      "1 — Gestor: só marcas vinculadas; não edita cadastros mestres\n" +
      "2 — Gerente Comercial: vê todas as marcas\n" +
      "3 — Master: tudo (cadastros, usuários, importações)\n\n" +
      "COMO USAR\n" +
      "Admin → Usuários: defina nível.\n" +
      "Cadastros → Gestor × Marca: vincule marcas ao gestor.",
    { path: "/admin/usuarios", openMenu: "Administracao" }
  ),
  navStep(
    "ajuda-fim",
    "nav-ajuda",
    "Ajuda — seu manual permanente",
    "Sempre que esquecer o fluxo:\n" +
      "• Menu → Ajuda (ou botão Ajuda no rodapé)\n" +
      "• Tours por módulo (Demanda, Python, Cadastros…)\n" +
      "• Guia escrito detalhado + FAQ\n\n" +
      "Roteiro mental do mês:\n" +
      "Importar faturamento → cadastros/sazonalidade → Previsão Python SUCCESS → Desagregar → Editar colaboração → Capacidade × Demanda → Consenso/Fechar ciclo.\n\n" +
      "Pronto. Agora você consegue operar o sistema sozinho. Boa sorte.",
    { path: "/ajuda" }
  ),
];

/* -------------------------------------------------------------------------- */
/*  Fluxo mensal enxuto (operacional)                                           */
/* -------------------------------------------------------------------------- */

export const FLUXO_MENSAL_STEPS: TourStep[] = [
  navStep(
    "fm-1",
    "nav-vendas-importar",
    "1/9 — Importar faturamento",
    "Atualize a base do período. Sem isso o ETL e a sazonalidade ficam defasados.",
    { path: "/vendas/importar", openMenu: "Gestao de Vendas" }
  ),
  navStep(
    "fm-2",
    "nav-cadastros-produtos",
    "2/9 — Conferir produtos",
    "SKU, marca, linha, MTS/MTO, “Projetar estatística” e Fluxo.",
    { path: "/cadastros/produtos", openMenu: "Cadastros", openSection: "Produto" }
  ),
  navStep(
    "fm-3",
    "nav-cadastros-sazonalidade",
    "3/9 — Sazonalidade da marca",
    "% mensais ok (editar, calcular do histórico ou importar).",
    { path: "/cadastros/sazonalidade-marca", openMenu: "Cadastros", openSection: "Comercial" }
  ),
  navStep(
    "fm-4",
    "nav-previsao-python",
    "4/9 — Gerar bases + Python",
    "“Gerar bases…” → espere SUCCESS → abra visualização → anote o ID do job.",
    { path: "/previsao-python" }
  ),
  step({
    id: "fm-4b",
    selector: '[data-tour="page-python-gerar-bases"]',
    title: "4b — Botão Gerar bases",
    path: "/previsao-python",
    body: "Clique aqui para ETL + job. Acompanhe o status na lista de jobs.",
  }),
  navStep(
    "fm-5",
    "nav-demanda-colaboracoes",
    "5/9 — Desagregar na Colaboração",
    "Cole o job SUCCESS → Desagregar → grade MTS/JITO/PV/CRM.",
    { path: "/demanda/colaboracoes", openMenu: "Previsao de Demanda" }
  ),
  step({
    id: "fm-5b",
    selector: '[data-tour="page-colab-desagregar"]',
    title: "5b — Desagregar do job",
    path: "/demanda/colaboracoes",
    openMenu: "Previsao de Demanda",
    body: "Sem este passo a grade não existe. Depois edite os meses.",
  }),
  step({
    id: "fm-6",
    selector: '[data-tour="page-colab-consolidado"]',
    title: "6/9 — Resumos e status do ciclo",
    path: "/demanda/colaboracoes",
    openMenu: "Previsao de Demanda",
    clickTarget: true,
    body: "Confira totais e gaps. Marque CONSOLIDADO → FECHADO.",
  }),
  navStep(
    "fm-7",
    "nav-demanda-acuracidade",
    "7/9 — Acuracidade do job",
    "Revise MAPE / ranking de modelos do job SUCCESS.",
    { path: "/demanda/acuracidade", openMenu: "Previsao de Demanda" }
  ),
  navStep(
    "fm-8",
    "nav-capacidade-vs-demanda",
    "8/9 — Capacidade × Demanda",
    "Ciclo + ano → meses em estouro e match por fluxo/linha.",
    { path: "/capacidade/vs-demanda", openMenu: "Analise de Capacidade" }
  ),
  navStep(
    "fm-9",
    "nav-demanda-consensos",
    "9/9 — Consenso / fechamento",
    "Registre o fechamento formal do ciclo S&OP.",
    { path: "/demanda/consensos", openMenu: "Previsao de Demanda" }
  ),
];

/* -------------------------------------------------------------------------- */
/*  Tópicos por módulo (Ajuda)                                                  */
/* -------------------------------------------------------------------------- */

export const TOUR_TOPICS: TourTopic[] = [
  {
    id: "visao-geral",
    group: "Começar",
    label: "Treinamento completo (recomendado para novato)",
    blurb: "Menu inteiro + como usar cada tela — o onboarding longo.",
    steps: FIRST_ACCESS_TOUR_STEPS,
  },
  {
    id: "fluxo-mensal",
    group: "Ciclo S&OP",
    label: "Só o roteiro do mês (9 passos)",
    blurb: "Do faturamento ao consenso — operação do ciclo.",
    steps: FLUXO_MENSAL_STEPS,
  },
  {
    id: "vendas",
    group: "Módulos",
    label: "Gestão de Vendas (detalhado)",
    blurb: "Importar, histórico, dashboard, carteira, forecast.",
    steps: FIRST_ACCESS_TOUR_STEPS.filter(s => s.id.startsWith("ven-")),
  },
  {
    id: "cadastros",
    group: "Configuração",
    label: "Cadastros (detalhado)",
    blurb: "Gestor×marca, sazonalidade, produtos, fluxos, capacidade.",
    steps: FIRST_ACCESS_TOUR_STEPS.filter(s => s.id.startsWith("cad-")),
  },
  {
    id: "python",
    group: "Ciclo S&OP",
    label: "Previsão Python (detalhado)",
    blurb: "ETL, jobs, SUCCESS, ciclo 13.",
    steps: FIRST_ACCESS_TOUR_STEPS.filter(s => s.id.startsWith("py-")),
  },
  {
    id: "colaboracao",
    group: "Ciclo S&OP",
    label: "Colaboração Comercial (detalhado)",
    blurb: "Desagregar, grade, resumos, fechar ciclo.",
    steps: FIRST_ACCESS_TOUR_STEPS.filter(s => s.id.startsWith("dem-col")),
  },
  {
    id: "demanda",
    group: "Módulos",
    label: "Módulo Previsão de Demanda",
    blurb: "Todas as telas do menu Demanda.",
    steps: FIRST_ACCESS_TOUR_STEPS.filter(s => s.id.startsWith("dem-")),
  },
  {
    id: "capacidade",
    group: "Módulos",
    label: "Capacidade (detalhado)",
    blurb: "Cálculo, confronto e dashboard.",
    steps: FIRST_ACCESS_TOUR_STEPS.filter(s => s.id.startsWith("cap-")),
  },
  {
    id: "producao",
    group: "Módulos",
    label: "Gestão de Produção",
    blurb: "Metas e IROG.",
    steps: FIRST_ACCESS_TOUR_STEPS.filter(s => s.id.startsWith("prod-")),
  },
  {
    id: "integracoes",
    group: "Configuração",
    label: "Integrações",
    blurb: "SharePoint e o que ainda é manual (CRM).",
    steps: FIRST_ACCESS_TOUR_STEPS.filter(s => s.id.startsWith("int-")),
  },
  {
    id: "admin",
    group: "Configuração",
    label: "Administração e acessos",
    blurb: "Usuários, níveis 1/2/3, gestor×marca.",
    steps: FIRST_ACCESS_TOUR_STEPS.filter(
      s => s.id.startsWith("adm-") || s.id === "cad-gm"
    ),
  },
];

export const FULL_TOUR_STEPS: TourStep[] = FIRST_ACCESS_TOUR_STEPS;

export function stepsForTopic(id: TourTopicId): TourStep[] {
  return TOUR_TOPICS.find(t => t.id === id)?.steps ?? [];
}

export function topicGroups(): Array<{ group: TourTopic["group"]; topics: TourTopic[] }> {
  const order: TourTopic["group"][] = ["Começar", "Ciclo S&OP", "Módulos", "Configuração"];
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
    question: "Acabei de entrar na empresa. Por onde começo?",
    answer:
      "1) Abra Ajuda → “Treinamento completo” e siga Próximo até o fim.\n" +
      "2) Peça a alguém o ID do último job Python SUCCESS e um ciclo de exemplo.\n" +
      "3) Rode o “Só o roteiro do mês” no próximo ciclo real.\n" +
      "4) Guarde: Importar → Cadastros → Python → Colaboração → Capacidade × Demanda.",
    tourTopicId: "visao-geral",
  },
  {
    id: "faq-ordem",
    question: "Qual a ordem correta do ciclo mensal?",
    answer:
      "1) Importar faturamento\n2) Conferir produtos + sazonalidade + projetar\n3) Previsão Python até SUCCESS\n4) Desagregar na Colaboração\n5) Editar MTS/JITO/PV/CRM e consolidar\n6) Capacidade × Demanda\n7) Consenso / fechar ciclo",
    tourTopicId: "fluxo-mensal",
  },
  {
    id: "faq-etl",
    question: "O que é “Gerar bases a partir do sistema”?",
    answer:
      "É o Passo 1 automático: monta Vendas / Previsto / Clientes que o Python espera, no lugar do Power Query “Estatística IA”.",
    tourTopicId: "python",
  },
  {
    id: "faq-desag",
    question: "Como a desagregação calcula SKU × mês?",
    answer:
      "Total 12M da Visão Executiva × % sazonalidade da marca × rateio do SKU no grupo (preferência 6M). Resultado = grade editável.",
    tourTopicId: "colaboracao",
  },
  {
    id: "faq-gestor",
    question: "Por que não vejo algumas linhas/marcas?",
    answer:
      "Nível 1 só vê marcas de Cadastros → Gestor × Marca. Confira o vínculo e o nome da marca.",
    tourTopicId: "admin",
  },
  {
    id: "faq-cap",
    question: "Capacidade × Demanda não bate — o que checar?",
    answer:
      "1) Produto tem fluxo?\n2) Fluxo tem recursos?\n3) Recursos têm capacidade no ano?\n4) Sem fluxo: linha do item ≈ linhaProduto do recurso.",
    tourTopicId: "capacidade",
  },
  {
    id: "faq-pipedrive",
    question: "Onde entra o PipeDrive / CRM?",
    answer:
      "A aba CRM na colaboração é edição manual. Integração automática com PipeDrive ainda não está ligada.",
  },
];

export const GUIDE_ARTICLES: GuideArticle[] = [
  {
    id: "g-novo",
    group: "Começar do zero",
    title: "Manual do novato — primeiros 7 dias",
    summary: "Checklist se você acabou de entrar e ninguém pode treinar.",
    path: "/ajuda",
    tourTopicId: "visao-geral",
    body: `DIA 1
• Rode o “Treinamento completo” no tour (Ajuda).
• Anote quem é Master, quem é Gestor, e quais marcas existem.

DIA 2
• Abra Produtos e entenda MTS/MTO, Projetar estatística e Fluxo.
• Abra Sazonalidade Marca e veja os %.

DIA 3–4
• Acompanhe (ou simule) um ciclo: Importar → Python → Desagregar.
• Compare um SKU na grade com o Excel antigo, se ainda existir.

DIA 5
• Capacidade × Demanda: entenda estouro e match.
• Peça o “job SUCCESS de referência” do último mês.

DIA 6–7
• Feche um consenso de teste.
• Atualize este guia se o processo da fábrica diferir do texto.`,
  },
  {
    id: "g-fluxo",
    group: "Ciclo operacional",
    title: "Fluxo mensal S&OP (visão do operador)",
    summary: "Roteiro do dia a dia no sistema.",
    tourTopicId: "fluxo-mensal",
    body: `1. Vendas → Importar Faturamento
2. Cadastros → Produtos (projetar, fluxo) + Sazonalidade
3. Previsão Python → Gerar bases → SUCCESS → visualizar
4. Demanda → Colaboração → Desagregar → editar → Resumos → CONSOLIDADO/FECHADO
5. Capacidade → Capacidade × Demanda
6. Demanda → Consensos
7. Demanda → Acuracidade (qualidade do job)

Guarde o ID do job SUCCESS no chat do ciclo.`,
  },
  {
    id: "g-python",
    group: "Ciclo operacional",
    title: "Previsão Python — motor estatístico",
    summary: "ETL, jobs e Visão Executiva.",
    path: "/previsao-python",
    tourTopicId: "python",
    body: `Gerar bases = Passo 1.
Job SUCCESS = único válido para desagregar.
Visualização = MAPE, modelos, riscos/oportunidades.
Ciclo-13 = viewer alternativo do workbook.

Erro comum: desagregar sem SUCCESS; Python da venv ausente no servidor.`,
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
Resumos: gap vs estatística, PV−CRM, por marca.
Status do ciclo: CONSOLIDADO → FECHADO.`,
  },
  {
    id: "g-cap",
    group: "Ciclo operacional",
    title: "Capacidade e Capacidade × Demanda",
    summary: "Fórmula e confronto.",
    path: "/capacidade/vs-demanda",
    tourTopicId: "capacidade",
    body: `Cálculo depende de Dias Úteis, Turnos e Recursos.
Confronto: fluxo do produto (preferencial) ou linha × linhaProduto.
Estouro = demanda > capacidade no mês.`,
  },
  {
    id: "g-cad",
    group: "Fundamentos",
    title: "Cadastros que o ciclo exige",
    summary: "O que precisa estar certo.",
    tourTopicId: "cadastros",
    body: `Obrigatórios: Produtos, Sazonalidade, Faturamento, Recursos+Turnos+Dias, Gestor×Marca (se houver gestores).
Úteis: De-Para, Clientes, Fluxos, Importação Base.`,
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
  {
    id: "g-integracoes",
    group: "Telas do menu",
    title: "Integrações e pendências",
    summary: "SharePoint ok; PipeDrive pendente.",
    tourTopicId: "integracoes",
    body: `SharePoint: sync conforme pastas.
CRM/PipeDrive: aba manual na colaboração; integração automática futura.`,
  },
];
