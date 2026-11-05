"""Find how PRG type appears on Liberado open orders."""
from __future__ import annotations

import os
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

print("=== Liberado sample with all fields ===", flush=True)
cur.execute(
    """
    SELECT TOP 5 *
    FROM dbo.View_Usr_PedidoVenda_SEOP1
    WHERE StatusPedido = 'Liberado'
    """
)
rows = cur.fetchall()
for i, r in enumerate(rows):
    print(f"-- row {i} --", flush=True)
    for k, v in r.items():
        print(f"  {k}: {v}", flush=True)

print("\n=== usr_acabado for Liberado ===", flush=True)
cur.execute(
    """
    SELECT TOP 30 usr_acabado AS v, COUNT(*) AS n
    FROM dbo.View_Usr_PedidoVenda_SEOP1
    WHERE StatusPedido = 'Liberado'
    GROUP BY usr_acabado
    ORDER BY n DESC
    """
)
print(cur.fetchall(), flush=True)

print("\n=== Titulo for Liberado ===", flush=True)
cur.execute(
    """
    SELECT TOP 30 Titulo AS v, COUNT(*) AS n
    FROM dbo.View_Usr_PedidoVenda_SEOP1
    WHERE StatusPedido = 'Liberado'
    GROUP BY Titulo
    ORDER BY n DESC
    """
)
print(cur.fetchall(), flush=True)

print("\n=== FoiLiberado for Status Liberado ===", flush=True)
cur.execute(
    """
    SELECT FoiLiberado AS v, COUNT(*) AS n
    FROM dbo.View_Usr_PedidoVenda_SEOP1
    WHERE StatusPedido = 'Liberado'
    GROUP BY FoiLiberado
    """
)
print(cur.fetchall(), flush=True)

print("\n=== Encerrado for Liberado ===", flush=True)
cur.execute(
    """
    SELECT Encerrado AS v, COUNT(*) AS n
    FROM dbo.View_Usr_PedidoVenda_SEOP1
    WHERE StatusPedido = 'Liberado'
    GROUP BY Encerrado
    """
)
print(cur.fetchall(), flush=True)

# Look for tipo/PRG columns on header/item tables
print("\n=== COMRHeaderPedido columns with TIPO/PRG/STATUS ===", flush=True)
cur.execute(
    """
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME='COMRHeaderPedido'
      AND (COLUMN_NAME LIKE '%Tipo%' OR COLUMN_NAME LIKE '%PRG%' OR COLUMN_NAME LIKE '%Status%'
           OR COLUMN_NAME LIKE '%Negocio%' OR COLUMN_NAME LIKE '%usr_%' OR COLUMN_NAME LIKE '%Situ%')
    ORDER BY COLUMN_NAME
    """
)
print([r["COLUMN_NAME"] for r in cur.fetchall()], flush=True)

print("\n=== COMRItemPedido columns with TIPO/PRG ===", flush=True)
cur.execute(
    """
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME='COMRItemPedido'
      AND (COLUMN_NAME LIKE '%Tipo%' OR COLUMN_NAME LIKE '%PRG%' OR COLUMN_NAME LIKE '%Status%'
           OR COLUMN_NAME LIKE '%Negocio%' OR COLUMN_NAME LIKE '%usr_%' OR COLUMN_NAME LIKE '%Situ%'
           OR COLUMN_NAME LIKE '%Acabado%')
    ORDER BY COLUMN_NAME
    """
)
print([r["COLUMN_NAME"] for r in cur.fetchall()], flush=True)

# Open qty: QdteFaturar > 0 for Liberado
print("\n=== Liberado with QdteFaturar > 0 ===", flush=True)
cur.execute(
    """
    SELECT COUNT(*) AS n, SUM(QdteFaturar) AS qtd, SUM(ValorFaturar) AS valor
    FROM dbo.View_Usr_PedidoVenda_SEOP1
    WHERE StatusPedido = 'Liberado' AND ISNULL(QdteFaturar,0) > 0
    """
)
print(cur.fetchall(), flush=True)

print("\n=== Liberado with SaldoAtual > 0 ===", flush=True)
cur.execute(
    """
    SELECT COUNT(*) AS n, SUM(SaldoAtual) AS saldo
    FROM dbo.View_Usr_PedidoVenda_SEOP1
    WHERE StatusPedido = 'Liberado' AND ISNULL(SaldoAtual,0) > 0
    """
)
print(cur.fetchall(), flush=True)

# Search columns containing PRG anywhere in views
print("\n=== columns containing PRG/JIT/VAR/Negocio in pedido views ===", flush=True)
cur.execute(
    """
    SELECT TABLE_NAME, COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME LIKE '%Pedido%'
      AND (
        COLUMN_NAME LIKE '%PRG%'
        OR COLUMN_NAME LIKE '%JIT%'
        OR COLUMN_NAME LIKE '%Negocio%'
        OR COLUMN_NAME LIKE '%TipoNeg%'
        OR COLUMN_NAME LIKE '%TipoPed%'
      )
    ORDER BY TABLE_NAME, COLUMN_NAME
    """
)
print(cur.fetchall(), flush=True)

conn.close()
