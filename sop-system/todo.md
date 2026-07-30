# Sistema S&OP - TODO

## Fase 1: Estrutura Base
- [x] Schema do banco de dados (todas as tabelas)
- [x] Configuração de rotas tRPC base

## Fase 2: Layout e Navegação
- [x] Layout principal com sidebar (estilo Easy360)
- [x] Menu de navegação com módulos
- [ ] Tema escuro/claro

## Fase 3: Cadastros Base
- [x] CRUD de Famílias
- [x] CRUD de Subfamílias
- [x] CRUD de Produtos
- [x] CRUD de Clientes

## Fase 4: Cadastros Comerciais e Capacidade
- [x] CRUD de Recursos
- [x] CRUD de Dias Úteis
- [x] CRUD de Roteiros
- [x] CRUD de Hierarquias
- [x] CRUD de Membros
- [x] CRUD de Paradas

## Fase 5: Vendas e Importação
- [x] Tela de histórico de vendas
- [ ] Importação de vendas (CSV/Excel)
- [ ] Carteira de pedidos
- [ ] Forecast

## Fase 6: Dashboards
- [x] Dashboard de Demanda
- [x] Dashboard de Capacidade
- [x] Dashboard de Vendas
- [ ] Dashboard de Produção
- [ ] Indicadores (MAPE, WMAPE, IROG)

## Melhorias Futuras
- [ ] Módulo de Colaborações
- [ ] Módulo de Consenso
- [ ] Previsão de demanda com ML
- [ ] Relatórios exportáveis
- [ ] Integração com ERP

## Fase 7: Importação de Vendas
- [x] Backend para upload de arquivos CSV/Excel
- [x] Parsing e validação de dados
- [x] Interface de importação com preview
- [x] Mapeamento de colunas
- [x] Inserção em lote no banco de dados


## Fase 8: Importação e Edição de Produtos
- [x] Atualizar schema de produtos com novos campos (Cod Item, Tipo Negocio, Tipo Estoque, Linha, Modelo, Tamanho, AXLXP, Marca, Grupo, Ramo Atuação, Valor Venda, Valor Custo, Qtde Pallet, Lote Economico Viável, Fluxo, Caminho, Pista)
- [x] Criar interface de importação de produtos via Excel
- [x] Atualizar tela de edição de produtos com novos campos
- [x] Template para download
- [x] Preview dos dados antes de importar


## Fase 9: Tabelas Auxiliares de Cadastro
- [x] Criar tabela Status (Ativo, Inativo)
- [x] Criar tabela Tipo Negócio (JIT, PRG, VAR)
- [x] Criar tabela Tipo Estoque (MTS, MTO)
- [x] Criar tabela Linha (Adicionais, Automática, Classic, Elegance, Evolution, Guardanapo, Saco Fundo Q, Saco Fundo V, Serviço)
- [x] Criar tabela Modelo (Adicionais, Caixa, Saco, Sacola, Serviço, Envelope)
- [x] Criar rotas e funções de banco para todas as tabelas
- [x] Criar telas de cadastro com importação Excel e edição direta
- [x] Adicionar menu de acesso às tabelas auxiliares


## Fase 10: Vincular Tabelas Auxiliares aos Produtos
- [x] Adicionar campos de referência (statusId, tipoNegocioId, tipoEstoqueId, linhaId, modeloId) na tabela de produtos
- [x] Atualizar tela de produtos com dropdowns dinâmicos para Status, Tipo Negócio, Tipo Estoque, Linha e Modelo
- [x] Carregar opções de cada dropdown das respectivas tabelas auxiliares


## Fase 11: Tabela Auxiliar de Tamanhos
- [x] Criar tabela de tamanhos no banco de dados
- [x] Criar rotas e funções de banco para tamanhos
- [x] Adicionar tamanhos na tela de tabelas auxiliares
- [x] Vincular campo tamanho ao cadastro de produtos como dropdown


## Fase 12: Relacionamento Gestor x Marca e De-Para de Códigos
- [x] Criar tabela auxiliar de Marcas
- [x] Criar tabela auxiliar de Gestores Comerciais
- [x] Criar tabela de relacionamento Gestor x Marca
- [x] Criar tela de gerenciamento Gestor x Marca
- [x] Criar tabela De-Para de códigos de item
- [x] Criar tela de gerenciamento De-Para
- [x] Implementar lógica de consolidação de histórico de vendas


## Fase 13: Integração De-Para e Marca nos Produtos
- [x] Integrar lógica De-Para nos dashboards de vendas (consolidar histórico por código atual)
- [x] Adicionar campo marcaId na tabela de produtos
- [x] Criar dropdown de Marcas no cadastro de produtos
- [x] Atualizar rotas de produtos para incluir marcaId


## Fase 14: Integração SharePoint - Sincronização Automática
- [x] Criar tabela de configuração do SharePoint (credenciais Azure AD)
- [x] Criar tabela de logs de sincronização
- [x] Implementar serviço de conexão com Microsoft Graph API
- [x] Criar funções para download de arquivos do SharePoint
- [x] Implementar processamento de arquivos Excel (produtos, faturamento, clientes)
- [x] Criar job de sincronização automática (intervalo configurável, padrão 6h)
- [x] Desenvolver tela de configuração do SharePoint
- [x] Desenvolver painel de status e histórico de sincronizações
- [x] Adicionar botão de sincronização manual


## Fase 15: Gerenciamento de Usuários e Níveis de Acesso
- [x] Criar tabela de níveis de acesso (Gestor, Gerente Comercial, Master)
- [x] Criar tabela de relacionamento usuário-marca
- [x] Atualizar tabela de usuários com campo de nível de acesso
- [x] Implementar rotas de gerenciamento de usuários
- [x] Implementar lógica de controle de acesso por nível
- [x] Desenvolver tela de gerenciamento de usuários
- [x] Desenvolver tela de associação usuário-marca
- [x] Aplicar filtros automáticos por marca nos dashboards (Nível 1)
- [x] Restringir acesso a cadastros (somente Nível 3)
- [x] Adicionar menu de Administração no sistema

## Fase 16: Cadastro de Novos Usuários
- [x] Adicionar botão de incluir novo usuário
- [x] Criar formulário de cadastro de usuário
- [x] Implementar rota de backend para criar usuário
- [x] Testar funcionalidade de cadastro

## Fase 17: Exclusão e Edição de Usuários
- [x] Adicionar botão de excluir usuário com confirmação
- [x] Implementar rota de backend para excluir usuário
- [x] Adicionar dialog de edição de dados do usuário (nome e email)
- [x] Implementar rota de backend para atualizar dados do usuário
- [x] Testar funcionalidades

## Fase 18: Filtro por Nível de Acesso
- [x] Adicionar dropdown de filtro por nível de acesso
- [x] Implementar lógica de filtragem combinada (nome/email + nível)
- [x] Testar funcionalidade

## Fase 19: Cadastro e Gerenciamento de Marcas
- [x] Criar rotas de backend para CRUD de marcas (criar, editar, excluir)
- [x] Criar página de gerenciamento de marcas
- [x] Adicionar funcionalidade de criar nova marca
- [x] Adicionar funcionalidade de editar marca existente
- [x] Adicionar funcionalidade de excluir marca
- [x] Adicionar link no menu de Administração
- [x] Testar funcionalidades

## Fase 20: Importação de Marcas em Lote
- [x] Adicionar botão de importar na página de marcas
- [x] Criar componente de upload de arquivo Excel/CSV
- [x] Implementar parser de Excel/CSV no frontend
- [x] Criar interface de pré-visualização dos dados
- [x] Implementar validação de dados antes da importação
- [x] Usar rota existente de importBatch para salvar
- [x] Testar funcionalidade com arquivo de exemplo

## Fase 21: Filtro por Status de Marcas
- [x] Adicionar dropdown de filtro por status (Todas, Ativas, Inativas)
- [x] Implementar lógica de filtragem combinada (busca + status)
- [x] Testar funcionalidade

## Fase 22: Reorganização do Menu de Cadastros
- [x] Remover Hierarquias e Famílias do menu
- [x] Criar submenu Cadastros Comerciais (Gestor x Marca, Clientes)
- [x] Criar submenu Cadastro Produtos (Produtos, De-Para, Status, Tipo Negócio, Tipo Estoque, Linhas, Modelos, Tamanhos)
- [x] Criar submenu Cadastros Operação (Paradas, Roteiros, Dias úteis, Recursos)
- [x] Criar submenu Cadastro Gerais (Membros)
- [x] Criar telas de cadastro para: Status, Tipo Negócio, Tipo Estoque, Linhas, Modelos, Tamanhos
- [x] Testar navegação

## Fase 23: Reorganização Hierárquica do Menu Cadastros
- [x] Criar seção principal Cadastros com subseções
- [x] Subseção Comercial: Gestor x Marca, Clientes
- [x] Subseção Produto: Produtos, De-Para, Status, Tipo Negócio, Tipo Estoque, Linhas, Modelos, Tamanhos
- [x] Subseção Operações: Paradas, Roteiros, Dias Úteis, Recursos
- [x] Subseção Geral: Membros
- [x] Testar navegação

## Fase 24: Drill Down nas Subseções de Cadastros
- [x] Adicionar estado de expansão para cada subseção
- [x] Implementar seta indicadora de expansão/recolhimento
- [x] Testar funcionalidade

## Fase 25: Remover Marcas do Menu Administração
- [x] Remover link de Marcas do menu Administração

## Fase 26: Ajustes de Layout e Cores
- [x] Deixar subseções de Cadastros recolhidas por padrão
- [x] Aplicar cores da Printbag (azul escuro #0d4f8b e verde #2ecc71)
- [x] Testar visual

## Fase 27: Cadastros Recolhido e Logo Printbag
- [x] Recolher seção Cadastros por padrão
- [x] Inserir logo da Printbag no header do software

## Fase 28: Favicon Personalizado
- [x] Configurar folha verde da Printbag como favicon

## Fase 29: Exportar para CSV
- [x] Criar função utilitária de exportação CSV
- [x] Adicionar botão em Gestor x Marca
- [x] Adicionar botão em Clientes
- [x] Adicionar botão em Produtos
- [x] Adicionar botão em De-Para
- [x] Adicionar botão em Status
- [x] Adicionar botão em Tipo Negócio
- [x] Adicionar botão em Tipo Estoque
- [x] Adicionar botão em Linhas
- [x] Adicionar botão em Modelos
- [x] Adicionar botão em Tamanhos
- [x] Adicionar botão em Paradas
- [x] Adicionar botão em Roteiros
- [x] Adicionar botão em Dias Úteis
- [x] Adicionar botão em Recursos
- [x] Adicionar botão em Membros

## Fase 30: Atualizar Cadastros Rápidos no Dashboard
- [x] Substituir "Famílias" por "Marcas" nos Cadastros Rápidos

## Fase 31: Editar e Excluir em Todas as Tabelas
- [x] Verificar quais tabelas não possuem botões de editar/excluir
- [x] Adicionar funcionalidade de editar em tabelas faltantes (DiasUteis)
- [x] Adicionar funcionalidade de excluir em tabelas faltantes (DiasUteis)
- [x] Testar funcionalidades

## Fase 32: Ajustes em Dias Úteis, Turnos e Recursos
- [x] Remover campos Horas Semanais e Turnos da tabela Dias Úteis
- [x] Criar interface para cadastrar 12 meses de uma vez em Dias Úteis
- [x] Criar tabela de Turnos (s/ turno, 1/8, 2/8, 3/8, 1/10, 2/10, 3/10, 12/36) com horas de trabalho
- [x] Adicionar tela de cadastro de Turnos no menu Operações
- [x] Reestruturar tabela de Recursos: Nome, Tipo (Intermediário/Acabamento), Linha do Produto
- [x] Criar tabela de configuração mensal de Recursos (mês, turno, horas)
- [x] Criar interface de seleção de turnos por mês para cada recurso
- [x] Testar funcionalidades

## Fase 33: Reorganização de Cadastros Operações
- [x] Remover Paradas do menu de Operações
- [x] Reordenar menu: Dias Úteis (1º), Turnos (2º), Recursos (3º), Fluxo (4º)
- [x] Atualizar Turnos com campos: Turno/Hora, Horas trabalho, Horas refeição, Dias Trabalhados, Hora Extra?
- [x] Atualizar Recursos com campos: Tipo, Tipo Execução, Tipo Acabamento, Linha Produção, Linha Produto, Grupo Trabalho, Nome Recurso
- [x] Criar tabela de Fluxo com seleção de recursos e coluna unificada
- [x] Inserir dados iniciais de turnos conforme tabela (s/ turno, Comercial, 1/8, 2/8, 3/8, 1/10, 2/10, 12/36)
- [x] Testar funcionalidades

## Fase 34: Inserção de Dados Iniciais de Recursos
- [x] Inserir 39 recursos conforme tabela de referência
- [x] Verificar dados inseridos

## Fase 35: Cadastro de Fluxos e Associação de Recursos
- [x] Cadastrar 62 fluxos (Fluxo 01 a Fluxo 64 + Fluxo 1000)
- [x] Associar recursos a cada fluxo conforme matriz de referência
- [x] Melhorar interface de Fluxos para seleção de recursos
- [x] Testar funcionalidades

## Fase 36: Ajustes em Gestores e Marcas
- [x] Gestores: manter apenas Nome e E-mail (remover telefone, status e ações)
- [x] Marcas: campos Nome da Marca, Grupo da Marca e Status da Marca
- [x] Relacionamento: selecionar Marca e associar ao Gestor
- [x] Testar funcionalidades

## Fase 37: Correção de Erro ao Criar Gestor
- [x] Investigar erro ao criar gestor (tabelas gestores e gestor_marca não existiam)
- [x] Corrigir problema identificado (criadas tabelas no banco de dados)
- [x] Testar funcionalidade (gestor criado com sucesso)

## Fase 38: Funcionalidades de Editar e Excluir Gestores
- [x] Adicionar rotas de edição e exclusão de gestores no backend (já existiam)
- [x] Atualizar interface de Gestores com botões de editar e excluir
- [x] Testar funcionalidades (edição de João Silva para João Silva Santos funcionou)

## Fase 39: Editar/Excluir Marcas e Busca de Gestores
- [x] Adicionar botões de editar e excluir na aba Marcas (já existiam)
- [x] Adicionar campo de busca para filtrar gestores por nome
- [x] Testar funcionalidades (edição de Arezzo com grupo Premium funcionou, busca de gestores funcionou)

## Fase 40: Confirmação de Exclusão em Gestores e Marcas
- [x] Adicionar dialog de confirmação antes de excluir gestor
- [x] Adicionar dialog de confirmação antes de excluir marca
- [x] Testar funcionalidades (dialogs de confirmação funcionando corretamente)

## Fase 41: Confirmação de Exclusão em Todas as Tabelas
- [x] Identificar todas as tabelas com função de exclusão (20 componentes)
- [x] Implementar dialog de confirmação em cada tabela:
  - Famílias, Clientes, Recursos, Dias Úteis, Roteiros, Hierarquias, Membros, Paradas
  - Tabelas Auxiliares (Status, Tipos Negócio, Tipos Estoque, Linhas, Modelos, Tamanhos)
  - De-Para Códigos, Produtos, Relacionamento Gestor-Marca
  - Já implementados: Gestores, Marcas, Turnos, Fluxos, Usuários, Gerenciamento Marcas
- [x] Testar funcionalidades

## Fase 42: Correção e Simplificação da Tabela De-Para
- [x] Investigar e corrigir erro na tabela De-Para (tabela não existia no banco)
- [x] Simplificar tabela para apenas SKU Antigo e SKU Novo (remover demais campos)
- [x] Testar funcionalidades (criação de De-Para funcionando)

## Fase 43: Correção de Erro na Tabela Status
- [x] Investigar erro ao criar novo item na tabela Status (tabela status_cadastro não existia)
- [x] Corrigir problema identificado (criada tabela no banco de dados)
- [x] Testar funcionalidade (status "Ativo" criado com sucesso)

## Fase 44: Correção de Tabelas Auxiliares Faltantes
- [x] Verificar tabela Tipos de Negócio (criada e testada)
- [x] Verificar tabela Tipos de Estoque (criada e testada)
- [x] Verificar tabela Linhas (criada e testada)
- [x] Verificar tabela Modelos (criada e testada)
- [x] Verificar tabela Tamanhos (criada e testada)
- [x] Criar tabelas faltantes no banco de dados (adicionada coluna ordem em todas)
- [x] Testar funcionalidades (todas funcionando corretamente)

## Fase 45: Ramo de Atuação em Marcas e Preenchimento Automático em Produtos
- [x] Adicionar campo Ramo de Atuação na tabela de Marcas
- [x] Atualizar interface de Marcas para exibir e editar Ramo de Atuação
- [x] Atualizar cadastro de Produtos para preencher Grupo e Ramo automaticamente ao selecionar marca
- [x] Testar funcionalidades (Nike com Grupo=Esportivo e Ramo=Calçados preencheu automaticamente)

## Fase 46: Correção de Erro na Tabela de Produtos
- [x] Adicionar coluna ramoAtuacao na tabela de produtos
- [x] Testar funcionalidade (página de produtos carregando corretamente)

## Fase 47: Correção de Colunas Faltantes na Tabela de Produtos
- [x] Verificar estrutura da tabela produtos
- [x] Adicionar colunas faltantes (codItem, descricao, statusId, tipoNegocio, tipoNegocioId, tipoEstoqueId, linha, linhaId, modelo, modeloId, tamanho, tamanhoId, axlxp, marca, marcaId, grupo, valorVenda, valorCusto, qtdePallet, loteEconomicoViavel, fluxo, caminho, pista, codigo, nome, familiaId, subfamiliaId, unidade)
- [x] Modificar colunas codigo e nome para permitir NULL
- [x] Testar funcionalidade (criação de produto via interface funcionando)

## Fase 48: Melhorias em Fluxos e Integração com Produtos
- [x] Adicionar interface de flag (checkbox) para recursos na tabela Fluxo (já existia - checkboxes funcionando com contador de recursos selecionados)
- [x] Vincular Fluxo ao cadastro de Produtos (dropdown de seleção com fluxoId adicionado ao schema)
- [x] Preencher automaticamente campo Caminho com recursos do fluxo selecionado (handleFluxoChange implementado)
- [x] Testar funcionalidades (dropdown mostra fluxos com quantidade de recursos, caminho preenchido automaticamente)

## Fase 49: Melhorias na Listagem e Importação de Produtos
- [x] Adicionar coluna Fluxo na tabela de listagem de produtos
- [x] Atualizar template de importação Excel para incluir coluna Fluxo (já existia no template)
- [x] Implementar parser de Fluxo na importação (já existia no COLUMN_MAPPING)
- [x] Adicionar filtro por Fluxo na lista de produtos (dropdown com lista dinâmica)
- [x] Adicionar campo de busca por código, descrição ou marca
- [x] Testar funcionalidades (filtro e busca funcionando corretamente)

## Fase 50: Melhorias na Configuração de Turnos dos Recursos
- [x] Adicionar botão "Limpar Tudo" para remover todas as seleções de turnos (com confirmação)
- [x] Adicionar botão "Fechar" no dialog de configuração (as configurações são salvas automaticamente ao selecionar)
- [x] Testar funcionalidades (limpar tudo e fechar funcionando corretamente)

## Fase 51: Campos para Cálculo de Capacidade
- [x] Adicionar campo "Velocidade Líquida" na tabela Recursos (coluna velocidadeLiquida no schema e banco)
- [x] Adicionar campo "Horas de Manutenção" na configuração mensal (coluna horasManutencao em recursos_mensais)
- [x] Atualizar interface de cadastro de recursos para incluir Velocidade Líquida (formulário e tabela)
- [x] Atualizar interface de configuração mensal para incluir Horas de Manutenção (campo aparece após selecionar turno)
- [x] Testar funcionalidades (campos funcionando e salvando corretamente)

## Fase 52: Velocidade Líquida Mensal e Importação de Recursos
- [x] Adicionar coluna velocidadeLiquida na tabela recursos_mensais
- [x] Atualizar backend para salvar velocidade líquida mensal (rota saveConfig atualizada)
- [x] Atualizar interface de configuração mensal para exibir/editar velocidade líquida (campo un/h por mês)
- [x] Replicar valor padrão do recurso ao configurar turno (velocidade do recurso é copiada ao selecionar turno)
- [x] Implementar importação de recursos via Excel (abas Lista e Importar, com template e preview)
- [x] Testar funcionalidades (configuração mensal e importação funcionando corretamente)

## Fase 53: Ajuste de Layout na Configuração de Turnos
- [x] Aumentar tamanho dos cards de configuração mensal (padding e espaçamento maiores)
- [x] Melhorar visualização de Turno, Horas de Manutenção e Velocidade Líquida (labels, campos maiores, horas/dia em destaque)
- [x] Testar funcionalidade (layout mais organizado e legível)

## Fase 54: Ajuste de Largura dos Cards de Configuração de Turnos
- [x] Aumentar largura dos cards mensais (min-w-[240px])
- [x] Reorganizar campos H. Manutenção e Vel. Líquida lado a lado (grid-cols-2)
- [x] Aumentar dialog para max-w-6xl
- [x] Testar funcionalidade (layout mais organizado e legível)

## Fase 55: Aumentar Largura do Dialog de Configuração de Turnos
- [x] Aumentar largura do dialog para 1400px (max-w-[95vw] w-[1400px])
- [x] Mudar layout para 4 colunas de cards
- [x] Empilhar campos H. Manutenção e Vel. Líquida verticalmente
- [x] Garantir que todos os campos sejam visíveis sem corte
- [x] Testar funcionalidade (layout mais espaçoso e legível)

## Fase 56: Expandir Dialog de Configuração de Turnos para Tela Cheia
- [x] Aumentar largura do dialog para ocupar 98% da viewport (!max-w-[98vw] !w-[98vw])
- [x] Usar !important para sobrescrever o sm:max-w-lg do componente base
- [x] Testar funcionalidade (dialog ocupando quase toda a tela, cards espaçosos)

## Fase 57: Adicionar Horas Trabalhadas na Tabela de Turnos
- [x] Adicionar coluna horasTrabalhadas no schema de turnos (Horas Trabalho - Horas Refeição)
- [x] Atualizar backend para calcular/salvar horasTrabalhadas
- [x] Atualizar interface de cadastro de turnos para exibir horasTrabalhadas (campo readonly calculado)
- [x] Atualizar exibição na configuração de recursos para mostrar "horas úteis/dia"
- [x] Atualizar dropdown de turnos para mostrar horas trabalhadas entre parênteses
- [x] Atualizar registros existentes no banco de dados
- [x] Testar funcionalidades (tabela de turnos e configuração de recursos funcionando)

## Fase 58: Aplicar Turno em Lote
- [x] Adicionar dropdown para selecionar turno a aplicar em todos os meses
- [x] Adicionar botão "Aplicar a Todos" ao lado do dropdown
- [x] Implementar lógica para salvar o mesmo turno em todos os 12 meses (com velocidade padrão do recurso)
- [x] Testar funcionalidade (turno aplicado a todos os meses com sucesso)

## Fase 59: Tela de Cálculo de Capacidade
- [ ] Criar rota backend para cálculo de capacidade (dias úteis × horas úteis - h.manutenção) × velocidade líquida
- [ ] Criar página de Cálculo de Capacidade no frontend
- [ ] Adicionar rota dentro do menu Análise de Capacidade
- [ ] Implementar filtros por ano, linha de produção e grupo de trabalho
- [ ] Adicionar totalizadores por linha/grupo
- [ ] Testar funcionalidades


## Fase 54: Tela de Cálculo de Capacidade
- [x] Criar página de Cálculo de Capacidade em /capacidade/calculo
- [x] Implementar fórmula: (Dias úteis × Horas úteis - H. Manutenção) × Velocidade Líquida
- [x] Criar tabela com recursos nas linhas e meses nas colunas
- [x] Adicionar filtros por Ano, Linha de Produção e Grupo de Trabalho
- [x] Exibir cards de resumo (Total Recursos, Capacidade Total, Média Mensal, Dias Úteis)
- [x] Mostrar dias úteis por mês no cabeçalho das colunas
- [x] Linha de totais no rodapé da tabela
- [x] Adicionar item no menu "Análise de Capacidade"
- [x] Criar função listRecursosMensais no db.ts
- [x] Criar rota capacidade.calcular no router
- [x] Inserir dados de dias úteis para 2025
- [x] Criar testes unitários para validar o cálculo
- [x] Testar funcionalidade com dados reais


## Fase 55: Ajuste de Dias Úteis por Tipo de Turno
- [x] Analisar turnos cadastrados e suas regras de dias trabalhados
- [x] Ajustar cálculo de capacidade para considerar dias do turno (seg-sex, seg-sab, 7 dias)
- [x] Calcular dias úteis para 2026 considerando calendário brasileiro
- [x] Inserir dias úteis para 2026 (seg-sex, seg-sab, 7 dias)
- [x] Testar funcionalidade com diferentes turnos


## Fase 56: Filtros Adicionais no Cálculo de Capacidade
- [x] Adicionar filtro de Linha de Produto
- [x] Adicionar filtro de Tipo Acabamento
- [x] Permitir filtrar por ambos campos simultaneamente
- [x] Testar filtros combinados


## Fase 57: Ajuste de Dias Úteis por Turno e Hora Extra
- [x] Verificar e corrigir mapeamento de dias trabalhados por turno (1/8, 2/8, 3/8 = seg-sab; 1/10, 2/10 = seg-sex)
- [x] Validar cálculo: Dias trabalhados × Horas trabalhadas × Velocidade líquida
- [x] Adicionar campo de hora extra na configuração mensal de recursos
- [x] Atualizar interface de configuração de recursos para incluir hora extra
- [x] Atualizar cálculo de capacidade para considerar hora extra
- [x] Inserir dias úteis para 2025 e 2026 por tipo (seg-sex, seg-sab, 7-dias)
- [x] Testar funcionalidades


## Fase 58: Correção do Multiplicador de Turnos no Cálculo de Capacidade
- [x] Analisar estrutura dos turnos e identificar multiplicador (1/8 = 1 turno, 2/8 = 2 turnos, etc.)
- [x] Ajustar cálculo para multiplicar horas pelo número de turnos
- [x] Alterar filtro padrão da tela de Cálculo de Capacidade para 2026
- [x] Testar com recurso Miraflex (2/10 = 2 turnos × 9h = 18h/dia)
- [x] Validar cálculo: 22 dias × 18 horas × 51.064 = 20.221.344 un/mês


## Fase 59: Ajustar Layout da Tabela de Cálculo de Capacidade
- [x] Remover colunas Linha e Grupo da tabela
- [x] Ajustar largura das colunas para mostrar 12 meses + Total sem scroll horizontal
- [x] Testar visualização


## Fase 60: Melhorar Visualização da Tabela de Capacidade
- [x] Aumentar tamanho da fonte da tabela
- [x] Adicionar cor verde claro para meses com maior capacidade
- [x] Adicionar cor vermelho claro para meses com menor capacidade
- [x] Testar visualização


## Fase 61: Ajustar Layout dos Filtros
- [x] Colocar labels acima dos campos de filtro
- [x] Alinhar todos os filtros em uma única linha
- [x] Testar visualização


## Fase 61: Ajustar Layout dos Filtros
- [x] Colocar labels acima dos campos de filtro
- [x] Alinhar todos os filtros em uma única linha
- [x] Testar visualização


## Fase 62: Pesquisa Global de Recursos
- [x] Criar componente de pesquisa global no DashboardLayout
- [x] Implementar backend para busca de recursos com informações relacionadas
- [x] Criar modal/painel de resultados com informações do recurso (turnos, cadastro, capacidade)
- [x] Testar funcionalidade de busca
