DELETE d1
FROM `de_para_codigos` d1
INNER JOIN `de_para_codigos` d2
  ON UPPER(TRIM(d1.`sku_antigo`)) = UPPER(TRIM(d2.`sku_antigo`))
  AND d1.`id` < d2.`id`;
--> statement-breakpoint
UPDATE `de_para_codigos`
SET
  `sku_antigo` = UPPER(TRIM(`sku_antigo`)),
  `sku_novo` = TRIM(`sku_novo`);
--> statement-breakpoint
ALTER TABLE `de_para_codigos`
  ADD CONSTRAINT `de_para_codigos_sku_antigo_unique` UNIQUE (`sku_antigo`);
--> statement-breakpoint
ALTER TABLE `previsao_python_jobs`
  MODIFY COLUMN `scriptVersion` varchar(50) NOT NULL DEFAULT 'v5.2-COMPLETO',
  ADD COLUMN `scriptHash` varchar(64) NULL AFTER `scriptVersion`,
  ADD COLUMN `inputMetadataJson` text NULL AFTER `scriptHash`;
--> statement-breakpoint
UPDATE `carteira_pedidos` SET `sequencia` = 1 WHERE `sequencia` IS NULL;
--> statement-breakpoint
DELETE c1
FROM `carteira_pedidos` c1
INNER JOIN `carteira_pedidos` c2
  ON c1.`codigo` = c2.`codigo`
  AND c1.`sequencia` = c2.`sequencia`
  AND c1.`id` < c2.`id`;
--> statement-breakpoint
ALTER TABLE `carteira_pedidos`
  MODIFY COLUMN `sequencia` int NOT NULL DEFAULT 1,
  ADD CONSTRAINT `carteira_pedido_sequencia_unique` UNIQUE (`codigo`, `sequencia`);
--> statement-breakpoint
ALTER TABLE `ciclo_comercial_itens`
  ADD COLUMN `valorVendaSnapshot` decimal(15,2) NULL AFTER `qtdeColaborada`,
  ADD COLUMN `familiaSnapshot` varchar(120) NULL AFTER `valorVendaSnapshot`,
  ADD COLUMN `gestorSnapshot` varchar(160) NULL AFTER `familiaSnapshot`,
  ADD COLUMN `crmCard` varchar(120) NULL AFTER `gestorSnapshot`,
  ADD COLUMN `crmTipo` varchar(40) NULL AFTER `crmCard`,
  ADD COLUMN `crmTemperatura` varchar(20) NULL AFTER `crmTipo`,
  ADD COLUMN `crmCliente` varchar(160) NULL AFTER `crmTemperatura`,
  ADD COLUMN `crmOrcamento` decimal(15,2) NULL AFTER `crmCliente`;
