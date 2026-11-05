"""Probe MetricsPROD for pedido/PV views using local .env ERP_* credentials."""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
env_path = ROOT / ".env"
for line in env_path.read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    k, v = line.split("=", 1)
    os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

try:
    import pymssql
except ImportError:
    import subprocess

    subprocess.check_call([sys.executable, "-m", "pip", "install", "pymssql", "-q"])
    import pymssql

server = os.environ["ERP_MSSQL_SERVER"]
port = int(os.environ.get("ERP_MSSQL_PORT") or "1433")
database = os.environ["ERP_MSSQL_DATABASE"]
user = os.environ["ERP_MSSQL_USER"]
password = os.environ["ERP_MSSQL_PASSWORD"]

print(f"connecting {server}:{port}/{database} as {user}", flush=True)
conn = pymssql.connect(
    server=server,
    port=port,
    user=user,
    password=password,
    database=database,
    login_timeout=20,
    timeout=120,
)
cur = conn.cursor(as_dict=True)
cur.execute(
    """
    SELECT TABLE_SCHEMA, TABLE_NAME
    FROM INFORMATION_SCHEMA.VIEWS
    WHERE TABLE_NAME LIKE '%PED%'
       OR TABLE_NAME LIKE '%PV%'
       OR TABLE_NAME LIKE '%CART%'
       OR TABLE_NAME LIKE '%ORDEM%'
       OR TABLE_NAME LIKE '%MITRA%'
       OR TABLE_NAME LIKE '%LIBER%'
       OR TABLE_NAME LIKE '%PRG%'
       OR TABLE_NAME LIKE '%COMERC%'
    ORDER BY TABLE_NAME
    """
)
rows = cur.fetchall()
print(f"VIEWS {len(rows)}", flush=True)
for r in rows:
    print(f"{r['TABLE_SCHEMA']}.{r['TABLE_NAME']}", flush=True)

# Also tables that might be useful
cur.execute(
    """
    SELECT TABLE_SCHEMA, TABLE_NAME
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_TYPE='BASE TABLE'
      AND (
        TABLE_NAME LIKE '%PEDIDO%'
        OR TABLE_NAME LIKE '%PV%'
        OR TABLE_NAME LIKE '%CARTEIRA%'
      )
    ORDER BY TABLE_NAME
    """
)
tabs = cur.fetchall()
print(f"TABLES {len(tabs)}", flush=True)
for r in tabs:
    print(f"{r['TABLE_SCHEMA']}.{r['TABLE_NAME']}", flush=True)

conn.close()
