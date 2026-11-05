#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Gera previsão no ambiente e audita schema/rótulos do XLSX de saída."""
from __future__ import annotations

import http.cookiejar
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from io import BytesIO
from pathlib import Path
from xml.etree import ElementTree as ET

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

BASE = os.environ.get("SNOP_BASE", "http://192.168.1.82:3042").rstrip("/")
POLL_SEC = int(os.environ.get("PREVISAO_POLL_SEC", "20"))
MAX_WAIT_MIN = int(os.environ.get("PREVISAO_MAX_WAIT_MIN", "50"))
OUT_DIR = Path(os.environ.get("SNOP_AUDIT_OUT", Path(__file__).resolve().parent / "_audit_out"))
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
EN_MONTHS = {"jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"}
PT_MONTHS = {"jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"}
REQUIRED_SHEETS = {
    "Projeção Itens",
    "Clientes_Analise",
    "Cliente_detalhado",
    "Resumo",
}


def call(opener, path: str, payload=None, method="GET", timeout=900):
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
    try:
        with opener.open(req, timeout=timeout) as resp:
            raw = resp.read()
            ctype = resp.headers.get("Content-Type", "")
            if "application/json" in ctype or raw[:1] in (b"{", b"["):
                body = json.loads(raw.decode())
                return resp.status, body.get("result", {}).get("data", {}).get("json", body), None, raw
            return resp.status, None, None, raw
    except urllib.error.HTTPError as exc:
        return exc.code, None, exc.read()[:2000].decode("utf-8", "replace"), b""
    except Exception as exc:
        return 0, None, str(exc), b""


def shared_strings(zf: zipfile.ZipFile) -> list[str]:
    try:
        root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    except KeyError:
        return []
    out: list[str] = []
    for si in root.findall("m:si", NS):
        texts = [t.text or "" for t in si.findall(".//m:t", NS)]
        out.append("".join(texts))
    return out


def sheet_names(zf: zipfile.ZipFile) -> list[str]:
    root = ET.fromstring(zf.read("xl/workbook.xml"))
    return [s.attrib.get("name", "") for s in root.findall("m:sheets/m:sheet", NS)]


def sheet_path_map(zf: zipfile.ZipFile) -> dict[str, str]:
    wb = ET.fromstring(zf.read("xl/workbook.xml"))
    rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
    rid_to_target = {
        r.attrib["Id"]: r.attrib["Target"]
        for r in rels
        if "Target" in r.attrib and "Id" in r.attrib
    }
    out: dict[str, str] = {}
    for s in wb.findall("m:sheets/m:sheet", NS):
        name = s.attrib.get("name", "")
        rid = s.attrib.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
        target = rid_to_target.get(rid or "", "")
        if target and not target.startswith("/"):
            target = "xl/" + target.lstrip("/")
        elif target.startswith("/"):
            target = target.lstrip("/")
        out[name] = target
    return out


def first_row_values(zf: zipfile.ZipFile, sheet_path: str, strings: list[str], max_cells: int = 80) -> list[str]:
    root = ET.fromstring(zf.read(sheet_path))
    rows = root.findall("m:sheetData/m:row", NS)
    if not rows:
        return []
    values: list[str] = []
    for c in rows[0].findall("m:c", NS)[:max_cells]:
        t = c.attrib.get("t")
        v = c.find("m:v", NS)
        if v is None or v.text is None:
            values.append("")
            continue
        if t == "s":
            idx = int(v.text)
            values.append(strings[idx] if 0 <= idx < len(strings) else v.text)
        else:
            values.append(v.text)
    return values


def count_rows(zf: zipfile.ZipFile, sheet_path: str) -> int:
    root = ET.fromstring(zf.read(sheet_path))
    return len(root.findall("m:sheetData/m:row", NS))


def month_like(headers: list[str]) -> tuple[list[str], list[str], list[str]]:
    pt, en, other = [], [], []
    for h in headers:
        m = re.match(r"^([A-Za-zÀ-ÿ]{3})[-_/ ](\d{2}|\d{4})$", str(h).strip())
        if not m:
            continue
        prefix = m.group(1).lower()[:3]
        if prefix in PT_MONTHS and prefix not in {"may"}:  # mai is PT; may is EN
            if prefix in {"feb", "apr", "aug", "sep", "oct", "dec"}:
                en.append(h)
            elif prefix in {"fev", "abr", "ago", "set", "out", "dez", "mai"}:
                pt.append(h)
            elif prefix in EN_MONTHS - PT_MONTHS:
                en.append(h)
            else:
                # jan/mar/jun/jul/nov overlap — treat as ok/pt
                pt.append(h)
        elif prefix in EN_MONTHS:
            en.append(h)
        else:
            other.append(h)
    return pt, en, other


def audit_xlsx(data: bytes) -> dict:
    zf = zipfile.ZipFile(BytesIO(data))
    names = sheet_names(zf)
    paths = sheet_path_map(zf)
    strings = shared_strings(zf)
    report = {
        "sheets": names,
        "missing_required": sorted(REQUIRED_SHEETS - set(names)),
        "sheet_rows": {},
        "headers": {},
        "en_month_headers": {},
        "pt_month_headers": {},
        "ok": True,
        "notes": [],
    }
    for req in sorted(REQUIRED_SHEETS):
        if req not in names:
            report["ok"] = False
            continue
        sp = paths.get(req)
        if not sp:
            report["ok"] = False
            report["notes"].append(f"sem path para {req}")
            continue
        nrows = count_rows(zf, sp)
        headers = first_row_values(zf, sp, strings)
        pt, en, _other = month_like(headers)
        report["sheet_rows"][req] = nrows
        report["headers"][req] = headers[:40]
        report["pt_month_headers"][req] = pt[:20]
        report["en_month_headers"][req] = en
        if en:
            report["ok"] = False
            report["notes"].append(f"{req}: headers EN {en[:8]}")
        if req == "Cliente_detalhado" and nrows < 50:
            report["ok"] = False
            report["notes"].append(f"Cliente_detalhado truncado ({nrows} linhas)")
        if req == "Clientes_Analise" and nrows < 5:
            report["ok"] = False
            report["notes"].append(f"Clientes_Analise vazio ({nrows} linhas)")
    return report


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    opener.open(f"{BASE}/api/auth/local-login", timeout=30)

    print("==> createFromSistema", flush=True)
    status, data, err, _ = call(
        opener,
        "/api/trpc/previsaoPython.createFromSistema",
        {},
        method="POST",
        timeout=900,
    )
    if err or not data:
        print("FAIL createFromSistema", status, err, flush=True)
        raise SystemExit(1)

    job = data.get("job") or {}
    stats = data.get("stats") or {}
    job_id = job.get("id")
    print("job", json.dumps(job, ensure_ascii=False), flush=True)
    print("stats", json.dumps(stats, ensure_ascii=False), flush=True)
    if not job_id:
        raise SystemExit("job id ausente")

    deadline = time.time() + MAX_WAIT_MIN * 60
    last = None
    while time.time() < deadline:
        st, job_data, jerr, _ = call(opener, "/api/trpc/previsaoPython.getById", {"id": job_id}, timeout=60)
        if jerr or not job_data:
            print("poll error", st, jerr, flush=True)
            time.sleep(POLL_SEC)
            continue
        cur = job_data.get("status")
        msg = job_data.get("message")
        if cur != last:
            print(f"status={cur} message={msg}", flush=True)
            last = cur
        else:
            print(f"... {cur}: {msg}", flush=True)
        if cur in ("SUCCESS", "ERROR"):
            _, log_data, _, _ = call(
                opener, "/api/trpc/previsaoPython.log", {"id": job_id, "maxChars": 8000}, timeout=60
            )
            text = ""
            if isinstance(log_data, dict):
                text = log_data.get("content") or log_data.get("log") or ""
            print("== LOG TAIL ==", flush=True)
            print((text or "")[-3500:], flush=True)
            if cur == "ERROR":
                raise SystemExit(2)
            break
        time.sleep(POLL_SEC)
    else:
        raise SystemExit("timeout aguardando job")

    print("==> download report", flush=True)
    import base64

    st, data2, err2, _raw = call(
        opener,
        "/api/trpc/previsaoPython.download",
        {"id": job_id},
        method="POST",
        timeout=300,
    )
    if err2 or not isinstance(data2, dict):
        print("FAIL download", st, err2, flush=True)
        raise SystemExit("não consegui baixar o XLSX")
    b64 = data2.get("contentBase64")
    if not b64:
        print("download sem contentBase64", json.dumps(data2)[:500], flush=True)
        raise SystemExit("não consegui baixar o XLSX")
    xlsx = base64.b64decode(b64)
    used = "previsaoPython.download"

    out_path = OUT_DIR / f"job_{job_id}_report.xlsx"
    out_path.write_bytes(xlsx)
    print(f"saved {out_path} via {used} ({len(xlsx)} bytes)", flush=True)

    report = audit_xlsx(xlsx)
    report_path = OUT_DIR / f"job_{job_id}_audit.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2), flush=True)
    if not report["ok"]:
        raise SystemExit(3)
    print("AUDIT_OK", flush=True)


if __name__ == "__main__":
    main()
