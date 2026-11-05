"""Audita endpoints que consomem faturamento importado."""
from __future__ import annotations

import http.cookiejar
import json
import os
import urllib.error
import urllib.parse
import urllib.request

BASE = os.environ.get("SNOP_BASE", "http://192.168.1.82:3042")
YEAR = 2026


def call(opener, path: str, payload: dict | None = None, method: str = "GET"):
    if method == "GET":
        url = f"{BASE}{path}"
        if payload is not None:
            url += "?input=" + urllib.parse.quote(json.dumps({"json": payload}))
        req = urllib.request.Request(url)
    else:
        req = urllib.request.Request(
            f"{BASE}{path}",
            data=json.dumps({"json": payload or {}}).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
    try:
        with opener.open(req, timeout=180) as resp:
            body = json.loads(resp.read().decode())
            data = body.get("result", {}).get("data", {}).get("json", body)
            return resp.status, data, None
    except urllib.error.HTTPError as exc:
        return exc.code, None, exc.read()[:400].decode("utf-8", "replace")
    except Exception as exc:
        return 0, None, str(exc)


def summarize(label, status, data, err):
    if err:
        print(f"[FAIL] {label}: HTTP {status} {err[:180]}")
        return False
    if isinstance(data, list):
        n = len(data)
        sample = data[0] if data else None
        print(f"[OK]   {label}: items={n} sample={json.dumps(sample, ensure_ascii=False)[:140]}")
        return n > 0
    if isinstance(data, dict):
        keys = list(data.keys())[:8]
        print(f"[OK]   {label}: keys={keys} snippet={json.dumps(data, ensure_ascii=False)[:180]}")
        # consider empty stats as fail for faturamento year
        if "totalRegistros" in data:
            return int(data.get("totalRegistros") or 0) > 0
        return True
    print(f"[OK]   {label}: {type(data)} {str(data)[:120]}")
    return True


def main():
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    opener.open(f"{BASE}/api/auth/local-login", timeout=30)

    checks = []

    # Direct faturamento
    for label, path, payload in [
        ("faturamento.stats 2026", "/api/trpc/faturamento.stats", {"year": YEAR}),
        ("faturamento.porMes 2026", "/api/trpc/faturamento.porMes", {"ano": YEAR}),
        ("faturamento.list 2026", "/api/trpc/faturamento.list", {"year": YEAR, "limit": 5}),
    ]:
        status, data, err = call(opener, path, payload)
        checks.append((label, summarize(label, status, data, err)))

    # Dashboard vendas (reads faturamento)
    for label, path, payload in [
        ("dashboard.vendasPorMesConsolidadas", "/api/trpc/dashboard.vendasPorMesConsolidadas", {"ano": YEAR}),
        ("dashboard.vendasPorMarca", "/api/trpc/dashboard.vendasPorMarca", {"ano": YEAR}),
        ("dashboard.vendasPorLinha", "/api/trpc/dashboard.vendasPorLinha", {"ano": YEAR}),
        ("dashboard.vendasPorUF", "/api/trpc/dashboard.vendasPorUF", {"ano": YEAR}),
        ("dashboard.vendasConsolidadasPorProduto", "/api/trpc/dashboard.vendasConsolidadasPorProduto", {"ano": YEAR}),
    ]:
        status, data, err = call(opener, path, payload)
        checks.append((label, summarize(label, status, data, err)))

    # Histórico de Vendas + Dashboard Demanda (agora ligados a faturamento)
    for label, path, payload in [
        ("historico via faturamento.list", "/api/trpc/faturamento.list", {"year": YEAR, "limit": 5}),
        ("dashboard.demanda", "/api/trpc/dashboard.demanda", None),
        ("dashboard.vendasPorMes", "/api/trpc/dashboard.vendasPorMes", {"ano": YEAR}),
    ]:
        status, data, err = call(opener, path, payload)
        if label == "dashboard.demanda" and isinstance(data, dict):
            tv = int(data.get("totalVendas") or 0)
            print(f"[OK]   {label}: totalVendas={tv} clientes={data.get('totalClientes')} produtos={data.get('totalProdutos')}")
            checks.append((label, tv > 0))
        else:
            checks.append((label, summarize(label, status, data, err)))

    status, data, err = call(opener, "/api/trpc/faturamento.stats", {"year": YEAR, "month": 7})
    checks.append(("faturamento.stats jul/2026", summarize("faturamento.stats jul/2026", status, data, err)))

    ok = sum(1 for _, v in checks if v)
    print(f"\nSUMMARY ok={ok}/{len(checks)}")


if __name__ == "__main__":
    main()
