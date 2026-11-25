ALTER TABLE `ciclos_comerciais`
  MODIFY COLUMN `status` ENUM(
    'ABERTO',
    'EM_COLABORACAO',
    'CONSOLIDADO',
    'FECHADO',
    'CONSENSO',
    'APROVADO',
    'CONGELADO'
  ) NOT NULL DEFAULT 'ABERTO';
--> statement-breakpoint
UPDATE `ciclos_comerciais` SET `status` = 'CONSENSO' WHERE `status` = 'CONSOLIDADO';
--> statement-breakpoint
UPDATE `ciclos_comerciais` SET `status` = 'CONGELADO' WHERE `status` = 'FECHADO';
--> statement-breakpoint
ALTER TABLE `ciclos_comerciais`
  MODIFY COLUMN `status` ENUM(
    'ABERTO',
    'EM_COLABORACAO',
    'CONSENSO',
    'APROVADO',
    'CONGELADO'
  ) NOT NULL DEFAULT 'ABERTO';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ciclo_status_historico` (
  `id` int NOT NULL AUTO_INCREMENT,
  `cicloId` int NOT NULL,
  `statusDe` varchar(40) NULL,
  `statusPara` varchar(40) NOT NULL,
  `usuario` varchar(320) NULL,
  `comentario` text NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ciclo_status_hist_ciclo` (`cicloId`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ciclo_snapshot` (
  `id` int NOT NULL AUTO_INCREMENT,
  `cicloId` int NOT NULL,
  `versao` int NOT NULL,
  `hash` varchar(64) NOT NULL,
  `retroativo` boolean NOT NULL DEFAULT false,
  `createdBy` varchar(320) NULL,
  `comentario` text NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ciclo_snapshot_versao` (`cicloId`, `versao`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ciclo_snapshot_linhas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `snapshotId` int NOT NULL,
  `tipo` varchar(40) NOT NULL,
  `payloadJson` longtext NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_ciclo_snapshot_linhas_snap` (`snapshotId`)
);
--> statement-breakpoint
DROP TRIGGER IF EXISTS `ciclo_snapshot_no_update`;
--> statement-breakpoint
CREATE TRIGGER `ciclo_snapshot_no_update`
BEFORE UPDATE ON `ciclo_snapshot`
FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ciclo_snapshot é imutável';
--> statement-breakpoint
DROP TRIGGER IF EXISTS `ciclo_snapshot_no_delete`;
--> statement-breakpoint
CREATE TRIGGER `ciclo_snapshot_no_delete`
BEFORE DELETE ON `ciclo_snapshot`
FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ciclo_snapshot é imutável';
--> statement-breakpoint
DROP TRIGGER IF EXISTS `ciclo_snapshot_linhas_no_update`;
--> statement-breakpoint
CREATE TRIGGER `ciclo_snapshot_linhas_no_update`
BEFORE UPDATE ON `ciclo_snapshot_linhas`
FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ciclo_snapshot_linhas é imutável';
--> statement-breakpoint
DROP TRIGGER IF EXISTS `ciclo_snapshot_linhas_no_delete`;
--> statement-breakpoint
CREATE TRIGGER `ciclo_snapshot_linhas_no_delete`
BEFORE DELETE ON `ciclo_snapshot_linhas`
FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ciclo_snapshot_linhas é imutável';
--> statement-breakpoint
ALTER TABLE `produtos`
  ADD COLUMN `precoUnitario` decimal(15, 4) NULL,
  ADD COLUMN `precoOrigem` varchar(40) NULL,
  ADD COLUMN `precoAtualizadoEm` timestamp NULL;
--> statement-breakpoint
-- valorVenda > 0 vira precoUnitario com origem legado_cadastro (não manual).
UPDATE `produtos`
SET `precoUnitario` = `valorVenda`,
    `precoOrigem` = 'legado_cadastro',
    `precoAtualizadoEm` = CURRENT_TIMESTAMP
WHERE `valorVenda` IS NOT NULL AND `valorVenda` > 0 AND `precoUnitario` IS NULL;
--> statement-breakpoint
CREATE INDEX `idx_de_para_sku_novo` ON `de_para_codigos` (`sku_novo`);
