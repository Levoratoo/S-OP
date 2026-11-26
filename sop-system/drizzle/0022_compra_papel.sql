-- Compra de papel: cadastro, estoque manual, decisões do ciclo e foto imutável.
CREATE TABLE IF NOT EXISTS `papeis` (
  `id` int NOT NULL AUTO_INCREMENT,
  `codigo` varchar(40) NOT NULL,
  `descricao` varchar(300) NOT NULL,
  `gramatura` varchar(40) NULL,
  `formato` varchar(80) NULL,
  `tipo` varchar(80) NULL,
  `unidade` varchar(20) NOT NULL DEFAULT 'KG',
  `ativo` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_papeis_codigo` (`codigo`)
);

CREATE TABLE IF NOT EXISTS `papel_estoque` (
  `id` int NOT NULL AUTO_INCREMENT,
  `papelId` int NOT NULL,
  `quantidade` decimal(18,4) NOT NULL,
  `unidade` varchar(20) NOT NULL,
  `dataBase` date NOT NULL,
  `origem` varchar(40) NOT NULL DEFAULT 'MANUAL',
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_papel_estoque` (`papelId`)
);

CREATE TABLE IF NOT EXISTS `ciclo_crm_negocio` (
  `id` int NOT NULL AUTO_INCREMENT,
  `cicloId` int NOT NULL,
  `dealId` int NOT NULL,
  `titulo` varchar(300) NOT NULL,
  `proprietario` varchar(200) NULL,
  `proprietarioEmail` varchar(200) NULL,
  `marca` varchar(120) NULL,
  `temperatura` varchar(40) NULL,
  `sku` varchar(80) NOT NULL,
  `descricao` varchar(300) NULL,
  `tipo` varchar(40) NOT NULL,
  `anoEntrega` int NOT NULL,
  `mesEntrega` int NOT NULL,
  `quantidade` decimal(18,4) NOT NULL,
  `preco` decimal(15,4) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_crm_negocio_ciclo` (`cicloId`)
);

CREATE TABLE IF NOT EXISTS `compra_papel_decisao` (
  `id` int NOT NULL AUTO_INCREMENT,
  `cicloId` int NOT NULL,
  `linhaId` varchar(160) NOT NULL,
  `papelId` int NULL,
  `risco` varchar(20) NULL,
  `comprar` varchar(20) NOT NULL DEFAULT 'PENDENTE',
  `quantidade` decimal(18,4) NULL,
  `observacao` varchar(500) NULL,
  `decididoPor` varchar(320) NULL,
  `decididoEm` timestamp NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_compra_papel_linha` (`cicloId`, `linhaId`)
);

CREATE TABLE IF NOT EXISTS `compra_papel_snapshot` (
  `id` int NOT NULL AUTO_INCREMENT,
  `cicloId` int NOT NULL,
  `versao` int NOT NULL,
  `linhas` int NOT NULL DEFAULT 0,
  `comentario` varchar(500) NULL,
  `createdBy` varchar(320) NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_compra_papel_snap` (`cicloId`, `versao`)
);

CREATE TABLE IF NOT EXISTS `compra_papel_snapshot_linhas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `snapshotId` int NOT NULL,
  `linhaId` varchar(160) NOT NULL,
  `payloadJson` text NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_compra_papel_snap_linhas` (`snapshotId`)
);

DROP TRIGGER IF EXISTS `compra_papel_snapshot_no_update`;
CREATE TRIGGER `compra_papel_snapshot_no_update`
BEFORE UPDATE ON `compra_papel_snapshot`
FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'compra_papel_snapshot é imutável';

DROP TRIGGER IF EXISTS `compra_papel_snapshot_no_delete`;
CREATE TRIGGER `compra_papel_snapshot_no_delete`
BEFORE DELETE ON `compra_papel_snapshot`
FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'compra_papel_snapshot é imutável';

DROP TRIGGER IF EXISTS `compra_papel_snapshot_linhas_no_update`;
CREATE TRIGGER `compra_papel_snapshot_linhas_no_update`
BEFORE UPDATE ON `compra_papel_snapshot_linhas`
FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'compra_papel_snapshot_linhas é imutável';

DROP TRIGGER IF EXISTS `compra_papel_snapshot_linhas_no_delete`;
CREATE TRIGGER `compra_papel_snapshot_linhas_no_delete`
BEFORE DELETE ON `compra_papel_snapshot_linhas`
FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'compra_papel_snapshot_linhas é imutável';
