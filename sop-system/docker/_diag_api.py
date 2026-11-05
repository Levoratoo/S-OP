"""Diagnose SAIDA vs DEVOLUCAO vs Excel for Adidas Automática via tRPC/DB API if possible.
Also check if we can call sync endpoints.
"""
import requests
import json

BASE = "http://192.168.1.82:3042"
s = requests.Session()
s.get(f"{BASE}/api/auth/local-login", allow_redirects=True, timeout=30)

# Try common endpoints for fat stats
for path in [
    "faturamento.stats",
    "faturamento.list",
    "vendas.faturamentoStats",
]:
    try:
        r = s.get(f"{BASE}/api/trpc/{path}", timeout=30)
        print(path, r.status_code, r.text[:200])
    except Exception as e:
        print(path, e)

# Search procedures via batch
r = s.get(f"{BASE}/api/trpc/faturamento.getStats?input={requests.utils.quote(json.dumps({'json':{}}))}", timeout=60)
print("getStats", r.status_code, r.text[:500])
