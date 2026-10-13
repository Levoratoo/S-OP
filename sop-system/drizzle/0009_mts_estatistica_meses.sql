-- Snapshot mensal da previsão estatística (e1–e12) separado da colaboração do vendedor (m1–m12).
ALTER TABLE `ciclo_comercial_itens`
  ADD COLUMN `e1` decimal(15,2) NULL AFTER `qtdeTotalEstatistica`,
  ADD COLUMN `e2` decimal(15,2) NULL AFTER `e1`,
  ADD COLUMN `e3` decimal(15,2) NULL AFTER `e2`,
  ADD COLUMN `e4` decimal(15,2) NULL AFTER `e3`,
  ADD COLUMN `e5` decimal(15,2) NULL AFTER `e4`,
  ADD COLUMN `e6` decimal(15,2) NULL AFTER `e5`,
  ADD COLUMN `e7` decimal(15,2) NULL AFTER `e6`,
  ADD COLUMN `e8` decimal(15,2) NULL AFTER `e7`,
  ADD COLUMN `e9` decimal(15,2) NULL AFTER `e8`,
  ADD COLUMN `e10` decimal(15,2) NULL AFTER `e9`,
  ADD COLUMN `e11` decimal(15,2) NULL AFTER `e10`,
  ADD COLUMN `e12` decimal(15,2) NULL AFTER `e11`;
--> statement-breakpoint
UPDATE `ciclo_comercial_itens`
SET
  `e1` = COALESCE(`e1`, `m1`),
  `e2` = COALESCE(`e2`, `m2`),
  `e3` = COALESCE(`e3`, `m3`),
  `e4` = COALESCE(`e4`, `m4`),
  `e5` = COALESCE(`e5`, `m5`),
  `e6` = COALESCE(`e6`, `m6`),
  `e7` = COALESCE(`e7`, `m7`),
  `e8` = COALESCE(`e8`, `m8`),
  `e9` = COALESCE(`e9`, `m9`),
  `e10` = COALESCE(`e10`, `m10`),
  `e11` = COALESCE(`e11`, `m11`),
  `e12` = COALESCE(`e12`, `m12`)
WHERE `e1` IS NULL AND `e2` IS NULL AND `e3` IS NULL;
