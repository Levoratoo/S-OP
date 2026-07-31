ALTER TABLE `produtos` ADD COLUMN `projetarEstatistica` boolean NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE `previsao_python_jobs` ALTER COLUMN `scriptVersion` SET DEFAULT 'v5.7.0';
--> statement-breakpoint
CREATE TABLE `sazonalidade_marca` (
	`id` int AUTO_INCREMENT NOT NULL,
	`marcaId` int,
	`marcaNome` varchar(100) NOT NULL,
	`mes` int NOT NULL,
	`percentual` decimal(8,6) NOT NULL,
	`anoReferencia` int,
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sazonalidade_marca_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ciclos_comerciais` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nome` varchar(140) NOT NULL,
	`anoInicio` int NOT NULL,
	`mesInicio` int NOT NULL,
	`horizonteMeses` int NOT NULL DEFAULT 12,
	`jobId` int,
	`status` enum('ABERTO','EM_COLABORACAO','CONSOLIDADO','FECHADO') NOT NULL DEFAULT 'ABERTO',
	`observacoes` text,
	`createdBy` varchar(320),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ciclos_comerciais_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ciclo_comercial_itens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cicloId` int NOT NULL,
	`planoColab` enum('MTS','JITO','PV_MTO','CRM') NOT NULL,
	`sku` varchar(80) NOT NULL,
	`descricao` varchar(300),
	`marca` varchar(100),
	`linha` varchar(100),
	`tipoEstoque` enum('MTS','MTO') DEFAULT 'MTS',
	`tipoMarcaLinha` varchar(200),
	`projetar` boolean NOT NULL DEFAULT true,
	`rateio12m` decimal(10,6),
	`rateio6m` decimal(10,6),
	`rateioConsiderar` decimal(10,6),
	`qtdeTotalEstatistica` decimal(15,2),
	`m1` decimal(15,2) DEFAULT '0',
	`m2` decimal(15,2) DEFAULT '0',
	`m3` decimal(15,2) DEFAULT '0',
	`m4` decimal(15,2) DEFAULT '0',
	`m5` decimal(15,2) DEFAULT '0',
	`m6` decimal(15,2) DEFAULT '0',
	`m7` decimal(15,2) DEFAULT '0',
	`m8` decimal(15,2) DEFAULT '0',
	`m9` decimal(15,2) DEFAULT '0',
	`m10` decimal(15,2) DEFAULT '0',
	`m11` decimal(15,2) DEFAULT '0',
	`m12` decimal(15,2) DEFAULT '0',
	`qtdeColaborada` decimal(15,2),
	`origem` enum('ESTATISTICA','MANUAL','CRM','PV') NOT NULL DEFAULT 'ESTATISTICA',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ciclo_comercial_itens_id` PRIMARY KEY(`id`)
);
