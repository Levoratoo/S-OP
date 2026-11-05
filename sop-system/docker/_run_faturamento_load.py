"""Dispara faturamento.syncFromSql na API do S&OP (carga persistente do ano)."""
from __future__ import annotations

import http.cookiejar
import json
import os
import sys
import urllib.error
import urllib.request

BASE = os.environ.get("SNOP_BASE", "http://192.168.1.82:3042")


def main() -> None:
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    opener.open(f"{BASE}/api/auth/local-login", timeout=60)

    body = json.dumps({"json": {"clearBefore": True}}).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE}/api/trpc/faturamento.syncFromSql",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    print(f"POST {req.full_url} (timeout 120min)...", flush=True)
    try:
        with opener.open(req, timeout=7200) as resp:
            raw = resp.read().decode("utf-8", "replace")
            print("status", resp.status, flush=True)
            print(raw[:2000], flush=True)
            data = json.loads(raw)
            result = data.get("result", {}).get("data", {}).get("json") or data
            print("RESULT", json.dumps(result, ensure_ascii=False, indent=2)[:2000], flush=True)
    except urllib.error.HTTPError as exc:
        print("HTTP", exc.code, exc.read()[:2000].decode("utf-8", "replace"), flush=True)
        sys.exit(1)
    except Exception as exc:
        print("ERR", exc, flush=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
