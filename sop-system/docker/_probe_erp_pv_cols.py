"""Inspect candidate ERP views for open PV (Liberado + PRG)."""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    k, v = line.split("=", 1)
    os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

import pymssql

conn = pymssql.connect(
    server=os.environ["ERP_MSSQL_SERVER"],
    port=int(os.environ.get("ERP_MSSQL_PORT") or "1433"),
    user=os.environ["ERP_MSSQL_USER"],
    password=os.environ["ERP_MSSQL_PASSWORD"],
    database=os.environ["ERP_MSSQL_DATABASE"],
    login_timeout=20,
    timeout=180,
)
cur = conn.cursor(as_dict=True)

CANDIDATES = [
    "View_Usr_PedidoVenda_SEOP1",
    "View_Usr_mitra_PedidoVenda_SEOP1",
    "View_Usr_PedidoVenda",
    "View_Usr_PedidoVendaEntregas",
    "Usr_view_ItemPedidoVenda_Portal",
    "view_sis_comr_pedidosVendaAFaturar",
    "View_SIS_COMRSaldoPedidoVenda",
    "View_SIS_EST_PedidosVenda",
    "View_SIS_COMRPedidosVenda01",
    "Carteira",
    "vw_mbi014_PedidosAFaturar",
    "VW_MBI001_Pedidos_Detalhe",
]

for name in CANDIDATES:
    print(f"\n===== {name} =====", flush=True)
    try:
        cur.execute(
            """
            SELECT COLUMN_NAME, DATA_TYPE
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = %s
            ORDER BY ORDINAL_POSITION
            """,
            (name,),
        )
        cols = cur.fetchall()
        if not cols:
            print("no columns", flush=True)
            continue
        print("cols:", ", ".join(c["COLUMN_NAME"] for c in cols), flush=True)
        # sample rows
        cur.execute(f"SELECT TOP 3 * FROM dbo.[{name}]")
        sample = cur.fetchall()
        print(f"sample_rows={len(sample)}", flush=True)
        if sample:
            # print keys that look relevant
            row = sample[0]
            interesting = {
                k: row[k]
                for k in row
                if any(
                    x in k.upper()
                    for x in (
                        "STATUS",
                        "TIPO",
                        "PRG",
                        "LIBER",
                        "COD",
                        "QTD",
                        "QTDE",
                        "SKU",
                        "ITEM",
                        "MATER",
                        "PED",
                        "DATA",
                        "ENTREG",
                        "VALOR",
                        "MARCA",
                        "CLIENTE",
                        "SEQ",
                    )
                )
            }
            print("interesting:", interesting, flush=True)
    except Exception as e:
        print("ERR", e, flush=True)

# Distinct status/tipo on SEOP view if present
for name in ("View_Usr_PedidoVenda_SEOP1", "View_Usr_mitra_PedidoVenda_SEOP1", "View_Usr_PedidoVenda"):
    print(f"\n----- distincts {name} -----", flush=True)
    try:
        cur.execute(
            """
            SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME=%s
            """,
            (name,),
        )
        colnames = [r["COLUMN_NAME"] for r in cur.fetchall()]
        status_cols = [c for c in colnames if "STATUS" in c.upper() or "SITU" in c.upper()]
        tipo_cols = [c for c in colnames if "TIPO" in c.upper() or "NEG" in c.upper() or c.upper() == "PRG"]
        print("status_cols", status_cols, "tipo_cols", tipo_cols, flush=True)
        for sc in status_cols[:3]:
            cur.execute(f"SELECT TOP 20 [{sc}] AS v, COUNT(*) AS n FROM dbo.[{name}] GROUP BY [{sc}] ORDER BY n DESC")
            print(sc, cur.fetchall(), flush=True)
        for tc in tipo_cols[:4]:
            cur.execute(f"SELECT TOP 20 [{tc}] AS v, COUNT(*) AS n FROM dbo.[{name}] GROUP BY [{tc}] ORDER BY n DESC")
            print(tc, cur.fetchall(), flush=True)
    except Exception as e:
        print("ERR", e, flush=True)

conn.close()
