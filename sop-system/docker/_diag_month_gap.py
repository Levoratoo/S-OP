"""Diagnose gen vs Excel: month ratios + CFOP contribution for one encoding."""
from __future__ import annotations

import base64
import io
from collections import defaultdict

import openpyxl
import requests

EXCEL = r"c:\Users\pedro.levorato\Documents\SNOP\OneDrive_2026-07-30\1-Módulo Previsão Demanda\1.1 arquivos\1-BasedeDadosVendas.xlsx"
ENC = "MTS-Adidas-Automática"

s = requests.Session()
s.get("http://192.168.1.82:3042/api/auth/local-login", allow_redirects=True, timeout=30)
r = s.post(
    "http://192.168.1.82:3042/api/trpc/previsaoPython.gerarBasesPreview",
    json={"json": {"dataInicio": "2020-01-01", "dataFim": "2026-04-30"}},
    timeout=600,
)
data = r.json()["result"]["data"]["json"]


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
# align by month label
gmap = dict(zip(gm, gv))
emap = dict(zip(em, ev))
months = sorted(set(gmap) | set(emap), key=lambda m: (int("20" + m.split("-")[1]), ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"].index(m.split("-")[0])))

print(f"=== {ENC} month compare ===")
print(f"{'mes':8} {'gen':>12} {'excel':>12} {'ratio':>8} {'delta':>12}")
by_year = defaultdict(lambda: [0.0, 0.0])
for m in months:
    a = gmap.get(m, 0.0)
    b = emap.get(m, 0.0)
    ratio = (a / b) if b else (999 if a else 0)
    print(f"{m:8} {a:12.0f} {b:12.0f} {ratio:8.3f} {a-b:12.0f}")
    y = "20" + m.split("-")[1]
    by_year[y][0] += a
    by_year[y][1] += b

print("\n=== by year ===")
for y in sorted(by_year):
    a, b = by_year[y]
    print(y, int(a), int(b), round(a / b, 3) if b else None)
