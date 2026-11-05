import base64
import io
import openpyxl
import requests

s = requests.Session()
s.get("http://192.168.1.82:3042/api/auth/local-login", allow_redirects=True, timeout=30)
r = s.post(
    "http://192.168.1.82:3042/api/trpc/previsaoPython.gerarBasesPreview",
    json={"json": {"dataInicio": "2020-01-01", "dataFim": "2026-04-30"}},
    timeout=600,
)
data = r.json()["result"]["data"]["json"]
EXCEL = r"c:\Users\pedro.levorato\Documents\SNOP\OneDrive_2026-07-30\1-Módulo Previsão Demanda\1.1 arquivos\1-BasedeDadosVendas.xlsx"


def load(b64=None, path=None):
    wb = openpyxl.load_workbook(
        io.BytesIO(base64.b64decode(b64)) if b64 else path,
        read_only=True,
        data_only=True,
    )
    ws = wb.active
    rows = ws.iter_rows(values_only=True)
    header = next(rows)
    out = {}
    for row in rows:
        if not row or not row[0]:
            continue
        total = 0.0
        for v in row[1:]:
            if v is None or v == "" or str(v).strip() in {"-", " -   "}:
                continue
            total += float(v)
        out[str(row[0]).strip()] = total
    wb.close()
    return out


g = load(b64=data["vendasBase64"])
e = load(path=EXCEL)
ratios = []
for k in sorted(set(g) & set(e)):
    if e[k] == 0:
        continue
    ratios.append((g[k] / e[k], k, g[k], e[k]))
ratios.sort(reverse=True)
print("ratio distribution:")
from collections import Counter
buckets = Counter(round(r, 2) for r, *_ in ratios)
print(buckets.most_common(15))
print("top ratios:")
for r, k, a, b in ratios[:10]:
    print(round(r, 4), k, int(a), int(b))
print("bottom ratios:")
for r, k, a, b in ratios[-10:]:
    print(round(r, 4), k, int(a), int(b))
print("median", sorted(r for r, *_ in ratios)[len(ratios) // 2])
