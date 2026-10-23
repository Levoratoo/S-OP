CREATE TABLE IF NOT EXISTS faturamento_resumo_mensal (
  ano SMALLINT NOT NULL,
  mes TINYINT NOT NULL,
  totalRegistros BIGINT NOT NULL DEFAULT 0,
  totalValor DECIMAL(20,2) NOT NULL DEFAULT 0,
  totalQtd DECIMAL(20,4) NOT NULL DEFAULT 0,
  receitaLiquida DECIMAL(20,2) NOT NULL DEFAULT 0,
  quantidadeLiquida DECIMAL(20,4) NOT NULL DEFAULT 0,
  lastLoadedAt TIMESTAMP NULL,
  PRIMARY KEY (ano, mes)
);
--> statement-breakpoint
INSERT INTO faturamento_resumo_mensal (
  ano, mes, totalRegistros, totalValor, totalQtd,
  receitaLiquida, quantidadeLiquida, lastLoadedAt
)
SELECT
  YEAR(dataEmissao),
  MONTH(dataEmissao),
  COUNT(*),
  COALESCE(SUM(valorTotal), 0),
  COALESCE(SUM(qtd), 0),
  COALESCE(SUM(CASE WHEN tipoFaturamento = 'SAIDA' THEN valorTotal ELSE -valorTotal END), 0),
  COALESCE(SUM(CASE WHEN tipoFaturamento = 'SAIDA' THEN qtd ELSE -qtd END), 0),
  MAX(createdAt)
FROM faturamento
GROUP BY YEAR(dataEmissao), MONTH(dataEmissao)
ON DUPLICATE KEY UPDATE
  totalRegistros = VALUES(totalRegistros),
  totalValor = VALUES(totalValor),
  totalQtd = VALUES(totalQtd),
  receitaLiquida = VALUES(receitaLiquida),
  quantidadeLiquida = VALUES(quantidadeLiquida),
  lastLoadedAt = VALUES(lastLoadedAt);
