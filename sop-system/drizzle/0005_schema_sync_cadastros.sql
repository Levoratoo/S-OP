-- Sync schema.ts → DB (tabelas/colunas faltantes após evolução do app sem migrations)

-- USERS
ALTER TABLE `users` ADD COLUMN `nivelAcesso` int NOT NULL DEFAULT 3;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `ativo` boolean NOT NULL DEFAULT true;
--> statement-breakpoint

-- PRODUTOS (legado → schema atual)
ALTER TABLE `produtos` MODIFY COLUMN `codigo` varchar(50) NULL;
--> statement-breakpoint
ALTER TABLE `produtos` MODIFY COLUMN `nome` varchar(200) NULL;
--> statement-breakpoint
ALTER TABLE `produtos` ADD COLUMN `statusId` int;
--> statement-breakpoint
ALTER TABLE `produtos` ADD COLUMN `tipoNegocioId` int;
--> statement-breakpoint
ALTER TABLE `produtos` ADD COLUMN `tipoEstoqueId` int;
--> statement-breakpoint
ALTER TABLE `produtos` ADD COLUMN `linhaId` int;
--> statement-breakpoint
ALTER TABLE `produtos` ADD COLUMN `modeloId` int;
--> statement-breakpoint
ALTER TABLE `produtos` ADD COLUMN `tamanhoId` int;
--> statement-breakpoint
ALTER TABLE `produtos` ADD COLUMN `marcaId` int;
--> statement-breakpoint
ALTER TABLE `produtos` ADD COLUMN `fluxoId` int;
--> statement-breakpoint
ALTER TABLE `produtos` MODIFY COLUMN `caminho` text;
--> statement-breakpoint

-- RECURSOS (legado → schema atual)
ALTER TABLE `recursos` ADD COLUMN `tipo` enum('Intermediário','Acabamento') NOT NULL DEFAULT 'Intermediário';
--> statement-breakpoint
ALTER TABLE `recursos` ADD COLUMN `tipoExecucao` enum('Interno','Externo') NOT NULL DEFAULT 'Interno';
--> statement-breakpoint
ALTER TABLE `recursos` ADD COLUMN `tipoAcabamento` varchar(100);
--> statement-breakpoint
ALTER TABLE `recursos` ADD COLUMN `linhaProducao` enum('Offset','Flexo','Terceiro') DEFAULT 'Offset';
--> statement-breakpoint
ALTER TABLE `recursos` ADD COLUMN `linhaProduto` varchar(100);
--> statement-breakpoint
ALTER TABLE `recursos` ADD COLUMN `grupoTrabalho` varchar(100);
--> statement-breakpoint
ALTER TABLE `recursos` ADD COLUMN `velocidadeLiquida` decimal(10,2);
--> statement-breakpoint

-- DIAS ÚTEIS
ALTER TABLE `dias_uteis` ADD COLUMN `tipoDias` varchar(20) NOT NULL DEFAULT 'seg-sex';
--> statement-breakpoint

-- CLIENTES
ALTER TABLE `clientes` ADD COLUMN `codigo` varchar(50);
--> statement-breakpoint

-- NÍVEIS DE ACESSO
CREATE TABLE IF NOT EXISTS `niveis_acesso` (
  `id` int AUTO_INCREMENT NOT NULL,
  `nivel` int NOT NULL,
  `nome` varchar(50) NOT NULL,
  `descricao` text,
  `podeEditarCadastros` boolean NOT NULL DEFAULT false,
  `podeVerTodasMarcas` boolean NOT NULL DEFAULT false,
  `podeGerenciarUsuarios` boolean NOT NULL DEFAULT false,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `niveis_acesso_id` PRIMARY KEY(`id`),
  CONSTRAINT `niveis_acesso_nivel_unique` UNIQUE(`nivel`)
);
--> statement-breakpoint

INSERT IGNORE INTO `niveis_acesso` (`nivel`, `nome`, `descricao`, `podeEditarCadastros`, `podeVerTodasMarcas`, `podeGerenciarUsuarios`)
VALUES
  (1, 'Gestor', 'Vê apenas marcas vinculadas', false, false, false),
  (2, 'Gerente Comercial', 'Vê todas as marcas; não edita cadastros mestres', false, true, false),
  (3, 'Master', 'Acesso total', true, true, true);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `usuario_marcas` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `marcaId` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `usuario_marcas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `status_cadastro` (
  `id` int AUTO_INCREMENT NOT NULL,
  `nome` varchar(50) NOT NULL,
  `descricao` text,
  `ativo` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `status_cadastro_id` PRIMARY KEY(`id`),
  CONSTRAINT `status_cadastro_nome_unique` UNIQUE(`nome`)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `tipos_negocio` (
  `id` int AUTO_INCREMENT NOT NULL,
  `nome` varchar(50) NOT NULL,
  `descricao` text,
  `ativo` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `tipos_negocio_id` PRIMARY KEY(`id`),
  CONSTRAINT `tipos_negocio_nome_unique` UNIQUE(`nome`)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `tipos_estoque` (
  `id` int AUTO_INCREMENT NOT NULL,
  `nome` varchar(50) NOT NULL,
  `descricao` text,
  `ativo` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `tipos_estoque_id` PRIMARY KEY(`id`),
  CONSTRAINT `tipos_estoque_nome_unique` UNIQUE(`nome`)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `linhas` (
  `id` int AUTO_INCREMENT NOT NULL,
  `nome` varchar(100) NOT NULL,
  `descricao` text,
  `ativo` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `linhas_id` PRIMARY KEY(`id`),
  CONSTRAINT `linhas_nome_unique` UNIQUE(`nome`)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `modelos` (
  `id` int AUTO_INCREMENT NOT NULL,
  `nome` varchar(100) NOT NULL,
  `descricao` text,
  `ativo` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `modelos_id` PRIMARY KEY(`id`),
  CONSTRAINT `modelos_nome_unique` UNIQUE(`nome`)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `tamanhos` (
  `id` int AUTO_INCREMENT NOT NULL,
  `nome` varchar(50) NOT NULL,
  `descricao` text,
  `ordem` int DEFAULT 0,
  `ativo` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `tamanhos_id` PRIMARY KEY(`id`),
  CONSTRAINT `tamanhos_nome_unique` UNIQUE(`nome`)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `marcas` (
  `id` int AUTO_INCREMENT NOT NULL,
  `nome` varchar(100) NOT NULL,
  `grupoMarca` varchar(100),
  `ramoAtuacao` varchar(100),
  `ativo` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `marcas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `gestores` (
  `id` int AUTO_INCREMENT NOT NULL,
  `nome` varchar(200) NOT NULL,
  `email` varchar(320),
  `telefone` varchar(20),
  `ativo` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `gestores_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `gestor_marca` (
  `id` int AUTO_INCREMENT NOT NULL,
  `gestorId` int NOT NULL,
  `marcaId` int NOT NULL,
  `dataInicio` date,
  `dataFim` date,
  `ativo` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `gestor_marca_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `de_para_codigos` (
  `id` int AUTO_INCREMENT NOT NULL,
  `sku_antigo` varchar(100) NOT NULL,
  `sku_novo` varchar(100) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `de_para_codigos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `turnos` (
  `id` int AUTO_INCREMENT NOT NULL,
  `turnoHora` varchar(50) NOT NULL,
  `horasTrabalho` varchar(10) NOT NULL,
  `horasRefeicao` varchar(10) DEFAULT '01:00',
  `horasTrabalhadas` varchar(10) DEFAULT '07:00',
  `diasTrabalhados` varchar(50) NOT NULL,
  `horaExtra` boolean NOT NULL DEFAULT false,
  `ativo` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `turnos_id` PRIMARY KEY(`id`),
  CONSTRAINT `turnos_turnoHora_unique` UNIQUE(`turnoHora`)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `recursos_mensais` (
  `id` int AUTO_INCREMENT NOT NULL,
  `recursoId` int NOT NULL,
  `ano` int NOT NULL,
  `mes` int NOT NULL,
  `turnoId` int NOT NULL,
  `horasManutencao` decimal(6,2) DEFAULT '0',
  `horasExtras` decimal(6,2) DEFAULT '0',
  `velocidadeLiquida` decimal(10,2),
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `recursos_mensais_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `fluxos` (
  `id` int AUTO_INCREMENT NOT NULL,
  `nome` varchar(100) NOT NULL,
  `descricao` text,
  `ativo` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fluxos_id` PRIMARY KEY(`id`),
  CONSTRAINT `fluxos_nome_unique` UNIQUE(`nome`)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `fluxo_recursos` (
  `id` int AUTO_INCREMENT NOT NULL,
  `fluxoId` int NOT NULL,
  `recursoId` int NOT NULL,
  `ordem` int DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `fluxo_recursos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `sharepoint_config` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tenantId` varchar(100),
  `clientId` varchar(100),
  `clientSecret` text,
  `siteUrl` varchar(500),
  `folderPath` varchar(500),
  `arquivoProdutos` varchar(255) DEFAULT 'produtos.xlsx',
  `arquivoFaturamento` varchar(255) DEFAULT 'faturamento.xlsx',
  `arquivoClientes` varchar(255) DEFAULT 'clientes.xlsx',
  `intervaloHoras` int DEFAULT 6,
  `ativo` boolean NOT NULL DEFAULT false,
  `ultimaSincronizacao` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `sharepoint_config_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `sync_logs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tipo` enum('produtos','faturamento','clientes','todos') NOT NULL,
  `status` enum('iniciado','sucesso','erro','parcial') NOT NULL,
  `registrosProcessados` int DEFAULT 0,
  `registrosInseridos` int DEFAULT 0,
  `registrosAtualizados` int DEFAULT 0,
  `registrosErro` int DEFAULT 0,
  `mensagem` text,
  `detalhesErro` text,
  `arquivoOrigem` varchar(255),
  `duracaoSegundos` int,
  `executadoPor` varchar(100) DEFAULT 'sistema',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `sync_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `previsao_python_scenario_snapshots` (
  `id` int AUTO_INCREMENT NOT NULL,
  `jobId` int NOT NULL,
  `cicloRef` varchar(80) NOT NULL,
  `horizonteRef` varchar(40),
  `titulo` varchar(140),
  `observacoes` text,
  `summaryJson` text NOT NULL,
  `dataJson` text NOT NULL,
  `createdBy` varchar(320),
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `previsao_python_scenario_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint

-- Seeds auxiliares mínimos
INSERT IGNORE INTO `status_cadastro` (`nome`, `descricao`) VALUES ('ATIVO', 'Ativo'), ('INATIVO', 'Inativo');
--> statement-breakpoint
INSERT IGNORE INTO `tipos_estoque` (`nome`, `descricao`) VALUES ('MTS', 'Make to Stock'), ('MTO', 'Make to Order');
