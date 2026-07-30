CREATE TABLE `carteira_pedidos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`codigo` varchar(50) NOT NULL,
	`sequencia` int DEFAULT 1,
	`competencia` date NOT NULL,
	`quantidade` decimal(15,4) NOT NULL,
	`receitaBruta` decimal(15,2) NOT NULL,
	`produtoId` int NOT NULL,
	`clienteId` int,
	`faturado` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `carteira_pedidos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `clientes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`razaoSocial` varchar(200) NOT NULL,
	`nomeFantasia` varchar(200),
	`cnpjCpf` varchar(20),
	`clienteRelacionadoId` int,
	`cidade` varchar(100),
	`estado` varchar(2),
	`status` enum('ATIVO','INATIVO') NOT NULL DEFAULT 'ATIVO',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `clientes_id` PRIMARY KEY(`id`),
	CONSTRAINT `clientes_cnpjCpf_unique` UNIQUE(`cnpjCpf`)
);
--> statement-breakpoint
CREATE TABLE `colaboracoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ano` int NOT NULL,
	`ciclo` int NOT NULL,
	`colaborador` enum('COMERCIAL','MARKETING','PLANEJAMENTO','FINANCEIRO') NOT NULL,
	`status` enum('PENDENTE','EM_ANDAMENTO','APROVADO','REJEITADO') NOT NULL DEFAULT 'PENDENTE',
	`observacoes` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `colaboracoes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `consensos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ano` int NOT NULL,
	`ciclo` int NOT NULL,
	`status` enum('ABERTO','EM_REVISAO','APROVADO','FECHADO') NOT NULL DEFAULT 'ABERTO',
	`dataAprovacao` timestamp,
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `consensos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `dias_uteis` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ano` int NOT NULL,
	`mes` int NOT NULL,
	`diasUteis` int NOT NULL,
	`feriados` int DEFAULT 0,
	`horasSemanais` int DEFAULT 44,
	`turnos` int DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `dias_uteis_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `familias` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nome` varchar(100) NOT NULL,
	`descricao` text,
	`tipo` enum('MTS','MTO') NOT NULL DEFAULT 'MTS',
	`ativo` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `familias_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `forecasts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`codigo` varchar(50),
	`competencia` date NOT NULL,
	`canalVenda` varchar(100),
	`clienteId` int,
	`receitaBruta` decimal(15,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `forecasts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `hierarquias` (
	`id` int AUTO_INCREMENT NOT NULL,
	`codigo` varchar(50) NOT NULL,
	`mercado` varchar(100),
	`canalVenda` varchar(100),
	`forcaVenda` varchar(100),
	`zonaVenda` varchar(100),
	`membroId` int,
	`ativo` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `hierarquias_id` PRIMARY KEY(`id`),
	CONSTRAINT `hierarquias_codigo_unique` UNIQUE(`codigo`)
);
--> statement-breakpoint
CREATE TABLE `membros` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nome` varchar(200) NOT NULL,
	`funcao` varchar(100),
	`email` varchar(320),
	`areaEmpresa` varchar(100),
	`hierarquiaId` int,
	`ativo` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `membros_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `metas_producao` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ano` int NOT NULL,
	`mes` int NOT NULL,
	`recursoId` int NOT NULL,
	`disponibilidadeMeta` decimal(5,2),
	`performanceMeta` decimal(5,2),
	`qualidadeMeta` decimal(5,2),
	`irogMeta` decimal(5,2),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `metas_producao_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orcamentos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ano` int NOT NULL,
	`mes` int NOT NULL,
	`familiaId` int,
	`valorMeta` decimal(15,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `orcamentos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `paradas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nome` varchar(200) NOT NULL,
	`programada` boolean DEFAULT false,
	`tempoMinutos` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `paradas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `previsoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`produtoId` int,
	`familiaId` int,
	`ano` int NOT NULL,
	`mes` int NOT NULL,
	`valorPrevisto` decimal(15,2) NOT NULL,
	`modeloUtilizado` varchar(100),
	`mape` decimal(5,2),
	`wmape` decimal(5,2),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `previsoes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `produtos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`codigo` varchar(50) NOT NULL,
	`nome` varchar(200) NOT NULL,
	`familiaId` int,
	`subfamiliaId` int,
	`modelo` varchar(100),
	`unidade` varchar(20) DEFAULT 'UN',
	`custoTipo` enum('MTS','MTO') DEFAULT 'MTS',
	`rateio` boolean DEFAULT false,
	`status` enum('ATIVO','INATIVO') NOT NULL DEFAULT 'ATIVO',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `produtos_id` PRIMARY KEY(`id`),
	CONSTRAINT `produtos_codigo_unique` UNIQUE(`codigo`)
);
--> statement-breakpoint
CREATE TABLE `recursos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nome` varchar(100) NOT NULL,
	`grupoRecurso` varchar(100),
	`disponibilidadeMin` int DEFAULT 480,
	`irogPct` decimal(5,2) DEFAULT '85.00',
	`ativo` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `recursos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `roteiros` (
	`id` int AUTO_INCREMENT NOT NULL,
	`produtoId` int NOT NULL,
	`sequencia` int NOT NULL,
	`atividade` varchar(200) NOT NULL,
	`recursoId` int,
	`tempoOperacaoMin` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `roteiros_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `subfamilias` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nome` varchar(100) NOT NULL,
	`familiaId` int NOT NULL,
	`ativo` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `subfamilias_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vendas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nfNumero` varchar(50),
	`sequencia` int DEFAULT 1,
	`dataNf` date NOT NULL,
	`quantidade` decimal(15,4) NOT NULL,
	`receitaBruta` decimal(15,2) NOT NULL,
	`produtoId` int NOT NULL,
	`clienteId` int,
	`membroId` int,
	`canalVenda` varchar(100),
	`forcaVenda` varchar(100),
	`zonaVenda` varchar(100),
	`codigoPedido` varchar(50),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `vendas_id` PRIMARY KEY(`id`)
);
