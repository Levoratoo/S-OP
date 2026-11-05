"""Chama cadastrosSistema.seedFromFaturamento no snop-app."""
from __future__ import annotations

import http.cookiejar
import json
import os
import urllib.error
import urllib.request

BASE = os.environ.get("SNOP_BASE", "http://192.168.1.82:3042")
DRY = os.environ.get("SEED_DRY_RUN", "0") == "1"


def main() -> None:
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    opener.open(f"{BASE}/api/auth/local-login", timeout=30)

    req = urllib.request.Request(
        f"{BASE}/api/trpc/cadastrosSistema.seedFromFaturamento",
        data=json.dumps({"json": {"dryRun": DRY}}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with opener.open(req, timeout=600) as resp:
            body = json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        print("HTTP", exc.code, exc.read()[:800].decode("utf-8", "replace"))
        raise SystemExit(1)

    data = body.get("result", {}).get("data", {}).get("json", body)
    print(json.dumps(data, ensure_ascii=False, indent=2))

    # Contagens pós-seed
    for path in ("/api/trpc/produtos.list", "/api/trpc/clientes.list", "/api/trpc/dashboard.demanda"):
        with opener.open(f"{BASE}{path}", timeout=60) as resp:
            payload = json.loads(resp.read().decode())
            val = payload.get("result", {}).get("data", {}).get("json")
            if isinstance(val, list):
                print(f"{path}: count={len(val)}")
            else:
                print(f"{path}: {json.dumps(val, ensure_ascii=False)}")


if __name__ == "__main__":
    main()
