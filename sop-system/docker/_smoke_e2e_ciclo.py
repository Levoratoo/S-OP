"""Smoke ponta a ponta do ciclo S&OP no ambiente compartilhado."""
from __future__ import annotations

import http.cookiejar
import json
import urllib.error
import urllib.parse
import urllib.request

BASE = "http://192.168.1.82:3042"
ok = 0
fail = 0


def report(name: str, passed: bool, detail: str = "") -> None:
    global ok, fail
    if passed:
        ok += 1
        print(f"OK  {name}" + (f" — {detail}" if detail else ""), flush=True)
    else:
        fail += 1
        print(f"FAIL {name}" + (f" — {detail}" if detail else ""), flush=True)


jar = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def get(path: str, timeout: int = 120):
    with op.open(BASE + path, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def post(path: str, payload: dict | None = None, timeout: int = 300):
    body = json.dumps({"json": payload}).encode()
    req = urllib.request.Request(
        BASE + path,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with op.open(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


# 1) Auth
try:
    op.open(BASE + "/api/auth/local-login", timeout=30)
    me = get("/api/trpc/auth.me")
    report("auth.local-login", True, str(me.get("result", {}).get("data", {}).get("json", {}).get("name", ""))[:40])
except Exception as e:
    report("auth.local-login", False, str(e))
    raise SystemExit(1)

# 2) Faturamento 2026
try:
    q = urllib.parse.quote(json.dumps({"json": {"year": 2026}}))
    stats = get(f"/api/trpc/faturamento.stats?input={q}")["result"]["data"]["json"]
    n = int(float(stats.get("totalRegistros") or 0))
    report("faturamento.2026", n > 100_000, f"{n} registros")
except Exception as e:
    report("faturamento.2026", False, str(e))

# 3) Carteira list
try:
    q = urllib.parse.quote(json.dumps({"json": {"limit": 5}}))
    rows = get(f"/api/trpc/carteiraPedidos.list?input={q}")["result"]["data"]["json"]
    report("carteira.list", isinstance(rows, list), f"{len(rows)} (amostra)")
except Exception as e:
    report("carteira.list", False, str(e))

# 4) syncFromErp exists
try:
    r = post("/api/trpc/carteiraPedidos.syncFromErp", None, timeout=300)
    data = r["result"]["data"]["json"]
    report(
        "carteira.syncFromErp",
        data.get("importados", 0) > 0 or data.get("fetched", 0) > 0,
        f"fetched={data.get('fetched')} importados={data.get('importados')} erros={len(data.get('erros') or [])}",
    )
except Exception as e:
    report("carteira.syncFromErp", False, str(e)[:200])

# 5) Previsão jobs SUCCESS
try:
    q = urllib.parse.quote(json.dumps({"json": {"limit": 20}}))
    jobs = get(f"/api/trpc/previsaoPython.list?input={q}")["result"]["data"]["json"]
    success = [
        j
        for j in jobs
        if j.get("status") == "SUCCESS"
        and "ciclo13" not in str(j.get("scriptVersion") or "").lower()
    ]
    report("previsao.jobsSUCCESS", len(success) > 0, f"{len(success)} jobs (latest #{success[0]['id'] if success else '-'})")
except Exception as e:
    report("previsao.jobsSUCCESS", False, str(e))
    success = []

# 6) Ciclos + MTS itens + realizado
try:
    ciclos = get("/api/trpc/cicloComercial.list")["result"]["data"]["json"]
    report("ciclo.list", len(ciclos) > 0, f"{len(ciclos)} ciclos")
    ciclo = ciclos[0]
    cid = ciclo["id"]
    q = urllib.parse.quote(json.dumps({"json": {"cicloId": cid, "planoColab": "MTS"}}))
    itens = get(f"/api/trpc/cicloComercial.itens?input={q}")["result"]["data"]["json"]
    has_e = any(i.get("e1") is not None or i.get("e2") is not None for i in itens[:20])
    report("ciclo.mtsItens", len(itens) > 0, f"ciclo #{cid} itens={len(itens)} e*= {has_e}")
except Exception as e:
    report("ciclo.list/mts", False, str(e))
    cid = None
    itens = []

try:
    q = urllib.parse.quote(json.dumps({"json": {"anos": [2025, 2026]}}))
    real = get(f"/api/trpc/cicloComercial.realizadoAnual?input={q}", timeout=180)["result"]["data"]["json"]
    report("ciclo.realizadoAnual", len(real) > 100, f"{len(real)} SKUs")
except Exception as e:
    report("ciclo.realizadoAnual", False, str(e)[:200])

# 7) Consolidado + fechar path (não fecha de fato)
if cid:
    try:
        q = urllib.parse.quote(json.dumps({"json": {"cicloId": cid}}))
        cons = get(f"/api/trpc/cicloComercial.consolidado?input={q}")["result"]["data"]["json"]
        planos = cons.get("resumoPlanos") or {}
        report(
            "ciclo.consolidado",
            "mts" in planos and "jito" in planos,
            f"mts={planos.get('mts')} pv={planos.get('pvMto')} crm={planos.get('crm')} jito={planos.get('jito')}",
        )
    except Exception as e:
        report("ciclo.consolidado", False, str(e))

# 8) Pendentes / permissões / relatório
try:
    pend = get("/api/trpc/cadastrosSistema.pendingSkusFromFaturamento")["result"]["data"]["json"]
    report("cadastros.pendingSkus", isinstance(pend, list), f"{len(pend)} pendentes")
except Exception as e:
    report("cadastros.pendingSkus", False, str(e))

try:
    niveis = get("/api/trpc/niveisAcesso.list")["result"]["data"]["json"]
    report("niveisAcesso.list", len(niveis) >= 1, f"{len(niveis)} níveis")
except Exception as e:
    report("niveisAcesso.list", False, str(e))

# 9) Menu routes via HTML shell
try:
    with op.open(BASE + "/demanda/colaboracoes", timeout=30) as resp:
        html = resp.read().decode(errors="replace")
    report("ui.colaboracoes", resp.status == 200 and len(html) > 100, f"status={resp.status}")
except Exception as e:
    report("ui.colaboracoes", False, str(e))

print(f"\n=== RESULTADO: {ok} ok / {fail} fail ===", flush=True)
raise SystemExit(1 if fail else 0)
