"""Auditoria Capacidade x Demanda vs ciclo comercial atual."""
from __future__ import annotations

import http.cookiejar
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from collections import Counter, defaultdict

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

BASE = os.environ.get("SNOP_BASE", "http://192.168.1.82:3042")
ANO = int(os.environ.get("AUDIT_ANO", "2026"))
MES_KEYS = [f"m{i}" for i in range(1, 13)]


def norm(value):
    if value is None:
        return ""
    s = str(value).strip().lower()
    repl = str.maketrans("áàâãäéèêëíìîïóòôõöúùûüçñ", "aaaaaeeeeiiiiooooouuuucn")
    return s.translate(repl)


def canonicalize_linha(value):
    s = norm(value)
    if not s:
        return ""
    s = re.sub(r"^terc\.?\s*", "", s)
    s = re.sub(r"^terceirizad[oa]\s*", "", s)
    s = re.sub(r"^sacola\s+", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    aliases = {
        "automatica": "automatica",
        "classic": "classic",
        "elegance": "elegance",
        "evolution": "evolution",
        "evolution plus": "evolution",
        "saco fundo quadrado": "fundo q",
        "presente": "classic",
        "rev. presente": "classic",
        "papelaria": "classic",
        "rev. papelaria": "classic",
        "sacoleira flexo": "automatica",
        "itens de maquinas": "adicionais",
        "itens reutilizaveis": "adicionais",
        "itens de imobilizado": "adicionais",
        "remessa industrializacao": "adicionais",
        "remessa de outros itens": "adicionais",
        "insumos de terceiros": "adicionais",
        "filme plastico": "adicionais",
        "apara formato": "adicionais",
        "alca dalva (und)": "adicionais",
        "alca gorgurao (und)": "adicionais",
        "caixa": "elegance",
        "caixa tampa e fundo": "elegance",
        "alca papel torcido": "adicionais",
        "guardanapo sachet": "guardanapo",
    }
    return aliases.get(s, s)


def get(opener, path, payload=None, timeout=120):
    url = f"{BASE}{path}"
    if payload is not None:
        url += "?input=" + urllib.parse.quote(json.dumps({"json": payload}))
    with opener.open(url, timeout=timeout) as resp:
        body = json.loads(resp.read().decode())
        return body.get("result", {}).get("data", {}).get("json", body)


def main():
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    opener.open(f"{BASE}/api/auth/local-login", timeout=30)

    ciclos = get(opener, "/api/trpc/cicloComercial.list")
    ciclo = ciclos[0] if ciclos else None
    if not ciclo:
        print("SEM CICLO COMERCIAL")
        raise SystemExit(1)
    ciclo_id = ciclo["id"]
    itens = get(opener, "/api/trpc/cicloComercial.itens", {"cicloId": ciclo_id})
    produtos = get(opener, "/api/trpc/produtos.list")
    recursos = get(opener, "/api/trpc/recursos.list")
    fluxos = get(opener, "/api/trpc/fluxos.listComRecursos")
    dias = get(opener, "/api/trpc/diasUteis.list", {"ano": ANO})
    turnos = get(opener, "/api/trpc/turnos.list")
    cap = get(opener, "/api/trpc/capacidade.calcular", {"ano": ANO}, timeout=180)

    prod_by_sku = {}
    for p in produtos:
        for key in (p.get("codItem"), p.get("codigo")):
            if key:
                prod_by_sku[norm(key)] = p

    fluxo_by_id = {f["id"]: f for f in fluxos}
    cap_by_id = {r["recursoId"]: r for r in cap.get("recursos", [])}

    # --- Baseline masters ---
    rec_com_vel = sum(1 for r in recursos if float(r.get("velocidadeLiquida") or 0) > 0)
    fluxos_com_rec = sum(1 for f in fluxos if f.get("recursos"))
    dias_meses = sorted({d.get("mes") for d in dias if d.get("mes")})
    dias_tipos = Counter(d.get("tipoDias") or "seg-sex" for d in dias)

    # Capacidade calculada
    rec_com_cap = 0
    meses_com_cap_global = Counter()
    cap_total_ano = 0
    for r in cap.get("recursos", []):
        mensal = r.get("capacidadeMensal") or {}
        vals = [mensal.get(str(m)) if str(m) in mensal else mensal.get(m) for m in range(1, 13)]
        # keys may be int or str from JSON
        vals = []
        for m in range(1, 13):
            v = mensal.get(m)
            if v is None:
                v = mensal.get(str(m))
            vals.append(v)
        if any(v is not None and v > 0 for v in vals):
            rec_com_cap += 1
        for m, v in enumerate(vals, 1):
            if v is not None and v > 0:
                meses_com_cap_global[m] += 1
                cap_total_ano += v

    # Recursos mensais coverage: count via capacidade nulls
    # Approximate: if all months null => no config
    sem_config = sum(
        1
        for r in cap.get("recursos", [])
        if all(
            (r.get("capacidadeMensal") or {}).get(m) is None
            and (r.get("capacidadeMensal") or {}).get(str(m)) is None
            for m in range(1, 13)
        )
    )

    # --- Match cycle items ---
    match = Counter()
    dem_mes = Counter()
    cap_mes = Counter()
    dem_chave = defaultdict(lambda: Counter())
    cap_chave = defaultdict(lambda: Counter())
    sku_sem_produto = []
    linhas_sem_cap = Counter()
    amostra_fluxo = []
    amostra_linha_ok = []
    amostra_linha_sem = []

    for item in itens:
        sku = norm(item.get("sku"))
        prod = prod_by_sku.get(sku)
        qtds = [float(item.get(k) or 0) or 0 for k in MES_KEYS]
        dem_total_item = sum(qtds)

        matched_fluxo = False
        if prod and prod.get("fluxoId"):
            fluxo = fluxo_by_id.get(prod["fluxoId"])
            recurso_ids = [
                r.get("id")
                for r in (fluxo.get("recursos") if fluxo else []) or []
                if isinstance(r, dict) and r.get("id") is not None
            ]
            if recurso_ids:
                matched_fluxo = True
                match["viaFluxo"] += 1
                key = f"fluxo:{prod['fluxoId']}"
                for i, q in enumerate(qtds, 1):
                    dem_chave[key][i] += q
                    dem_mes[i] += q
                if key not in cap_chave or sum(cap_chave[key].values()) == 0:
                    for rid in recurso_ids:
                        rec = cap_by_id.get(rid)
                        if not rec:
                            continue
                        mensal = rec.get("capacidadeMensal") or {}
                        for m in range(1, 13):
                            v = mensal.get(m)
                            if v is None:
                                v = mensal.get(str(m))
                            cap_chave[key][m] += float(v or 0)
                if len(amostra_fluxo) < 5:
                    amostra_fluxo.append(
                        {
                            "sku": item.get("sku"),
                            "fluxo": fluxo.get("nome") if fluxo else prod.get("fluxoId"),
                            "demanda12m": round(dem_total_item),
                        }
                    )
                continue

        if not prod:
            match["skuSemProduto"] += 1
            if len(sku_sem_produto) < 10:
                sku_sem_produto.append(item.get("sku"))

        linha = canonicalize_linha(item.get("linha")) or "sem-linha"
        key = f"linha:{linha}"
        match["viaLinha"] += 1
        for i, q in enumerate(qtds, 1):
            dem_chave[key][i] += q
            dem_mes[i] += q
        if sum(cap_chave[key].values()) == 0:
            for rec in cap.get("recursos", []):
                if canonicalize_linha(rec.get("linhaProduto")) == linha:
                    mensal = rec.get("capacidadeMensal") or {}
                    for m in range(1, 13):
                        v = mensal.get(m)
                        if v is None:
                            v = mensal.get(str(m))
                        cap_chave[key][m] += float(v or 0)
        cap_tot = sum(cap_chave[key].values())
        if dem_total_item > 0 and cap_tot <= 0:
            match["linhaSemCapacidade"] += 1
            linhas_sem_cap[linha or "sem-linha"] += 1
            if len(amostra_linha_sem) < 8:
                amostra_linha_sem.append(
                    {"sku": item.get("sku"), "linha": item.get("linha"), "demanda12m": round(dem_total_item)}
                )
        else:
            if len(amostra_linha_ok) < 5:
                amostra_linha_ok.append(
                    {"sku": item.get("sku"), "linha": item.get("linha"), "demanda12m": round(dem_total_item)}
                )

    for rec in cap.get("recursos", []):
        mensal = rec.get("capacidadeMensal") or {}
        for m in range(1, 13):
            v = mensal.get(m)
            if v is None:
                v = mensal.get(str(m))
            cap_mes[m] += float(v or 0)

    chaves_sem_cap = 0
    chaves_estouro = 0
    por_chave = []
    for key, dem in dem_chave.items():
        c = cap_chave.get(key) or Counter()
        dem_t = sum(dem.values())
        cap_t = sum(c.values())
        if dem_t > 0 and cap_t <= 0:
            chaves_sem_cap += 1
        est = sum(1 for m in range(1, 13) if dem[m] > c[m] and dem[m] > 0)
        if est:
            chaves_estouro += 1
        por_chave.append(
            {
                "chave": key,
                "demanda": round(dem_t),
                "capacidade": round(cap_t),
                "utilizacao": round(dem_t / cap_t, 3) if cap_t > 0 else None,
                "mesesEstouro": est,
            }
        )
    por_chave.sort(key=lambda x: -(x["demanda"] or 0))

    # Produtos com fluxoId
    prod_com_fluxo = sum(1 for p in produtos if p.get("fluxoId"))
    prod_com_linha = sum(1 for p in produtos if (p.get("linha") or "").strip())

    report = {
        "ciclo": {
            "id": ciclo_id,
            "nome": ciclo.get("nome"),
            "status": ciclo.get("status"),
            "anoInicio": ciclo.get("anoInicio"),
            "mesInicio": ciclo.get("mesInicio"),
            "itens": len(itens),
        },
        "baseline": {
            "recursos": len(recursos),
            "recursosComVelocidade": rec_com_vel,
            "recursosComCapacidadeCalculada": rec_com_cap,
            "recursosSemConfigMensal": sem_config,
            "fluxos": len(fluxos),
            "fluxosComRecursos": fluxos_com_rec,
            "turnos": len(turnos),
            "diasUteisRegistros": len(dias),
            "diasUteisMeses": dias_meses,
            "diasUteisTipos": dict(dias_tipos),
            "capacidadeTotalAno": round(cap_total_ano),
            "mesesComAlgumaCapacidade": dict(sorted(meses_com_cap_global.items())),
        },
        "produtos": {
            "total": len(produtos),
            "comFluxoId": prod_com_fluxo,
            "comLinha": prod_com_linha,
        },
        "matchCiclo": {
            "viaFluxo": match["viaFluxo"],
            "viaLinha": match["viaLinha"],
            "skuSemProduto": match["skuSemProduto"],
            "itensLinhaSemCapacidade": match["linhaSemCapacidade"],
            "chavesDemandaSemCapacidade": chaves_sem_cap,
            "chavesComEstouro": chaves_estouro,
        },
        "demandaVsCapacidadeMensal": [
            {
                "mes": m,
                "demanda": round(dem_mes[m]),
                "capacidade": round(cap_mes[m]),
                "gap": round(cap_mes[m] - dem_mes[m]),
                "utilizacao": round(dem_mes[m] / cap_mes[m], 3) if cap_mes[m] > 0 else None,
            }
            for m in range(1, 13)
        ],
        "topChaves": por_chave[:15],
        "linhasSemCapacidade": linhas_sem_cap.most_common(15),
        "amostras": {
            "viaFluxo": amostra_fluxo,
            "viaLinhaOk": amostra_linha_ok,
            "viaLinhaSemCap": amostra_linha_sem,
            "skuSemProduto": sku_sem_produto,
        },
    }

    try:
        from pathlib import Path

        out = Path(__file__).with_name("audit_capacidade_report.json")
        out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"REPORT_FILE={out}")
    except Exception as exc:
        print("REPORT_FILE_ERR", exc)

    # Console summary
    print("\n=== CICLO ===")
    print(json.dumps(report["ciclo"], ensure_ascii=False))
    print("\n=== BASELINE CAPACIDADE ===")
    print(json.dumps(report["baseline"], ensure_ascii=False, indent=2))
    print("\n=== PRODUTOS ===")
    print(json.dumps(report["produtos"], ensure_ascii=False))
    print("\n=== MATCH CICLO ===")
    print(json.dumps(report["matchCiclo"], ensure_ascii=False, indent=2))
    print("\n=== DEMANDA x CAPACIDADE (mensal) ===")
    for row in report["demandaVsCapacidadeMensal"]:
        if row["demanda"] or row["capacidade"]:
            print(
                f"  M{row['mes']:02d}: dem={row['demanda']:,} cap={row['capacidade']:,} "
                f"gap={row['gap']:,} util={row['utilizacao']}"
            )
    print("\n=== LINHAS SEM CAPACIDADE (top) ===")
    for linha, n in report["linhasSemCapacidade"][:10]:
        print(f"  {linha or '(vazio)'}: {n} itens")
    print("\n=== TOP CHAVES ===")
    for row in report["topChaves"][:10]:
        print(
            f"  {row['chave']}: dem={row['demanda']:,} cap={row['capacidade']:,} "
            f"util={row['utilizacao']} estouroMeses={row['mesesEstouro']}"
        )

    # Verdict
    blockers = []
    if report["baseline"]["recursosComCapacidadeCalculada"] == 0:
        blockers.append("Nenhum recurso com capacidade calculada (falta config mensal/turno/velocidade).")
    if report["baseline"]["diasUteisRegistros"] == 0:
        blockers.append("Dias úteis 2026 ausentes.")
    if report["produtos"]["comFluxoId"] == 0 and report["matchCiclo"]["viaFluxo"] == 0:
        blockers.append("Nenhum produto com fluxoId — match só por linha.")
    if report["matchCiclo"]["chavesDemandaSemCapacidade"] > 0:
        blockers.append(
            f"{report['matchCiclo']['chavesDemandaSemCapacidade']} chaves de demanda sem capacidade associada."
        )
    if sum(dem_mes.values()) > 0 and sum(cap_mes.values()) == 0:
        blockers.append("Há demanda no ciclo e capacidade total = 0.")

    print("\n=== VEREDITO ===")
    if blockers:
        print("BLOQUEANTES:")
        for b in blockers:
            print(f"  - {b}")
    else:
        print("Baseline suficiente para comparação Capacidade x Demanda (revisar estouro/utilização).")


if __name__ == "__main__":
    main()
