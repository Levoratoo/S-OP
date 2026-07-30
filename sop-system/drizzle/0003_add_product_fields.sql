-- Adicionar novos campos à tabela produtos
ALTER TABLE `produtos` ADD COLUMN `codItem` varchar(50) UNIQUE;
ALTER TABLE `produtos` ADD COLUMN `descricao` varchar(300);
ALTER TABLE `produtos` ADD COLUMN `tipoNegocio` varchar(50);
ALTER TABLE `produtos` ADD COLUMN `tipoEstoque` enum('MTS','MTO') DEFAULT 'MTS';
ALTER TABLE `produtos` ADD COLUMN `linha` varchar(100);
ALTER TABLE `produtos` ADD COLUMN `tamanho` varchar(50);
ALTER TABLE `produtos` ADD COLUMN `axlxp` varchar(50);
ALTER TABLE `produtos` ADD COLUMN `marca` varchar(100);
ALTER TABLE `produtos` ADD COLUMN `grupo` varchar(100);
ALTER TABLE `produtos` ADD COLUMN `ramoAtuacao` varchar(100);
ALTER TABLE `produtos` ADD COLUMN `valorVenda` decimal(15,2);
ALTER TABLE `produtos` ADD COLUMN `valorCusto` decimal(15,2);
ALTER TABLE `produtos` ADD COLUMN `qtdePallet` int;
ALTER TABLE `produtos` ADD COLUMN `loteEconomicoViavel` int;
ALTER TABLE `produtos` ADD COLUMN `fluxo` varchar(100);
ALTER TABLE `produtos` ADD COLUMN `caminho` varchar(100);
ALTER TABLE `produtos` ADD COLUMN `pista` int;

-- Remover colunas antigas que não são mais necessárias
ALTER TABLE `produtos` DROP COLUMN IF EXISTS `custoTipo`;
ALTER TABLE `produtos` DROP COLUMN IF EXISTS `rateio`;
