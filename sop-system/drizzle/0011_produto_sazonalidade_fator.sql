-- Fatores % sazonais por SKU (jan-dez, soma ~100%)
CREATE TABLE `produto_sazonalidade_fatores` (
  `produtoId` int NOT NULL,
  `fatorJan` decimal(8,4) NOT NULL,
  `fatorFev` decimal(8,4) NOT NULL,
  `fatorMar` decimal(8,4) NOT NULL,
  `fatorAbr` decimal(8,4) NOT NULL,
  `fatorMai` decimal(8,4) NOT NULL,
  `fatorJun` decimal(8,4) NOT NULL,
  `fatorJul` decimal(8,4) NOT NULL,
  `fatorAgo` decimal(8,4) NOT NULL,
  `fatorSet` decimal(8,4) NOT NULL,
  `fatorOut` decimal(8,4) NOT NULL,
  `fatorNov` decimal(8,4) NOT NULL,
  `fatorDez` decimal(8,4) NOT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `produto_sazonalidade_fatores_pkey` PRIMARY KEY (`produtoId`)
);

ALTER TABLE `ciclo_comercial_itens`
  ADD COLUMN `estatUsouFatorSku` tinyint(1) NOT NULL DEFAULT 0 AFTER `qtdeTotalEstatistica`;
