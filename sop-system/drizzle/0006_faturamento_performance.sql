CREATE INDEX idx_faturamento_data_emissao
  ON faturamento (dataEmissao);
--> statement-breakpoint
CREATE INDEX idx_faturamento_tipo_data
  ON faturamento (tipoFaturamento, dataEmissao);
--> statement-breakpoint
CREATE INDEX idx_faturamento_cod_material
  ON faturamento (codMaterial);
