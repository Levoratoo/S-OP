-- Preço do ciclo e do cadastro em 4 casas (não arredonda 0,675 → 0,68).
-- 0018 ainda não aplicada em produção; 0020 cobre quem aplicar as duas em sequência.
ALTER TABLE `ciclo_comercial_itens`
  MODIFY COLUMN `valorVendaSnapshot` decimal(15, 4) NULL;
--> statement-breakpoint
ALTER TABLE `produtos`
  MODIFY COLUMN `valorVenda` decimal(15, 4) NULL,
  MODIFY COLUMN `precoUnitario` decimal(15, 4) NULL;
--> statement-breakpoint
CREATE INDEX `idx_faturamento_cod_data` ON `faturamento` (`codMaterial`, `dataEmissao`);
