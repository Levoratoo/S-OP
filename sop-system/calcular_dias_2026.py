#!/usr/bin/env python3
"""
Calcular dias úteis para 2026 considerando diferentes tipos de turno:
- segunda - sexta: 5 dias por semana
- segunda - sábado: 6 dias por semana  
- Domingo - Domingo: 7 dias por semana (todos os dias)
"""

from datetime import date, timedelta
import calendar

def contar_dias_por_tipo(ano, mes):
    """
    Conta os dias do mês por tipo de turno.
    Retorna: (seg_sex, seg_sab, todos_dias)
    """
    cal = calendar.Calendar()
    
    seg_sex = 0  # Segunda a Sexta (weekday 0-4)
    seg_sab = 0  # Segunda a Sábado (weekday 0-5)
    todos_dias = 0  # Todos os dias
    
    for dia in cal.itermonthdays(ano, mes):
        if dia == 0:
            continue
        
        data = date(ano, mes, dia)
        weekday = data.weekday()  # 0=Segunda, 6=Domingo
        
        todos_dias += 1
        
        if weekday <= 4:  # Segunda a Sexta
            seg_sex += 1
            seg_sab += 1
        elif weekday == 5:  # Sábado
            seg_sab += 1
    
    return seg_sex, seg_sab, todos_dias

def main():
    ano = 2026
    meses = [
        "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
        "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
    ]
    
    print(f"\n=== Dias Úteis para {ano} ===\n")
    print(f"{'Mês':<12} | {'Seg-Sex':<8} | {'Seg-Sab':<8} | {'7 dias':<8}")
    print("-" * 50)
    
    total_seg_sex = 0
    total_seg_sab = 0
    total_todos = 0
    
    sql_seg_sex = []
    sql_seg_sab = []
    sql_todos = []
    
    for mes_num in range(1, 13):
        seg_sex, seg_sab, todos = contar_dias_por_tipo(ano, mes_num)
        
        total_seg_sex += seg_sex
        total_seg_sab += seg_sab
        total_todos += todos
        
        print(f"{meses[mes_num-1]:<12} | {seg_sex:<8} | {seg_sab:<8} | {todos:<8}")
        
        # Gerar SQL para inserção
        sql_seg_sex.append(f"({ano}, {mes_num}, {seg_sex}, 0, NOW(), NOW())")
        sql_seg_sab.append(f"({ano}, {mes_num}, {seg_sab}, 0, NOW(), NOW())")
        sql_todos.append(f"({ano}, {mes_num}, {todos}, 0, NOW(), NOW())")
    
    print("-" * 50)
    print(f"{'TOTAL':<12} | {total_seg_sex:<8} | {total_seg_sab:<8} | {total_todos:<8}")
    
    print("\n\n=== SQL para inserir dias úteis (Segunda-Sexta) ===")
    print("INSERT INTO dias_uteis (ano, mes, diasUteis, feriados, createdAt, updatedAt) VALUES")
    print(",\n".join(sql_seg_sex) + ";")
    
    print("\n\n=== SQL para inserir dias úteis (Segunda-Sábado) ===")
    print("INSERT INTO dias_uteis (ano, mes, diasUteis, feriados, createdAt, updatedAt) VALUES")
    print(",\n".join(sql_seg_sab) + ";")
    
    print("\n\n=== SQL para inserir dias úteis (7 dias) ===")
    print("INSERT INTO dias_uteis (ano, mes, diasUteis, feriados, createdAt, updatedAt) VALUES")
    print(",\n".join(sql_todos) + ";")

if __name__ == "__main__":
    main()
