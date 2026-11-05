# Plano Previsão de Demanda (espelho Excel → software)

Fonte: pastas `OneDrive_2026-07-30/1-Módulo Previsão Demanda`, `.tmp-handover-extract`,
`Passo a Passo de como gerar a Previsão de Demanda.docx`, script v5.2.

## Fluxo Excel → menu SNOP
1. Pré-etapa Cadastro/De-Para → Cadastros Produto
2. Skus Projetar + Estatística IA → Skus Projetar + Bases/Faturamento
3. Script Python (.bat) → Rodar Previsão Python
4. Relatório Visão Executiva → Relatório Estatístico
5. Novo ciclo colaboração → Colaboração Comercial (+ wizard)
6. MTS / JITO / PV / CRM + Resumos 1–7

## Sprint A (P0) — concluído
- [x] Página Skus Projetar (lista + toggle + import)
- [x] Pré-check faturamento mês fechado
- [x] Wizard Novo ciclo (mês/ano/nome + job SUCCESS)
- [x] Alinhar script Python canônico (Downloads → scripts-previsao)
- [x] CTA pós-SUCCESS “Abrir novo ciclo”

## Sprint paridade Excel (motor estatístico) — concluído
- [x] ETL: filtrar marca Inativa (cadastro)
- [x] ETL: excluir Tipo Item = Outros
- [x] ETL: só Skus Projetar (inner join)
- [x] Previsto automático do ciclo anterior (CONSOLIDADO/FECHADO)
- [x] Desagregação JITO via tipoNegocio (JIT)
- [x] projetar=não → traz colaboração do ciclo anterior

## Sprint B — concluído
- [x] Colaboração ciclo anterior (órfãos / projetar=false)
- [x] Comparativos AA / Prev / Real (aba na Colaboração)
- [x] Reconciliação SKUs órfãos na desagregação
- [x] Sazonalidade Σ%=100 (alerta UI + renormalização ao salvar)

## Sprint C — concluído
- [x] Previsto → próximo ciclo (ETL + desagregação)
- [x] Preços + Resumo R$ (aba 2 + export)
- [x] Base Ciclo exportável (aba 5 → CSV “BD Ciclos”)
- [x] MTO Variação + Relatório RFS (abas 6–7)

## Sprint D — concluído (substitutos de integração live)
- [x] CRM import Excel/CSV (substitui Pipedrive live)
- [x] Relatório RFS + export
- [x] PVxCRM detalhado + export consolidado
- [x] Import PV Pedidos em Aberto (Carteira) + Sync → PV_MTO

## Fora de escopo literal (não bloqueia o fluxo S&OP)
- API Pipedrive em tempo real (usar CSV/Excel do Victor)
- UI Excel célula-a-célula MTS (grade web + export cobre o processo)
- Resumo PROD / capacidade (módulo capacidade removido do menu de escopo)

---
