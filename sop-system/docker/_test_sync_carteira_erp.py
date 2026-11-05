"""Chama carteiraPedidos.syncFromErp no ambiente compartilhado."""
from __future__ import annotations

import http.cookiejar
import json
import urllib.parse
import urllib.request

HOST = "192.168.1.82"
BASE = f"http://{HOST}:3042"

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
opener.open(BASE + "/api/auth/local-login", timeout=30)

# tRPC mutation POST
payload = {"json": None}
body = json.dumps(payload).encode()
req = urllib.request.Request(
    BASE + "/api/trpc/carteiraPedidos.syncFromErp",
    data=body,
    headers={"Content-Type": "application/json"},
    method="POST",
)
try:
    with opener.open(req, timeout=300) as resp:
        text = resp.read().decode()
        print("status", resp.status, flush=True)
        print(text[:2000], flush=True)
except Exception as exc:
    data = getattr(exc, "read", lambda: b"")()
    print("ERR", data.decode()[:2000] if data else exc, flush=True)
    raise

# list count
req2 = urllib.request.Request(
    BASE
    + "/api/trpc/carteiraPedidos.list?input="
    + urllib.parse.quote(json.dumps({"json": {"limit": 2000}}))
)
with opener.open(req2, timeout=60) as resp:
    data = json.loads(resp.read().decode())
    rows = data["result"]["data"]["json"]
    print(f"list_count={len(rows)}", flush=True)
    if rows:
        print("sample", rows[0], flush=True)
