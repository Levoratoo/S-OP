#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Baixa e audita um job já SUCCESS."""
from __future__ import annotations

import base64
import http.cookiejar
import json
import os
import re
import sys
import urllib.parse
import urllib.request
import zipfile
from io import BytesIO
from pathlib import Path
from xml.etree import ElementTree as ET

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

BASE = os.environ.get("SNOP_BASE", "http://192.168.1.82:3042").rstrip("/")
JOB_ID = int(os.environ.get("SNOP_JOB_ID", "6"))
OUT_DIR = Path(__file__).resolve().parent / "_audit_out"
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
EN_ONLY = {"feb", "apr", "may", "aug", "sep", "oct", "dec"}
REQUIRED = {"Projeção Itens", "Clientes_Analise", "Cliente_detalhado", "Resumo"}


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


def shared_strings(zf):
    try:
        root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    except KeyError:
        return []
    out = []
    for si in root.findall("m:si", NS):
        out.append("".join(t.text or "" for t in si.findall(".//m:t", NS)))
    return out


def sheet_map(zf):
    wb = ET.fromstring(zf.read("xl/workbook.xml"))
    rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
    rid = {r.attrib["Id"]: r.attrib["Target"] for r in rels if "Id" in r.attrib}
    out = {}
    for s in wb.findall("m:sheets/m:sheet", NS):
        name = s.attrib.get("name", "")
        r = s.attrib.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
        target = rid.get(r or "", "")
        target = target.replace("\\", "/").lstrip("/")
        if target.startswith("xl/"):
            path = target
        else:
            path = "xl/" + target
        out[name] = path
    return out


def first_row(zf, path, strings, n=60):
    root = ET.fromstring(zf.read(path))
    rows = root.findall("m:sheetData/m:row", NS)
    if not rows:
        return []
    vals = []
    for c in rows[0].findall("m:c", NS)[:n]:
        t = c.attrib.get("t")
        v = c.find("m:v", NS)
        if v is None or v.text is None:
            vals.append("")
            continue
        if t == "s":
            i = int(v.text)
            vals.append(strings[i] if 0 <= i < len(strings) else v.text)
        else:
            vals.append(v.text)
    return vals


def nrows(zf, path):
    root = ET.fromstring(zf.read(path))
    return len(root.findall("m:sheetData/m:row", NS))


def en_months(headers):
    bad = []
    for h in headers:
        m = re.match(r"^([A-Za-zÀ-ÿ]{3})[-_/ ](\d{2}|\d{4})$", str(h).strip())
        if not m:
            continue
        p = m.group(1).lower()[:3]
        if p in EN_ONLY:
            bad.append(h)
    return bad


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    opener.open(f"{BASE}/api/auth/local-login", timeout=30)

    job = call(opener, "/api/trpc/previsaoPython.getById", {"id": JOB_ID})
    print("job", json.dumps({k: job.get(k) for k in ("id", "status", "message", "outputFileName", "inputMetadataJson")}, ensure_ascii=False)[:2500], flush=True)

    data = call(opener, "/api/trpc/previsaoPython.download", {"id": JOB_ID}, method="POST")
    xlsx = base64.b64decode(data["contentBase64"])
    out = OUT_DIR / f"job_{JOB_ID}_report.xlsx"
    out.write_bytes(xlsx)
    print(f"saved {out} ({len(xlsx)} bytes)", flush=True)

    zf = zipfile.ZipFile(BytesIO(xlsx))
    paths = sheet_map(zf)
    strings = shared_strings(zf)
    names = list(paths)
    report = {
        "jobId": JOB_ID,
        "sheets": names,
        "missing": sorted(REQUIRED - set(names)),
        "sheet_rows": {},
        "headers_sample": {},
        "en_month_headers": {},
        "ok": True,
        "notes": [],
    }
    for req in sorted(REQUIRED):
        if req not in paths:
            report["ok"] = False
            continue
        headers = first_row(zf, paths[req], strings)
        rows = nrows(zf, paths[req])
        en = en_months(headers)
        report["sheet_rows"][req] = rows
        report["headers_sample"][req] = headers[:35]
        report["en_month_headers"][req] = en
        if en:
            report["ok"] = False
            report["notes"].append(f"{req}: EN headers {en[:10]}")
        if req == "Cliente_detalhado" and rows < 50:
            report["ok"] = False
            report["notes"].append(f"Cliente_detalhado truncado ({rows})")
        if req == "Clientes_Analise" and rows < 5:
            report["ok"] = False
            report["notes"].append(f"Clientes_Analise vazio ({rows})")

    # Projeção: last month header should include closed ago-26 / set/2026 style
    proj = report["headers_sample"].get("Projeção Itens", [])
    report["projecao_tail"] = proj[-12:]

    path_json = OUT_DIR / f"job_{JOB_ID}_audit.json"
    path_json.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2), flush=True)
    if not report["ok"]:
        raise SystemExit(3)
    print("AUDIT_OK", flush=True)


if __name__ == "__main__":
    main()
