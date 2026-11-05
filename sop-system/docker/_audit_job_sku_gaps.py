#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Audita job SKU (status + gaps vs Skus Projetar)."""
from __future__ import annotations

import base64
import csv
import http.cookiejar
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

BASE = os.environ.get("SNOP_BASE", "http://192.168.1.82:3042").rstrip("/")
JOB_ID = int(os.environ.get("SNOP_JOB_ID", "8"))
OUT = Path(__file__).resolve().parent / "_audit_out"
SKUS_CSV = Path(__file__).resolve().parents[1] / "dados-sistema" / "estatistica_skus_projetar.csv"


def call(opener, path, payload=None, method="GET", timeout=300):
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


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    opener.open(f"{BASE}/api/auth/local-login", timeout=30)

    job = call(opener, "/api/trpc/previsaoPython.getById", {"id": JOB_ID})
    meta = {}
    try:
        meta = json.loads(job.get("inputMetadataJson") or "{}")
    except Exception:
        pass
    print(
        json.dumps(
            {
                "id": job.get("id"),
                "status": job.get("status"),
                "message": job.get("message"),
                "outputFileName": job.get("outputFileName"),
                "vendasRows": (meta.get("vendas") or {}).get("rowCount"),
                "previstoRows": (meta.get("previsto") or {}).get("rowCount"),
                "clientesRows": (meta.get("clientes") or {}).get("rowCount"),
                "previstoOrigem": (meta.get("sourceMetadata") or {}).get("previstoOrigem"),
                "firstLastVendas": [
                    (meta.get("vendas") or {}).get("firstCompetence"),
                    (meta.get("vendas") or {}).get("lastCompetence"),
                ],
            },
            ensure_ascii=False,
            indent=2,
        ),
        flush=True,
    )

    if job.get("status") != "SUCCESS":
        print("JOB_NOT_READY", job.get("status"), flush=True)
        raise SystemExit(2)

    data = call(opener, "/api/trpc/previsaoPython.download", {"id": JOB_ID}, method="POST")
    xlsx = base64.b64decode(data["contentBase64"])
    out_xlsx = OUT / f"job_{JOB_ID}_report.xlsx"
    out_xlsx.write_bytes(xlsx)
    print(f"saved {out_xlsx} ({len(xlsx)} bytes)", flush=True)

    from openpyxl import load_workbook

    wb = load_workbook(out_xlsx, read_only=True, data_only=True)
    sheets = wb.sheetnames
    detalhado = wb["Detalhado"]
    header = list(next(detalhado.iter_rows(max_row=1, values_only=True)))
    codes = []
    for row in detalhado.iter_rows(min_row=2, max_col=1, values_only=True):
        if row[0]:
            codes.append(str(row[0]).strip())
    ca_rows = 0
    cd_rows = 0
    cd_header: list = []
    if "Clientes_Analise" in sheets:
        wb_ca = wb["Clientes_Analise"]
        ca_rows = wb_ca.max_row or 0
    if "Cliente_detalhado" in sheets:
        wb_cd = wb["Cliente_detalhado"]
        cd_rows = wb_cd.max_row or 0
        cd_header = list(next(wb_cd.iter_rows(max_row=1, values_only=True)))
    en = [
        h
        for h in header
        if h and str(h).lower()[:3] in {"feb", "apr", "may", "aug", "sep", "oct", "dec"} and any(c.isdigit() for c in str(h))
    ]
    tml = [c for c in codes if re.match(r"^(MTS|MTO|ENG)-", c, re.I)]
    sku_like = [c for c in codes if re.match(r"^\d", c)]

    projetar = set()
    if SKUS_CSV.exists():
        with SKUS_CSV.open(encoding="utf-8-sig", newline="") as f:
            for r in csv.DictReader(f):
                sm = (r.get("sku_marca") or "").strip()
                if sm:
                    projetar.add(sm)

    code_set = set(codes)
    missing_in_report = sorted(projetar - code_set)
    extra_in_report = sorted(code_set - projetar)

    report = {
        "jobId": JOB_ID,
        "ok": True,
        "gaps": [],
        "sheets": sheets,
        "detalhado_rows": len(codes),
        "clientes_analise_rows": ca_rows,
        "cliente_detalhado_rows": cd_rows,
        "sku_like_codes": len(sku_like),
        "tml_codes": len(tml),
        "en_headers": en[:10],
        "skus_projetar_csv": len(projetar),
        "missing_vs_projetar": len(missing_in_report),
        "extra_vs_projetar": len(extra_in_report),
        "missing_sample": missing_in_report[:15],
        "extra_sample": extra_in_report[:15],
        "detalhado_code_sample": codes[:5],
        "detalhado_tail_headers": [h for h in header[-8:]],
        "cliente_detalhado_tail": cd_header[-8:] if cd_header else [],
        "previstoOrigem": (meta.get("sourceMetadata") or {}).get("previstoOrigem"),
    }

    if tml:
        report["ok"] = False
        report["gaps"].append(f"Ainda há {len(tml)} códigos TML no Detalhado")
    if len(sku_like) < 200:
        report["ok"] = False
        report["gaps"].append(f"Poucos SKUs no Detalhado ({len(sku_like)})")
    if en:
        report["ok"] = False
        report["gaps"].append(f"Headers EN: {en[:5]}")
    if "Clientes_Analise" not in sheets:
        report["ok"] = False
        report["gaps"].append("Clientes_Analise ausente")
    if cd_rows < 1000:
        report["ok"] = False
        report["gaps"].append(f"Cliente_detalhado truncado ({cd_rows})")
    if missing_in_report:
        report["gaps"].append(
            f"{len(missing_in_report)} SKUs em Skus Projetar sem linha no relatório (sem venda no histórico filtrado?)"
        )
    if report["previstoOrigem"] == "seed_tml_rateado":
        report["ok"] = False
        report["gaps"].append(
            "Previsto ainda não está na chave oficial sku_marca"
        )
    if abs(len(codes) - len(projetar)) > 20 and missing_in_report:
        report["ok"] = False

    path = OUT / f"job_{JOB_ID}_sku_audit.json"
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2), flush=True)
    wb.close()
    if not report["ok"]:
        raise SystemExit(3)
    print("AUDIT_OK", flush=True)


if __name__ == "__main__":
    main()
