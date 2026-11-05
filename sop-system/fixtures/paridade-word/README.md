# Golden dataset — paridade Word / job compartilhado

## Fonte congelada

- Ambiente: `http://192.168.1.82:3042/`
- Jobs de referência: **#4** e **#5** (`SUCCESS`, 17/09/2026)
- Manifesto reconciliado: `job4_visao_executiva.golden.json` (totais do job #4)
- Relatórios: `job4_relatorio_previsao.xlsx`, `job5_relatorio_previsao.xlsx`
- Script registrado nos jobs antigos: `v5.7.0` (alvo pós-deploy: `v5.2-COMPLETO` + hash)
- Mês fechado observado na UI: **08/2026**

## Contrato de aceitação

1. `Visao_Executiva` mantém 102 grupos e reconcilia `sumPrevisaoFinalSugerida` / `sumHistorico12M` dentro da tolerância.
2. Relatórios 1–7 existem no fluxo de colaboração e usam calendário do ciclo (não posição fixa Jan–Dez).
3. Job novo após deploy deve gravar `scriptHash` + `inputMetadataJson`.

## Como atualizar

1. Gerar previsão no ambiente compartilhado.
2. Baixar o Excel do job SUCCESS.
3. Rodar `node fixtures/paridade-word/capture-from-live.mjs` com a sessão autenticada (ou via browser) apontando para o job.
4. Revisar diffs de totais antes de sobrescrever o golden.
