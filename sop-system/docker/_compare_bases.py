import base64
import io
import json
import requests
import openpyxl

EXCEL_VENDAS = r"c:\Users\pedro.levorato\Documents\SNOP\OneDrive_2026-07-30\1-Módulo Previsão Demanda\1.1 arquivos\1-BasedeDadosVendas.xlsx"
EXCEL_PREV = r"c:\Users\pedro.levorato\Documents\SNOP\OneDrive_2026-07-30\1-Módulo Previsão Demanda\1.1 arquivos\1-BasedeDadosPrevisto.xlsx"
EXCEL_CLI = r"c:\Users\pedro.levorato\Documents\SNOP\OneDrive_2026-07-30\1-Módulo Previsão Demanda\1.1 arquivos\1-BasedeDadosClientes.xlsx"

s = requests.Session()
s.get("http://192.168.1.82:3042/api/auth/local-login", allow_redirects=True, timeout=30)

print("syncing cadastros...", flush=True)
rs = s.post(
    "http://192.168.1.82:3042/api/trpc/previsaoPython.syncEstatisticaIaCadastros",
    json={"json": {}},
    timeout=600,
)
print("sync status", rs.status_code)
try:
    sync_payload = rs.json()
    if "error" in sync_payload:
        print(json.dumps(sync_payload["error"], ensure_ascii=False)[:2000])
    else:
        print("sync", json.dumps(sync_payload["result"]["data"]["json"], ensure_ascii=False)[:2000])
except Exception as e:
    print("sync parse", e, rs.text[:500])

print("generating bases...", flush=True)
r = s.post(
    "http://192.168.1.82:3042/api/trpc/previsaoPython.gerarBasesPreview",
    json={"json": {"dataInicio": "2020-01-01", "dataFim": "2026-04-30"}},
    timeout=600,
)
print("preview status", r.status_code)
payload = r.json()
if "error" in payload:
    print(json.dumps(payload["error"], ensure_ascii=False)[:2000])
    raise SystemExit(1)
data = payload["result"]["data"]["json"]
print("stats", json.dumps(data["stats"], ensure_ascii=False))


def encodings_from_b64(b64: str | None, col=0):
    if not b64:
        return []
    wb = openpyxl.load_workbook(io.BytesIO(base64.b64decode(b64)), read_only=True, data_only=True)
    ws = wb.active
    rows = ws.iter_rows(values_only=True)
    header = next(rows)
    print(" generated header first/last", header[:4], header[-3:], "ncols", len(header))
    codes = [row[col] for row in rows if row and row[col]]
    wb.close()
    return codes


def encodings_from_file(path, col=0):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.active
    rows = ws.iter_rows(values_only=True)
    header = next(rows)
    print(" excel header first/last", header[:4], header[-3:], "ncols", len(header))
    codes = [row[col] for row in rows if row and row[col]]
    wb.close()
    return codes


gen_v = encodings_from_b64(data.get("vendasBase64"))
exc_v = encodings_from_file(EXCEL_VENDAS)
print("vendas gen", len(gen_v), "excel", len(exc_v))
print("only gen", sorted(set(map(str, gen_v)) - set(map(str, exc_v)))[:30], "count", len(set(map(str, gen_v)) - set(map(str, exc_v))))
print("only excel", sorted(set(map(str, exc_v)) - set(map(str, gen_v))))

gen_p = encodings_from_b64(data.get("previstoBase64"))
exc_p = encodings_from_file(EXCEL_PREV)
print("previsto gen", len(gen_p), "excel", len(exc_p))
print("prev only gen sample", sorted(set(map(str, gen_p)) - set(map(str, exc_p)))[:15])
print("prev only excel", sorted(set(map(str, exc_p)) - set(map(str, gen_p)))[:15])

gen_c = encodings_from_b64(data.get("clientesBase64"))
print("clientes gen rows", len(gen_c), "unique codigo", len(set(map(str, gen_c))))
