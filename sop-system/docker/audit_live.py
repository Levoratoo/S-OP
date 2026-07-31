"""
Auditoria exaustiva do SNOP em http://HOST:PORT
- login bypass
- smoke de rotas SPA
- list/query de todos os módulos tRPC
- CRUD create→update→delete nos cadastros principais
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from typing import Any

BASE = os.environ.get("SNOP_BASE", "http://192.168.1.82:3042").rstrip("/")
COOKIE: str | None = None

SPA_ROUTES = [
    "/",
    "/ajuda",
    "/demanda/dashboard",
    "/demanda/acuracidade",
    "/demanda/previsoes",
    "/demanda/colaboracoes",
    "/demanda/consensos",
    "/demanda/orcamentos",
    "/capacidade/dashboard",
    "/capacidade/calculo",
    "/capacidade/vs-demanda",
    "/producao/metas",
    "/vendas/dashboard",
    "/vendas/historico",
    "/vendas/carteira",
    "/vendas/forecast",
    "/vendas/importar",
    "/cadastros/familias",
    "/cadastros/produtos",
    "/cadastros/clientes",
    "/cadastros/recursos",
    "/cadastros/dias-uteis",
    "/cadastros/roteiros",
    "/cadastros/status",
    "/cadastros/tipo-negocio",
    "/cadastros/tipo-estoque",
    "/cadastros/linhas",
    "/cadastros/modelos",
    "/cadastros/tamanhos",
    "/cadastros/membros",
    "/cadastros/paradas",
    "/cadastros/tabelas-auxiliares",
    "/cadastros/gestor-marca",
    "/cadastros/depara",
    "/cadastros/turnos",
    "/cadastros/fluxos",
    "/cadastros/importacao-base",
    "/cadastros/sazonalidade-marca",
    "/integracao/sharepoint",
    "/previsao-python",
    "/previsao-python/ciclo-13",
    "/admin/usuarios",
    "/admin/marcas",
]

# queries sem input (ou input optional null)
LIST_QUERIES: list[tuple[str, Any]] = [
    ("auth.me", None),
    ("familias.list", None),
    ("subfamilias.list", None),
    ("produtos.list", None),
    ("clientes.list", None),
    ("recursos.list", None),
    ("diasUteis.list", None),
    ("hierarquias.list", None),
    ("membros.list", None),
    ("paradas.list", None),
    ("roteiros.list", None),
    ("vendas.list", {"limit": 20}),
    ("carteiraPedidos.list", {"limit": 20}),
    ("forecasts.list", {"limit": 20}),
    ("orcamentos.list", None),
    ("previsoes.list", None),
    ("colaboracoes.list", None),
    ("cicloComercial.list", None),
    ("sazonalidadeMarca.list", None),
    ("consensos.list", None),
    ("metasProducao.list", None),
    ("faturamento.list", {"limit": 20}),
    ("faturamento.stats", None),
    ("statusCadastro.list", None),
    ("tiposNegocio.list", None),
    ("tiposEstoque.list", None),
    ("linhas.list", None),
    ("modelos.list", None),
    ("tamanhos.list", None),
    ("marcas.list", None),
    ("gestores.list", None),
    ("gestorMarca.list", None),
    ("deParaCodigos.list", None),
    ("turnos.list", None),
    ("fluxos.list", None),
    ("usuarios.list", None),
    ("niveisAcesso.list", None),
    ("previsaoPython.list", None),
    ("sharepoint.getConfig", None),
    ("dashboard.demanda", None),
    ("dashboard.acuracidade", None),
    ("dashboard.vendasPorMes", {"ano": 2026}),
    ("capacidade.calcular", {"ano": 2026}),
    ("pesquisa.buscarRecursos", {"termo": "a"}),
    ("fluxos.listComRecursos", None),
]


@dataclass
class Result:
    name: str
    ok: bool
    detail: str = ""
    severity: str = "info"  # info | warn | fail


@dataclass
class Report:
    results: list[Result] = field(default_factory=list)

    def add(self, name: str, ok: bool, detail: str = "", severity: str | None = None) -> None:
        sev = severity or ("info" if ok else "fail")
        self.results.append(Result(name, ok, detail, sev))
        mark = "OK" if ok else "FAIL"
        print(f"[{mark}] {name}: {detail}"[:500], flush=True)


def encode_input(data: Any) -> str:
    payload = {"json": data}
    return urllib.parse.quote(json.dumps(payload, separators=(",", ":")))


def http(
    method: str,
    path: str,
    body: bytes | None = None,
    content_type: str | None = None,
    allow_redirects: bool = False,
) -> tuple[int, dict[str, str], bytes]:
    url = path if path.startswith("http") else f"{BASE}{path}"
    headers = {"User-Agent": "snop-audit/1.0", "Accept": "application/json,text/html,*/*"}
    if COOKIE:
        headers["Cookie"] = COOKIE
    if content_type:
        headers["Content-Type"] = content_type
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            hdrs = {k.lower(): v for k, v in resp.headers.items()}
            return resp.status, hdrs, resp.read()
    except urllib.error.HTTPError as e:
        hdrs = {k.lower(): v for k, v in e.headers.items()} if e.headers else {}
        return e.code, hdrs, e.read() if e.fp else b""


def login(report: Report) -> bool:
    global COOKIE
    status, hdrs, data = http("GET", "/api/auth/local-login", allow_redirects=False)
    # urllib follows redirects by default for GET... use opener that doesn't
    # Re-login capturing Set-Cookie manually
    opener = urllib.request.build_opener(urllib.request.HTTPRedirectHandler())

    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):  # type: ignore[no-untyped-def]
            return None

    opener = urllib.request.build_opener(NoRedirect)
    req = urllib.request.Request(f"{BASE}/api/auth/local-login", method="GET")
    try:
        resp = opener.open(req, timeout=30)
        status = resp.status
        set_cookie = resp.headers.get("Set-Cookie", "")
        body = resp.read()
    except urllib.error.HTTPError as e:
        status = e.code
        set_cookie = e.headers.get("Set-Cookie", "") if e.headers else ""
        body = e.read() if e.fp else b""

    # Also try following redirect path if cookie still missing
    if "app_session" in set_cookie or "session" in set_cookie.lower() or "=" in set_cookie:
        COOKIE = set_cookie.split(";")[0]
    else:
        # follow with cookie jar style: request and read all set-cookie via redirect chain
        jar_req = urllib.request.Request(f"{BASE}/api/auth/local-login")
        try:
            with urllib.request.urlopen(jar_req, timeout=30) as resp:
                # Cookie may already be in subsequent requests if we parse from history — urllib doesn't expose easily
                # Fallback: call auth.me without cookie after redirect login in same opener with CookieProcessor
                pass
        except Exception:
            pass
        cookie_proc = urllib.request.HTTPCookieProcessor()
        opener2 = urllib.request.build_opener(cookie_proc)
        opener2.open(f"{BASE}/api/auth/local-login", timeout=30)
        cookies = []
        for c in cookie_proc.cookiejar:
            cookies.append(f"{c.name}={c.value}")
        COOKIE = "; ".join(cookies) if cookies else None

    if not COOKIE:
        report.add("login", False, f"status={status} sem cookie. body={body[:120]!r}")
        return False
    report.add("login", True, f"cookie={COOKIE.split('=')[0]}…")
    return True


def trpc_query(path: str, input_data: Any = None) -> tuple[bool, Any, str]:
    q = f"/api/trpc/{path}"
    # Zod .optional() object rejects null — send {} when no filter
    payload = {} if input_data is None else input_data
    q += f"?input={encode_input(payload)}"
    status, _, raw = http("GET", q)
    try:
        data = json.loads(raw.decode("utf-8", errors="replace"))
    except Exception:
        return False, None, f"HTTP {status} non-json: {raw[:200]!r}"
    if status >= 400:
        return False, data, f"HTTP {status}: {json.dumps(data)[:300]}"
    # batch or single
    result = data.get("result") if isinstance(data, dict) else None
    if result and "data" in result:
        payload = result["data"]
        if isinstance(payload, dict) and "json" in payload:
            return True, payload["json"], "ok"
        return True, payload, "ok"
    if "error" in data:
        return False, data, json.dumps(data.get("error"))[:300]
    return True, data, "ok"


def trpc_mutation(path: str, input_data: Any = None) -> tuple[bool, Any, str]:
    url = f"/api/trpc/{path}"
    body = json.dumps({"json": input_data}).encode("utf-8")
    status, _, raw = http("POST", url, body=body, content_type="application/json")
    try:
        data = json.loads(raw.decode("utf-8", errors="replace"))
    except Exception:
        return False, None, f"HTTP {status} non-json: {raw[:200]!r}"
    if status >= 400 or (isinstance(data, dict) and data.get("error")):
        err = data.get("error") if isinstance(data, dict) else data
        return False, data, f"HTTP {status}: {json.dumps(err)[:350]}"
    result = data.get("result", {})
    payload = result.get("data", data)
    if isinstance(payload, dict) and "json" in payload:
        return True, payload["json"], "ok"
    return True, payload, "ok"


def extract_id(obj: Any) -> int | None:
    if isinstance(obj, dict):
        if isinstance(obj.get("id"), int):
            return obj["id"]
        if isinstance(obj.get("insertId"), int):
            return obj["insertId"]
        # drizzle sometimes returns [ResultSetHeader, ...]
    if isinstance(obj, list) and obj:
        return extract_id(obj[0])
    return None


def smoke_spa(report: Report) -> None:
    for route in SPA_ROUTES:
        status, _, raw = http("GET", route)
        text = raw.decode("utf-8", errors="replace")
        ok = status == 200 and ("<div id=\"root\"" in text or "root" in text)
        report.add(f"spa:{route}", ok, f"HTTP {status}, bytes={len(raw)}", severity="fail" if not ok else "info")


def smoke_lists(report: Report) -> None:
    for path, inp in LIST_QUERIES:
        ok, data, detail = trpc_query(path, inp)
        extra = ""
        if ok and isinstance(data, list):
            extra = f" rows={len(data)}"
        elif ok and isinstance(data, dict):
            extra = f" keys={list(data.keys())[:8]}"
        report.add(f"list:{path}", ok, detail + extra, severity="fail" if not ok else "info")


def crud_cycle(
    report: Report,
    name: str,
    create_path: str,
    create_input: dict[str, Any],
    update_path: str,
    update_patch: dict[str, Any],
    delete_path: str,
    list_path: str,
) -> None:
    ok, created, detail = trpc_mutation(create_path, create_input)
    if not ok:
        report.add(f"crud:{name}:create", False, detail)
        return
    eid = extract_id(created)
    if eid is None:
        # some creates return void / true — list and find by unique field
        report.add(f"crud:{name}:create", True, f"created without id payload={str(created)[:120]}")
        # try list
        lok, rows, _ = trpc_query(list_path, None)
        if lok and isinstance(rows, list) and rows:
            # pick last
            eid = extract_id(rows[-1])
        if eid is None:
            report.add(f"crud:{name}:id", False, "não conseguiu obter id após create")
            return
    else:
        report.add(f"crud:{name}:create", True, f"id={eid}")

    upd = {"id": eid, **update_patch}
    ok, _, detail = trpc_mutation(update_path, upd)
    report.add(f"crud:{name}:update", ok, detail if not ok else f"id={eid}")

    ok, _, detail = trpc_mutation(delete_path, {"id": eid})
    report.add(f"crud:{name}:delete", ok, detail if not ok else f"id={eid}")


def run_cruds(report: Report) -> None:
    stamp = int(time.time()) % 100000
    crud_cycle(
        report,
        "statusCadastro",
        "statusCadastro.create",
        {"nome": f"AUD_{stamp}", "ativo": True},
        "statusCadastro.update",
        {"nome": f"AUD_{stamp}_U"},
        "statusCadastro.delete",
        "statusCadastro.list",
    )
    crud_cycle(
        report,
        "tiposNegocio",
        "tiposNegocio.create",
        {"nome": f"AUD_TN_{stamp}", "ativo": True},
        "tiposNegocio.update",
        {"nome": f"AUD_TN_{stamp}_U"},
        "tiposNegocio.delete",
        "tiposNegocio.list",
    )
    crud_cycle(
        report,
        "tiposEstoque",
        "tiposEstoque.create",
        {"nome": f"AUD_TE_{stamp}", "ativo": True},
        "tiposEstoque.update",
        {"nome": f"AUD_TE_{stamp}_U"},
        "tiposEstoque.delete",
        "tiposEstoque.list",
    )
    crud_cycle(
        report,
        "linhas",
        "linhas.create",
        {"nome": f"AUD_LIN_{stamp}", "ativo": True},
        "linhas.update",
        {"nome": f"AUD_LIN_{stamp}_U"},
        "linhas.delete",
        "linhas.list",
    )
    crud_cycle(
        report,
        "modelos",
        "modelos.create",
        {"nome": f"AUD_MOD_{stamp}", "ativo": True},
        "modelos.update",
        {"nome": f"AUD_MOD_{stamp}_U"},
        "modelos.delete",
        "modelos.list",
    )
    crud_cycle(
        report,
        "tamanhos",
        "tamanhos.create",
        {"nome": f"AUD_TAM_{stamp}", "ativo": True},
        "tamanhos.update",
        {"nome": f"AUD_TAM_{stamp}_U"},
        "tamanhos.delete",
        "tamanhos.list",
    )
    crud_cycle(
        report,
        "familias",
        "familias.create",
        {"nome": f"AUD_FAM_{stamp}", "tipo": "MTS", "ativo": True},
        "familias.update",
        {"nome": f"AUD_FAM_{stamp}_U"},
        "familias.delete",
        "familias.list",
    )
    crud_cycle(
        report,
        "clientes",
        "clientes.create",
        {
            "razaoSocial": f"Cliente Audit {stamp}",
            "nomeFantasia": f"AUD{stamp}",
            "status": "ATIVO",
        },
        "clientes.update",
        {"razaoSocial": f"Cliente Audit {stamp} U"},
        "clientes.delete",
        "clientes.list",
    )
    crud_cycle(
        report,
        "turnos",
        "turnos.create",
        {
            "turnoHora": f"2/10 AUD {stamp}",
            "horasTrabalho": "10:00",
            "horasRefeicao": "01:00",
            "horasTrabalhadas": "09:00",
            "diasTrabalhados": "segunda - sexta",
            "ativo": True,
        },
        "turnos.update",
        {"turnoHora": f"2/10 AUD {stamp} U"},
        "turnos.delete",
        "turnos.list",
    )
    crud_cycle(
        report,
        "recursos",
        "recursos.create",
        {
            "nome": f"AUD_REC_{stamp}",
            "linhaProduto": f"AUD_LIN_{stamp}",
            "velocidadeLiquida": 100,
            "tipo": "Intermediário",
            "tipoExecucao": "Interno",
            "ativo": True,
        },
        "recursos.update",
        {"nome": f"AUD_REC_{stamp}_U"},
        "recursos.delete",
        "recursos.list",
    )
    crud_cycle(
        report,
        "produtos",
        "produtos.create",
        {
            "codItem": f"AUDSKU{stamp}",
            "descricao": f"Produto audit {stamp}",
            "marca": "AUDIT",
            "linha": "AUDIT",
            "tipoEstoque": "MTS",
            "projetarEstatistica": True,
            "status": "ATIVO",
        },
        "produtos.update",
        {"descricao": f"Produto audit {stamp} U"},
        "produtos.delete",
        "produtos.list",
    )
    crud_cycle(
        report,
        "diasUteis",
        "diasUteis.create",
        {"ano": 2099, "mes": 1, "diasUteis": 22, "feriados": 0, "tipoDias": "seg-sex"},
        "diasUteis.update",
        {"diasUteis": 21},
        "diasUteis.delete",
        "diasUteis.list",
    )
    crud_cycle(
        report,
        "membros",
        "membros.create",
        {"nome": f"AUD_MEM_{stamp}", "email": f"aud{stamp}@test.local", "ativo": True},
        "membros.update",
        {"nome": f"AUD_MEM_{stamp}_U"},
        "membros.delete",
        "membros.list",
    )
    crud_cycle(
        report,
        "consensos",
        "consensos.create",
        {"ano": 2099, "ciclo": 99, "status": "ABERTO", "observacoes": "audit"},
        "consensos.update",
        {"status": "EM_REVISAO"},
        "consensos.delete",
        "consensos.list",
    )
    crud_cycle(
        report,
        "deParaCodigos",
        "deParaCodigos.create",
        {"skuAntigo": f"OLD{stamp}", "skuNovo": f"NEW{stamp}"},
        "deParaCodigos.update",
        {"skuNovo": f"NEW{stamp}U"},
        "deParaCodigos.delete",
        "deParaCodigos.list",
    )
    crud_cycle(
        report,
        "marcas",
        "marcas.create",
        {"nome": f"AUD_MARCA_{stamp}", "ativo": True},
        "marcas.update",
        {"nome": f"AUD_MARCA_{stamp}_U"},
        "marcas.delete",
        "marcas.list",
    )
    crud_cycle(
        report,
        "gestores",
        "gestores.create",
        {"nome": f"AUD_GEST_{stamp}", "email": f"gest{stamp}@test.local", "ativo": True},
        "gestores.update",
        {"nome": f"AUD_GEST_{stamp}_U"},
        "gestores.delete",
        "gestores.list",
    )

    # sazonalidade seed (mutation safe)
    ok, data, detail = trpc_mutation("sazonalidadeMarca.seedUniforme", None)
    report.add("mutation:sazonalidade.seedUniforme", ok, detail if not ok else str(data)[:160])

    # composição Capacidade × Demanda (mesmas queries da tela)
    okc, ciclos, dc = trpc_query("cicloComercial.list", None)
    report.add("screen:cap-vs-demanda:ciclos", okc, dc if not okc else f"ciclos={len(ciclos) if isinstance(ciclos, list) else '?'}")
    okp, _, dp = trpc_query("produtos.list", None)
    report.add("screen:cap-vs-demanda:produtos", okp, dp)
    okf, _, df = trpc_query("fluxos.listComRecursos", None)
    report.add("screen:cap-vs-demanda:fluxos", okf, df)
    oka, _, da = trpc_query("capacidade.calcular", {"ano": 2026})
    report.add("screen:cap-vs-demanda:capacidade", oka, da)

    # tela colaboração
    ok, _, d = trpc_query("cicloComercial.list", None)
    report.add("screen:colaboracao:list", ok, d)

    # gerar bases dry — só valida endpoint existe se houver dados; não dispara job pesado
    # (createFromSistema pode demorar / falhar sem faturamento — marcar WARN)
    ok, data, detail = trpc_mutation("previsaoPython.createFromSistema", {"dataInicio": "2099-01-01", "dataFim": "2099-01-02"})
    if ok:
        report.add("mutation:previsaoPython.createFromSistema", True, str(data)[:200], severity="warn")
        # tenta cancelar/ignorar job criado
    else:
        # esperado se não há faturamento — WARN não FAIL se erro de negócio
        soft = any(x in detail.lower() for x in ["faturamento", "vazio", "empty", "nenhum", "no rows", "sem "])
        report.add(
            "mutation:previsaoPython.createFromSistema",
            soft,
            detail,
            severity="warn" if soft else "fail",
        )

    # fluxos create needs care
    ok, created, detail = trpc_mutation(
        "fluxos.create",
        {"nome": f"AUD_FLX_{stamp}", "ativo": True},
    )
    report.add("crud:fluxos:create", ok, detail if not ok else str(created)[:160])
    fid = extract_id(created)
    if ok and fid:
        ok2, _, d2 = trpc_mutation("fluxos.update", {"id": fid, "nome": f"AUD_FLX_{stamp}_U"})
        report.add("crud:fluxos:update", ok2, d2 if not ok2 else f"id={fid}")
        ok3, _, d3 = trpc_mutation("fluxos.delete", {"id": fid})
        report.add("crud:fluxos:delete", ok3, d3 if not ok3 else f"id={fid}")


def check_auth_me(report: Report) -> None:
    ok, data, detail = trpc_query("auth.me", None)
    if not ok:
        report.add("auth.me", False, detail)
        return
    if not data:
        report.add("auth.me", False, "user null — sessão inválida")
        return
    nivel = data.get("nivelAcesso") if isinstance(data, dict) else None
    report.add("auth.me", True, f"user={data.get('name') if isinstance(data, dict) else data} nivel={nivel}")


def main() -> int:
    report = Report()
    print(f"=== AUDITORIA SNOP {BASE} ===", flush=True)
    if not login(report):
        print("ABORT: login falhou")
        return 2
    check_auth_me(report)
    smoke_spa(report)
    smoke_lists(report)
    run_cruds(report)

    fails = [r for r in report.results if not r.ok]
    warns = [r for r in report.results if r.ok and r.severity == "warn"]
    print("\n=== RESUMO ===", flush=True)
    print(f"total={len(report.results)} ok={len(report.results)-len(fails)} fail={len(fails)}", flush=True)
    if fails:
        print("\nFALHAS:", flush=True)
        for r in fails:
            print(f" - {r.name}: {r.detail}"[:400], flush=True)

    # write json report
    out = {
        "base": BASE,
        "total": len(report.results),
        "ok": len(report.results) - len(fails),
        "fail": len(fails),
        "failures": [{"name": r.name, "detail": r.detail} for r in fails],
        "all": [{"name": r.name, "ok": r.ok, "detail": r.detail, "severity": r.severity} for r in report.results],
    }
    out_path = os.path.join(os.path.dirname(__file__), "audit_report.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f"\nRelatório: {out_path}", flush=True)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
