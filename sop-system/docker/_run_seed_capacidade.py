"""Roda cadastrosSistema.seedCapacidade e revalida capacidade.calcular."""
from __future__ import annotations

import http.cookiejar
import json
import os
import sys
import urllib.parse
import urllib.request

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

BASE = os.environ.get("SNOP_BASE", "http://192.168.1.82:3042")
ANO = int(os.environ.get("AUDIT_ANO", "2026"))


def call(opener, path, payload=None, method="GET", timeout=600):
    if method == "GET":
        url = f"{BASE}{path}"
        if payload is not None:
            url += "?input=" + urllib.parse.quote(json.dumps({"json": payload}))
        req = urllib.request.Request(url)
    else:
        req = urllib.request.Request(
            f"{BASE}{path}",
            data=json.dumps({"json": payload if payload is not None else {}}).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
    with opener.open(req, timeout=timeout) as resp:
        body = json.loads(resp.read().decode())
        return body.get("result", {}).get("data", {}).get("json", body)


def main() -> None:
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    opener.open(f"{BASE}/api/auth/local-login", timeout=30)

    print("==> seedCapacidade", flush=True)
    result = call(
        opener,
        "/api/trpc/cadastrosSistema.seedCapacidade",
        {"ano": ANO, "cicloId": 2, "forceVelocidade": True, "dryRun": False},
        method="POST",
        timeout=600,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2), flush=True)

    cap = call(opener, "/api/trpc/capacidade.calcular", {"ano": ANO}, timeout=180)
    com_cap = 0
    total = 0
    for r in cap.get("recursos", []):
        mensal = r.get("capacidadeMensal") or {}
        s = 0
        for m in range(1, 13):
            v = mensal.get(m)
            if v is None:
                v = mensal.get(str(m))
            s += float(v or 0)
        if s > 0:
            com_cap += 1
            total += s
    print(f"recursosComCapacidade={com_cap}/{len(cap.get('recursos', []))}")
    print(f"capacidadeTotalAno={round(total):,}")

    prods = call(opener, "/api/trpc/produtos.list")
    com_fluxo = sum(1 for p in prods if p.get("fluxoId"))
    print(f"produtosComFluxo={com_fluxo}/{len(prods)}")

    fluxos = call(opener, "/api/trpc/fluxos.listComRecursos")
    com_rec = sum(1 for f in fluxos if f.get("recursos"))
    print(f"fluxosComRecursos={com_rec}/{len(fluxos)}")


if __name__ == "__main__":
    main()
