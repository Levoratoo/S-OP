"""Clear+resync faturamento from ERP, then quick Adidas year totals vs Excel."""
from __future__ import annotations

import base64
import io
import json
import sys
from collections import defaultdict

import openpyxl
import requests

BASE = "http://192.168.1.82:3042"
EXCEL = r"c:\Users\pedro.levorato\Documents\SNOP\OneDrive_2026-07-30\1-Módulo Previsão Demanda\1.1 arquivos\1-BasedeDadosVendas.xlsx"
ENC = "MTS-Adidas-Automática"

s = requests.Session()
s.get(f"{BASE}/api/auth/local-login", allow_redirects=True, timeout=30)

print("triggering faturamento.syncFromSql clearBefore=true ...", flush=True)
r = s.post(
    f"{BASE}/api/trpc/faturamento.syncFromSql",
    json={"json": {"clearBefore": True}},
    timeout=3600,
)
print("sync status", r.status_code, flush=True)
try:
    print(json.dumps(r.json(), ensure_ascii=False, indent=2)[:4000], flush=True)
except Exception:
    print(r.text[:2000], flush=True)
if r.status_code >= 400:
    sys.exit(1)

print("gerarBasesPreview ...", flush=True)
r2 = s.post(
    f"{BASE}/api/trpc/previsaoPython.gerarBasesPreview",
    json={"json": {"dataInicio": "2020-01-01", "dataFim": "2026-04-30"}},
    timeout=600,
)
data = r2.json()["result"]["data"]["json"]


def load_row(b64=None, path=None, code=ENC):
    wb = openpyxl.load_workbook(
        io.BytesIO(base64.b64decode(b64)) if b64 else path,
        read_only=True,
        data_only=True,
    )
    ws = wb.active
    rows = ws.iter_rows(values_only=True)
    header = [str(h).strip() if h is not None else "" for h in next(rows)]
    months = header[1:]
    for row in rows:
        if row and str(row[0]).strip() == code:
            vals = []
            for v in row[1:]:
                if v is None or v == "" or str(v).strip() in {"-", " -   "}:
                    vals.append(0.0)
                else:
                    vals.append(float(v))
            wb.close()
            return months, vals
    wb.close()
    raise SystemExit(f"code {code} not found")


gm, gv = load_row(b64=data["vendasBase64"])
em, ev = load_row(path=EXCEL)
gmap = dict(zip(gm, gv))
emap = dict(zip(em, ev))
by_year = defaultdict(lambda: [0.0, 0.0])
for m in set(gmap) | set(emap):
    y = "20" + m.split("-")[1]
    by_year[y][0] += gmap.get(m, 0.0)
    by_year[y][1] += emap.get(m, 0.0)

print(f"\n=== {ENC} by year after resync ===")
for y in sorted(by_year):
    a, b = by_year[y]
    ratio = round(a / b, 4) if b else None
    print(y, int(a), int(b), ratio, "delta", int(a - b))
