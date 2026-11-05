"""Conta faturamento ERP e local por ano — diagnóstico 2026."""
from __future__ import annotations

import http.cookiejar
import json
import os
import urllib.request
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
src = os.environ.get("ERP_FATURAMENTO_SOURCE") or "dbo.Usr_VIEW_MITRA_FAT_02"
cur.execute(
    f"""
    SELECT YEAR(DATAEMISSAO) AS ano, COUNT(*) AS n
    FROM {src}
    WHERE DATAEMISSAO >= '2024-01-01'
    GROUP BY YEAR(DATAEMISSAO)
    ORDER BY ano
    """
)
print("ERP years:", cur.fetchall(), flush=True)
conn.close()

HOST = "192.168.1.82"
BASE = f"http://{HOST}:3042"
jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
opener.open(BASE + "/api/auth/local-login", timeout=30)
req = urllib.request.Request(BASE + "/api/trpc/faturamento.testSqlConnection")
with opener.open(req, timeout=120) as resp:
    print("testSql", resp.read().decode()[:800], flush=True)
