-- JITO passa a ser tratado na aba MTS (tipo ATD no Consolidado). Idempotente.
UPDATE `ciclo_comercial_itens` SET `planoColab` = 'MTS' WHERE `planoColab` = 'JITO';
