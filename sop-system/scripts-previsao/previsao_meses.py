#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Rótulos de competência pt-BR (independentes do locale do SO)."""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from typing import Any, Optional

MESES_PT = (
    "jan",
    "fev",
    "mar",
    "abr",
    "mai",
    "jun",
    "jul",
    "ago",
    "set",
    "out",
    "nov",
    "dez",
)
MESES_PT_NUM = {nome: idx + 1 for idx, nome in enumerate(MESES_PT)}
MESES_EN_PARA_PT = {
    "jan": "jan",
    "feb": "fev",
    "mar": "mar",
    "apr": "abr",
    "may": "mai",
    "jun": "jun",
    "jul": "jul",
    "aug": "ago",
    "sep": "set",
    "oct": "out",
    "nov": "nov",
    "dec": "dez",
}


def rotulo_mes_pt(ano: int, mes: int) -> str:
    """Retorna rótulo canônico jan-20 ... dez-99."""
    return f"{MESES_PT[int(mes) - 1]}-{str(int(ano))[-2:]}"


def normalizar_rotulo_mes(valor: Any) -> Optional[str]:
    """
    Converte datetime / string EN-PT / Excel serial em rótulo pt-BR 'jan-20'.
    Retorna None se não for um mês reconhecível.
    """
    if valor is None:
        return None

    try:
        import pandas as pd  # optional

        if isinstance(valor, float) and pd.isna(valor):
            return None
    except Exception:
        pass

    if isinstance(valor, datetime):
        return rotulo_mes_pt(valor.year, valor.month)

    if isinstance(valor, date) and not isinstance(valor, datetime):
        return rotulo_mes_pt(valor.year, valor.month)

    if isinstance(valor, (int, float)) and not isinstance(valor, bool):
        try:
            base = datetime(1899, 12, 30) + timedelta(days=int(valor))
            if 2015 <= base.year <= 2100:
                return rotulo_mes_pt(base.year, base.month)
        except Exception:
            return None
        return None

    texto = str(valor).strip()
    if not texto or texto.lower() in {"nan", "none", "nat"}:
        return None

    if " " in texto or "T" in texto or re.match(r"^\d{4}-\d{2}-\d{2}", texto):
        try:
            import pandas as pd

            parsed = pd.to_datetime(texto, errors="coerce")
            if parsed is not None and not pd.isna(parsed):
                return rotulo_mes_pt(int(parsed.year), int(parsed.month))
        except Exception:
            pass

    match = re.match(r"^([A-Za-zÀ-ÿ]{3})[-_/ ](\d{2}|\d{4})$", texto)
    if not match:
        return None

    mes_raw = match.group(1).lower()[:3]
    mes_pt = mes_raw if mes_raw in MESES_PT_NUM else MESES_EN_PARA_PT.get(mes_raw)
    if not mes_pt:
        return None

    ano_str = match.group(2)
    ano = 2000 + int(ano_str) if len(ano_str) == 2 else int(ano_str)
    return rotulo_mes_pt(ano, MESES_PT_NUM[mes_pt])


def extrair_marca_codigo(codigo: Any) -> str:
    """Extrai marca de SKU-Marca ou MTS/MTO-Marca-Linha."""
    if codigo is None or not isinstance(codigo, str):
        return "INDEFINIDA"
    match = re.match(r"^[\d\.]+-(.*)", codigo)
    if match:
        return match.group(1).strip() or "INDEFINIDA"
    partes = codigo.split("-")
    if len(partes) >= 2:
        if partes[0] in {"MTS", "MTO", "ENG"}:
            return partes[1].strip() or "INDEFINIDA"
        return partes[1].strip() or "INDEFINIDA"
    return "INDEFINIDA"
