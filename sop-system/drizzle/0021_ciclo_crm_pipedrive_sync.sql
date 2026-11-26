-- Independente de 0018/0020 (preço e snapshot do ciclo). Pode aplicar antes ou depois delas.
CREATE TABLE IF NOT EXISTS `ciclo_crm_pipedrive_sync` (
  `id` int NOT NULL AUTO_INCREMENT,
  `cicloId` int NOT NULL,
  `usuario` varchar(320) NULL,
  `previewHash` varchar(64) NOT NULL,
  `negocios` int NOT NULL DEFAULT 0,
  `linhas` int NOT NULL DEFAULT 0,
  `quantidade` decimal(18,2) NOT NULL DEFAULT 0,
  `valor` decimal(18,4) NOT NULL DEFAULT 0,
  `alertasQtd` int NOT NULL DEFAULT 0,
  `totaisJson` mediumtext NOT NULL,
  `snapshotJson` mediumtext NOT NULL,
  `desfeitoEm` timestamp NULL DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_crm_pipedrive_ciclo` (`cicloId`, `id`)
);
