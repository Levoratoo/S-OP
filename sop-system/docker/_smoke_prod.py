"""Smoke pós-deploy: health + login + rotas críticas + preview ETL."""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

BASE = os.environ.get("SNOP_BASE", "http://192.168.1.82:3042").rstrip("/")


def get(url: str, opener: urllib.request.OpenerDirector | None = None) -> tuple[int, str]:
    req = urllib.request.Request(url, method="GET")
    try:
        if opener:
            with opener.open(req, timeout=60) as r:
                return r.status, r.read().decode("utf-8", "replace")
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")


def main() -> int:
    errors: list[str] = []
    print(f"BASE={BASE}")

    code, body = get(BASE + "/")
    print(f"GET / -> {code}")
    if code not in (200, 302):
        errors.append(f"home status {code}")

    jar = urllib.request.HTTPCookieProcessor()
    opener = urllib.request.build_opener(jar)
    code, _ = get(BASE + "/api/auth/local-login", opener)
    print(f"local-login -> {code}")
    if code not in (200, 302):
        errors.append(f"login {code}")

    for path in (
        "/previsao-python",
        "/vendas/importar",
        "/demanda/colaboracoes",
        "/cadastros/produtos",
        "/cadastros/skus-projetar",
        "/cadastros/depara",
    ):
        c, html = get(BASE + path, opener)
        ok = c == 200 and ("root" in html.lower() or "html" in html.lower())
        print(f"  {path} -> {c} {'OK' if ok else 'FAIL'}")
        if not ok:
            errors.append(path)

    # tRPC mesFechado + gerarBasesPreview (stats only, no full Python job)
    def trpc_get(path: str) -> dict:
        url = BASE + "/api/trpc/" + path
        c, raw = get(url, opener)
        if c != 200:
            raise RuntimeError(f"{path} HTTP {c}: {raw[:300]}")
        return json.loads(raw)

    def trpc_mut(path: str, payload: dict) -> dict:
        url = BASE + "/api/trpc/" + path
        data = json.dumps({"json": payload}).encode()
        req = urllib.request.Request(
            url,
            data=data,
            method="POST",
            headers={"Content-Type": "application/json"},
        )
        with opener.open(req, timeout=600) as r:
            return json.loads(r.read().decode())

    try:
        mf = trpc_get("faturamento.mesFechadoCheck")
        print("mesFechado", json.dumps(mf.get("result", {}).get("data", {}).get("json", mf) , ensure_ascii=False)[:400])
    except Exception as e:
        errors.append(f"mesFechado: {e}")
        print("mesFechado FAIL", e)

    try:
        preview = trpc_mut(
            "previsaoPython.gerarBasesPreview",
            {"dataInicio": "2020-01-01", "dataFim": "2026-04-30"},
        )
        stats = preview["result"]["data"]["json"]["stats"]
        print("gerarBasesPreview stats", json.dumps(stats, ensure_ascii=False))
        if stats.get("gruposVendas", 0) < 1:
            errors.append("gruposVendas=0")
        if stats.get("previstoOrigem") not in (
            "seed_previsto",
            "seed_sku",
            "previsoes",
            "ciclo_anterior",
        ):
            errors.append(f"previstoOrigem={stats.get('previstoOrigem')}")
    except Exception as e:
        errors.append(f"preview: {e}")
        print("preview FAIL", e)

    if errors:
        print("SMOKE FAIL:", errors)
        return 1
    print("SMOKE OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
