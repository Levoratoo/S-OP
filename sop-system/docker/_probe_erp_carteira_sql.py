"""Valida a query de carteira Liberado+PRG contra o MetricsPROD."""
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

SOURCE = os.environ.get("ERP_CARTEIRA_SOURCE") or "dbo.View_Usr_PedidoVenda_SEOP1"
SQL = f"""
WITH abertos AS (
  SELECT
    LTRIM(RTRIM(CAST(NumPedido AS nvarchar(50)))) AS codigo,
    LTRIM(RTRIM(CAST(CodItemEstoque AS nvarchar(80)))) AS sku,
    YEAR(DataEntrega) AS anoEnt,
    MONTH(DataEntrega) AS mesEnt,
    CAST(ISNULL(Qtde, 0) AS float) AS qtde,
    CAST(ISNULL(PrecoUnitario, 0) AS float) AS preco
  FROM {SOURCE}
  WHERE StatusPedido = N'Liberado'
    AND UPPER(LTRIM(RTRIM(ISNULL(usr_acabado, N'')))) = N'PRG'
    AND ISNULL(Encerrado, N'N') = N'N'
    AND ISNULL(Qtde, 0) > 0
    AND DataEntrega IS NOT NULL
),
agg AS (
  SELECT
    codigo,
    sku,
    anoEnt,
    mesEnt,
    SUM(qtde) AS quantidade,
    SUM(qtde * preco) AS receitaBruta
  FROM abertos
  WHERE codigo <> N'' AND sku <> N''
  GROUP BY codigo, sku, anoEnt, mesEnt
)
SELECT
  codigo,
  sku,
  anoEnt,
  mesEnt,
  quantidade,
  receitaBruta,
  ROW_NUMBER() OVER (
    PARTITION BY codigo
    ORDER BY anoEnt, mesEnt, sku
  ) AS sequencia
FROM agg
ORDER BY codigo, sequencia
"""

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
cur.execute(SQL)
rows = cur.fetchall()
print(f"rows={len(rows)} source={SOURCE}", flush=True)
for r in rows[:5]:
    print(r, flush=True)
pedidos = len({r["codigo"] for r in rows})
skus = len({r["sku"] for r in rows})
print(f"pedidos={pedidos} skus={skus}", flush=True)
conn.close()
