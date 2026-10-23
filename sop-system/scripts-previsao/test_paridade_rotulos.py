#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Testes unitários dos helpers de paridade (sem sklearn/pandas obrigatório)."""

from __future__ import annotations

import unittest
from datetime import datetime
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

from previsao_meses import (  # noqa: E402
    MESES_PT,
    extrair_marca_codigo,
    normalizar_rotulo_mes,
    rotulo_mes_pt,
)


class TestRotulosMes(unittest.TestCase):
    def test_normaliza_string_pt(self):
        self.assertEqual(normalizar_rotulo_mes("jan-20"), "jan-20")
        self.assertEqual(normalizar_rotulo_mes("AGO-26"), "ago-26")
        self.assertEqual(normalizar_rotulo_mes("set/2026"), "set-26")

    def test_normaliza_string_en(self):
        self.assertEqual(normalizar_rotulo_mes("Sep/2026"), "set-26")
        self.assertEqual(normalizar_rotulo_mes("Oct-25"), "out-25")
        self.assertEqual(normalizar_rotulo_mes("May-26"), "mai-26")

    def test_normaliza_datetime(self):
        self.assertEqual(normalizar_rotulo_mes(datetime(2026, 8, 1)), "ago-26")

    def test_projecao_headers_pt(self):
        self.assertEqual(rotulo_mes_pt(2026, 9), "set-26")
        self.assertEqual(f"{MESES_PT[8]}/2026", "set/2026")


class TestMarcaExtracao(unittest.TestCase):
    def test_sku_marca(self):
        self.assertEqual(extrair_marca_codigo("80.01.000372-Outlet Lingerie"), "Outlet Lingerie")

    def test_tml(self):
        self.assertEqual(extrair_marca_codigo("MTS-Adidas-Automática"), "Adidas")
        self.assertEqual(extrair_marca_codigo("MTO-Fórmula Animal-Automática"), "Fórmula Animal")


if __name__ == "__main__":
    unittest.main()
