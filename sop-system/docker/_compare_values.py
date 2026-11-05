import base64
import io
import json
from collections import defaultdict

import openpyxl
import requests

EXCEL_VENDAS = r"c:\Users\pedro.levorato\Documents\SNOP\OneDrive_2026-07-30\1-Módulo Previsão Demanda\1.1 arquivos\1-BasedeDadosVendas.xlsx"
EXCEL_CLI = r"c:\Users\pedro.levorato\Documents\SNOP\OneDrive_2026-07-30\1-Módulo Previsão Demanda\1.1 arquivos\1-BasedeDadosClientes.xlsx"
EXCEL_PREV = r"c:\Users\pedro.levorato\Documents\SNOP\OneDrive_2026-07-30\1-Módulo Previsão Demanda\1.1 arquivos\1-BasedeDadosPrevisto.xlsx"

s = requests.Session()
s.get("http://192.168.1.82:3042/api/auth/local-login", allow_redirects=True, timeout=30)
r = s.post(
    "http://192.168.1.82:3042/api/trpc/previsaoPython.gerarBasesPreview",
    json={"json": {"dataInicio": "2020-01-01", "dataFim": "2026-04-30"}},
    timeout=600,
)
data = r.json()["result"]["data"]["json"]


def load_matrix(b64_or_path, is_b64=True, code_cols=1):
    if is_b64:
        wb = openpyxl.load_workbook(io.BytesIO(base64.b64decode(b64_or_path)), read_only=True, data_only=True)
    else:
        wb = openpyxl.load_workbook(b64_or_path, read_only=True, data_only=True)
    ws = wb.active
    rows = ws.iter_rows(values_only=True)
    header = [str(h).strip() if h is not None else "" for h in next(rows)]
    months = header[code_cols:]
    totals = {}
    n = 0
    for row in rows:
        if not row or row[0] is None:
            continue
        n += 1
        key = tuple(str(row[i]).strip() for i in range(code_cols))
        vals = []
        for v in row[code_cols:]:
            if v is None or v == "" or str(v).strip() in {"-", " -   "}:
                vals.append(0.0)
            else:
                try:
                    vals.append(float(v))
                except Exception:
                    vals.append(0.0)
        totals[key] = vals
    wb.close()
    return header, months, totals, n


def compare(name, gen, exc, sample_n=5):
    gh, gm, gt, gn = gen
    eh, em, et, en = exc
    print(f"\n=== {name} ===")
    print("rows gen/excel", gn, en, "keys", len(gt), len(et))
    print("months equal", gm == em, "ncols", len(gm), len(em))
    only_g = set(gt) - set(et)
    only_e = set(et) - set(gt)
    print("only gen keys", len(only_g), list(only_g)[:5])
    print("only excel keys", len(only_e), list(only_e)[:5])
    common = set(gt) & set(et)
    mismatches = []
    max_abs = 0.0
    sum_gen = 0.0
    sum_exc = 0.0
    for k in common:
        a = gt[k]
        b = et[k]
        # pad
        m = max(len(a), len(b))
        a = a + [0.0] * (m - len(a))
        b = b + [0.0] * (m - len(b))
        diff = sum(abs(x - y) for x, y in zip(a, b))
        sum_gen += sum(a)
        sum_exc += sum(b)
        max_abs = max(max_abs, max(abs(x - y) for x, y in zip(a, b)))
        if diff > 0.01:
            mismatches.append((diff, k, sum(a), sum(b)))
    mismatches.sort(reverse=True)
    print("common", len(common), "mismatched rows", len(mismatches), "maxAbsCell", round(max_abs, 4))
    print("sum gen/excel", round(sum_gen, 2), round(sum_exc, 2), "delta", round(sum_gen - sum_exc, 2))
    for d, k, sg, se in mismatches[:sample_n]:
        print("  mismatch", k, "diffSum", round(d, 2), "totG", round(sg, 2), "totE", round(se, 2))


gv = load_matrix(data["vendasBase64"], True, 1)
ev = load_matrix(EXCEL_VENDAS, False, 1)
compare("VENDAS", gv, ev)

gp = load_matrix(data["previstoBase64"], True, 1)
ep = load_matrix(EXCEL_PREV, False, 1)
compare("PREVISTO", gp, ep)

gc = load_matrix(data["clientesBase64"], True, 2)
ec = load_matrix(EXCEL_CLI, False, 2)
compare("CLIENTES", gc, ec, sample_n=8)
