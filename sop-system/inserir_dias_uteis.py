#!/usr/bin/env python3
"""
Script para calcular e inserir dias úteis para 2025 e 2026
considerando os três tipos de calendário:
- seg-sex: segunda a sexta (5 dias por semana)
- seg-sab: segunda a sábado (6 dias por semana)
- 7-dias: todos os dias (7 dias por semana)
"""

import calendar
from datetime import date

def contar_dias_por_tipo(ano, mes):
    """Conta os dias úteis por tipo de calendário"""
    cal = calendar.Calendar()
    
    seg_sex = 0  # Segunda a Sexta (0-4)
    seg_sab = 0  # Segunda a Sábado (0-5)
    todos = 0    # Todos os dias (0-6)
    
    for dia in cal.itermonthdays2(ano, mes):
        if dia[0] != 0:  # dia[0] é o dia do mês, dia[1] é o dia da semana
            dia_semana = dia[1]
            todos += 1
            if dia_semana <= 4:  # Segunda a Sexta
                seg_sex += 1
            if dia_semana <= 5:  # Segunda a Sábado
                seg_sab += 1
    
    return {
        'seg-sex': seg_sex,
        'seg-sab': seg_sab,
        '7-dias': todos
    }

# Gerar SQL para inserir dias úteis
print("-- Dias úteis para 2025 (seg-sab e 7-dias)")
for mes in range(1, 13):
    dias = contar_dias_por_tipo(2025, mes)
    # seg-sab
    print(f"INSERT INTO dias_uteis (ano, mes, tipoDias, diasUteis, feriados) VALUES (2025, {mes}, 'seg-sab', {dias['seg-sab']}, 0);")
    # 7-dias
    print(f"INSERT INTO dias_uteis (ano, mes, tipoDias, diasUteis, feriados) VALUES (2025, {mes}, '7-dias', {dias['7-dias']}, 0);")

print("\n-- Dias úteis para 2026 (todos os tipos)")
for mes in range(1, 13):
    dias = contar_dias_por_tipo(2026, mes)
    # seg-sex
    print(f"INSERT INTO dias_uteis (ano, mes, tipoDias, diasUteis, feriados) VALUES (2026, {mes}, 'seg-sex', {dias['seg-sex']}, 0);")
    # seg-sab
    print(f"INSERT INTO dias_uteis (ano, mes, tipoDias, diasUteis, feriados) VALUES (2026, {mes}, 'seg-sab', {dias['seg-sab']}, 0);")
    # 7-dias
    print(f"INSERT INTO dias_uteis (ano, mes, tipoDias, diasUteis, feriados) VALUES (2026, {mes}, '7-dias', {dias['7-dias']}, 0);")

print("\n-- Resumo:")
print("-- 2025:")
total_seg_sex_2025 = sum(contar_dias_por_tipo(2025, m)['seg-sex'] for m in range(1, 13))
total_seg_sab_2025 = sum(contar_dias_por_tipo(2025, m)['seg-sab'] for m in range(1, 13))
total_7dias_2025 = sum(contar_dias_por_tipo(2025, m)['7-dias'] for m in range(1, 13))
print(f"--   seg-sex: {total_seg_sex_2025} dias")
print(f"--   seg-sab: {total_seg_sab_2025} dias")
print(f"--   7-dias: {total_7dias_2025} dias")

print("-- 2026:")
total_seg_sex_2026 = sum(contar_dias_por_tipo(2026, m)['seg-sex'] for m in range(1, 13))
total_seg_sab_2026 = sum(contar_dias_por_tipo(2026, m)['seg-sab'] for m in range(1, 13))
total_7dias_2026 = sum(contar_dias_por_tipo(2026, m)['7-dias'] for m in range(1, 13))
print(f"--   seg-sex: {total_seg_sex_2026} dias")
print(f"--   seg-sab: {total_seg_sab_2026} dias")
print(f"--   7-dias: {total_7dias_2026} dias")
