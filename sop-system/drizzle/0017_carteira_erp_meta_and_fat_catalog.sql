ALTER TABLE `carteira_pv_entregas`
  ADD COLUMN `erpDescricao` varchar(300) NULL AFTER `receitaBruta`,
  ADD COLUMN `erpMarca` varchar(100) NULL AFTER `erpDescricao`,
  ADD COLUMN `erpTipo` varchar(50) NULL AFTER `erpMarca`;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `fat_sku_catalog` (
  `codMaterial` varchar(50) NOT NULL,
  `descricaoItem` varchar(300) NULL,
  `marca` varchar(100) NULL,
  `linhaProduto` varchar(100) NULL,
  `tipoNegocio` varchar(50) NULL,
  `tipoEstoque` enum('MTS','MTO') NULL,
  `grupoProduto` varchar(100) NULL,
  `notas` int NOT NULL DEFAULT 0,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fat_sku_catalog_pk` PRIMARY KEY (`codMaterial`)
);
--> statement-breakpoint
CREATE INDEX `idx_faturamento_marca`
  ON `faturamento` (`marca`);
--> statement-breakpoint
CREATE INDEX `idx_produtos_codigo`
  ON `produtos` (`codigo`);