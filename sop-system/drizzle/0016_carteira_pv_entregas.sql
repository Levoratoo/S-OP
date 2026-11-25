CREATE TABLE IF NOT EXISTS `carteira_pv_entregas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `codigo` varchar(50) NOT NULL,
  `sku` varchar(50) NOT NULL,
  `precoUnitario` decimal(15, 4) NOT NULL DEFAULT 0,
  `anoEnt` int NOT NULL,
  `mesEnt` int NOT NULL,
  `quantidade` decimal(15, 4) NOT NULL,
  `receitaBruta` decimal(15, 2) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_carteira_pv_entrega` (`codigo`, `sku`, `precoUnitario`, `anoEnt`, `mesEnt`)
);