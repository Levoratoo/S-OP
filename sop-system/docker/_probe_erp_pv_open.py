"""Count open Liberado+PRG rows and shape for carteira sync."""
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

queries = {
    "liberado_prg": """
      SELECT COUNT(*) n FROM dbo.View_Usr_PedidoVenda_SEOP1
      WHERE StatusPedido='Liberado' AND usr_acabado='PRG'
    """,
    "liberado_prg_aberto_encerrado_n": """
      SELECT COUNT(*) n, SUM(ISNULL(Qtde,0)) qtde, SUM(ISNULL(QdteFaturar,0)) faturar
      FROM dbo.View_Usr_PedidoVenda_SEOP1
      WHERE StatusPedido='Liberado' AND usr_acabado='PRG' AND ISNULL(Encerrado,'N')='N'
    """,
    "liberado_prg_qdtefaturar_gt0": """
      SELECT COUNT(*) n, SUM(QdteFaturar) q, SUM(ValorFaturar) v
      FROM dbo.View_Usr_PedidoVenda_SEOP1
      WHERE StatusPedido='Liberado' AND usr_acabado='PRG' AND ISNULL(QdteFaturar,0)>0
    """,
    "distinct_pedido_sku_aberto": """
      SELECT COUNT(*) n FROM (
        SELECT NumPedido, CodItemEstoque
        FROM dbo.View_Usr_PedidoVenda_SEOP1
        WHERE StatusPedido='Liberado' AND usr_acabado='PRG'
          AND ISNULL(Encerrado,'N')='N' AND ISNULL(Qtde,0)>0
        GROUP BY NumPedido, CodItemEstoque
      ) x
    """,
    "sample_open": """
      SELECT TOP 8 NumPedido, CodItemEstoque, usr_acabado, StatusPedido, Encerrado,
             DataEntrega, DtNegociada, DataFaturamento, Qtde, QdteFaturar, ValorFaturar, PrecoUnitario
      FROM dbo.View_Usr_PedidoVenda_SEOP1
      WHERE StatusPedido='Liberado' AND usr_acabado='PRG'
        AND ISNULL(Encerrado,'N')='N' AND ISNULL(Qtde,0)>0
      ORDER BY DataEntrega DESC
    """,
}

for name, sql in queries.items():
    print(f"\n=== {name} ===", flush=True)
    cur.execute(sql)
    rows = cur.fetchall()
    for r in rows:
        print(r, flush=True)

conn.close()
