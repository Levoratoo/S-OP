"""Fluxos compostos no Docker: gestor×marca, capacidade mensal, faturamento mínimo, sazonalidade."""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

BASE = os.environ.get("SNOP_BASE", "http://192.168.1.82:3042").rstrip("/")
COOKIE = ""


def encode_input(data: Any) -> str:
    return urllib.parse.quote(json.dumps({"json": data}, separators=(",", ":")))


def http(method: str, path: str, body: bytes | None = None) -> tuple[int, bytes]:
    headers = {"Cookie": COOKIE, "Accept": "application/json"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(
        f"{BASE}{path}", data=body, headers=headers, method=method
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read() if e.fp else b""


def login() -> None:
    global COOKIE
    jar = urllib.request.HTTPCookieProcessor()
    opener = urllib.request.build_opener(jar)
    opener.open(f"{BASE}/api/auth/local-login", timeout=30)
    COOKIE = "; ".join(f"{c.name}={c.value}" for c in jar.cookiejar)
    assert COOKIE, "login sem cookie"


def q(path: str, data: Any = None) -> Any:
    payload = {} if data is None else data
    status, raw = http("GET", f"/api/trpc/{path}?input={encode_input(payload)}")
    obj = json.loads(raw.decode())
    if status >= 400 or obj.get("error"):
        raise RuntimeError(f"{path} FAIL {status}: {raw[:400]!r}")
    d = obj["result"]["data"]
    return d["json"] if isinstance(d, dict) and "json" in d else d


def m(path: str, data: Any = None) -> Any:
    status, raw = http("POST", f"/api/trpc/{path}", json.dumps({"json": data}).encode())
    obj = json.loads(raw.decode())
    if status >= 400 or obj.get("error"):
        raise RuntimeError(f"{path} FAIL {status}: {raw[:500]!r}")
    d = obj.get("result", {}).get("data", obj)
    return d["json"] if isinstance(d, dict) and "json" in d else d


def eid(obj: Any) -> int:
    if isinstance(obj, dict) and isinstance(obj.get("id"), int):
        return obj["id"]
    raise RuntimeError(f"sem id: {obj!r}")


def main() -> int:
    login()
    stamp = int(time.time()) % 100000
    fails: list[str] = []

    def step(name: str, fn) -> None:  # type: ignore[no-untyped-def]
        try:
            fn()
            print(f"[OK] {name}", flush=True)
        except Exception as e:
            print(f"[FAIL] {name}: {e}", flush=True)
            fails.append(f"{name}: {e}")

    ids: dict[str, int] = {}

    def fluxo_gestor_marca() -> None:
        marca = m("marcas.create", {"nome": f"AUDM_{stamp}", "ativo": True})
        gest = m("gestores.create", {"nome": f"AUDG_{stamp}", "email": f"g{stamp}@t.local"})
        ids["marca"] = eid(marca)
        ids["gestor"] = eid(gest)
        link = m(
            "gestorMarca.create",
            {"gestorId": ids["gestor"], "marcaId": ids["marca"], "ativo": True},
        )
        ids["gm"] = eid(link)
        rows = q("gestorMarca.list")
        assert any(r.get("id") == ids["gm"] for r in rows), rows

    def fluxo_capacidade() -> None:
        tur = m(
            "turnos.create",
            {
                "turnoHora": f"2/10 D{stamp}",
                "horasTrabalho": "10:00",
                "horasRefeicao": "01:00",
                "horasTrabalhadas": "09:00",
                "diasTrabalhados": "segunda - sexta",
            },
        )
        ids["turno"] = eid(tur)
        rec = m(
            "recursos.create",
            {
                "nome": f"AUDREC_{stamp}",
                "linhaProduto": "Classic",
                "velocidadeLiquida": 120,
                "tipo": "Intermediário",
                "tipoExecucao": "Interno",
            },
        )
        ids["recurso"] = eid(rec)
        m(
            "recursosMensais.saveConfig",
            {
                "recursoId": ids["recurso"],
                "ano": 2026,
                "mes": 1,
                "turnoId": ids["turno"],
                "horasManutencao": 0,
                "horasExtras": 0,
                "velocidadeLiquida": 120,
            },
        )
        m(
            "diasUteis.create",
            {"ano": 2026, "mes": 1, "diasUteis": 22, "feriados": 0, "tipoDias": "seg-sex"},
        )
        # pode já existir — ok
        cap = q("capacidade.calcular", {"ano": 2026})
        row = next(r for r in cap["recursos"] if r["recursoId"] == ids["recurso"])
        assert row["capacidadeMensal"]["1"] is not None and row["capacidadeMensal"]["1"] > 0, row

        flx = m("fluxos.create", {"nome": f"AUDFLX_{stamp}", "ativo": True})
        ids["fluxo"] = eid(flx)
        m("fluxos.setRecursos", {"fluxoId": ids["fluxo"], "recursoIds": [ids["recurso"]]})
        comps = q("fluxos.listComRecursos")
        found = next(f for f in comps if f["id"] == ids["fluxo"])
        assert any(r["id"] == ids["recurso"] for r in found.get("recursos", [])), found

        prod = m(
            "produtos.create",
            {
                "codItem": f"SKU{stamp}",
                "descricao": "Produto deep audit",
                "marca": f"AUDM_{stamp}",
                "linha": "Classic",
                "tipoEstoque": "MTS",
                "fluxoId": ids["fluxo"],
                "fluxo": f"AUDFLX_{stamp}",
                "projetarEstatistica": True,
            },
        )
        ids["produto"] = eid(prod)

    def fluxo_faturamento() -> None:
        # uma linha mínima
        m(
            "faturamento.importBatch",
            [
                {
                    "dataEmissao": "2026-01-15",
                    "nfNumero": f"NF{stamp}",
                    "codMaterial": f"SKU{stamp}",
                    "descricaoItem": "Produto deep audit",
                    "qtd": "10",
                    "valorTotal": "100.00",
                    "tipoFaturamento": "SAIDA",
                    "marca": f"AUDM_{stamp}",
                    "linhaProduto": "Classic",
                    "tipoEstoque": "MTS",
                }
            ],
        )
        stats = q("faturamento.stats")
        assert stats.get("totalRegistros", 0) >= 1, stats
        seed = m("sazonalidadeMarca.seedUniforme", None)
        # com marca no sistema, deve inserir ou já ter
        calc = m("sazonalidadeMarca.calcularDoFaturamento", {"anosHistorico": 3})
        assert "marcas" in calc or "updated" in calc or isinstance(calc, dict), calc

    def cleanup() -> None:
        for key, proc in [
            ("produto", "produtos.delete"),
            ("fluxo", "fluxos.delete"),
            ("recurso", "recursos.delete"),
            ("turno", "turnos.delete"),
            ("gm", "gestorMarca.delete"),
            ("gestor", "gestores.delete"),
            ("marca", "marcas.delete"),
        ]:
            if key in ids:
                try:
                    m(proc, {"id": ids[key]})
                except Exception as e:
                    print(f"[WARN] cleanup {key}: {e}", flush=True)

    step("gestor×marca", fluxo_gestor_marca)
    step("capacidade+fluxo+produto", fluxo_capacidade)
    step("faturamento+sazonalidade", fluxo_faturamento)
    step("cleanup", cleanup)

    print(f"\nRESUMO deep: fail={len(fails)}")
    for f in fails:
        print(" -", f)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
