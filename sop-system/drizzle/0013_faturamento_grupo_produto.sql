-- usr_grupo (Sacola, Envelope…) separado de usr_acabado (JIT/ATD/PRG/VAR)
ALTER TABLE `faturamento`
  ADD COLUMN `grupoProduto` varchar(100) NULL;
