CREATE TABLE `faturamento` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dataEmissao` date NOT NULL,
	`nfNumero` varchar(50),
	`codCliente` varchar(50),
	`cnpj` varchar(20),
	`unidade` varchar(100),
	`cidade` varchar(100),
	`uf` varchar(2),
	`marca` varchar(100),
	`codMaterial` varchar(50),
	`descricaoItem` varchar(300),
	`tipoNegocio` varchar(50),
	`tipoEstoque` enum('MTS','MTO'),
	`linhaProduto` varchar(100),
	`qtd` decimal(15,4) NOT NULL,
	`valorTotal` decimal(15,2) NOT NULL,
	`gestor` varchar(200),
	`cfop` varchar(10),
	`descCfop` varchar(200),
	`tipoFaturamento` enum('DEVOLUCAO','SAIDA') DEFAULT 'SAIDA',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `faturamento_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `clientes` ADD `codigo` varchar(50);