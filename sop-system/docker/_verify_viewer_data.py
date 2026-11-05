#!/usr/bin/env python3
from __future__ import annotations

import http.cookiejar
import json
import os
import sys
import time
import urllib.parse
import urllib.request

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

BASE = "http://192.168.1.82:3042"


def opener():
    jar = http.cookiejar.CookieJar()
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def login(o):
    o.open(BASE + "/api/auth/local-login", timeout=40)


def trpc(o, path, payload, timeout=180):
    url = BASE + path + "?input=" + urllib.parse.quote(json.dumps({"json": payload}))
    with o.open(url, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def main() -> None:
    for attempt in range(8):
        try:
            with urllib.request.urlopen(BASE + "/", timeout=10) as resp:
                print("home", resp.status, flush=True)
                break
        except Exception as exc:
            print("wait home", attempt, type(exc).__name__, flush=True)
            time.sleep(5)
    else:
        raise SystemExit("app not up")

    o = opener()
    login(o)
    t0 = time.time()
    meta = trpc(o, "/api/trpc/previsaoPython.workbookMeta", {"id": 13}, timeout=60)
    print("meta_ms", int((time.time() - t0) * 1000), flush=True)
    sheets = meta["result"]["data"]["json"]
    print("sheets", sheets[:5], "...", len(sheets), flush=True)
    first = sheets[0]
    t1 = time.time()
    data = trpc(
        o,
        "/api/trpc/previsaoPython.sheetData",
        {"id": 13, "sheetName": first, "page": 1, "pageSize": 5},
        timeout=180,
    )
    print("sheet_ms", int((time.time() - t1) * 1000), flush=True)
    body = data["result"]["data"]["json"]
    print("sheet", body.get("sheetName"), "rows", body.get("totalRows"), "cols", len(body.get("columns") or []), flush=True)
    print("first_row", (body.get("rows") or [[]])[0][:6], flush=True)


if __name__ == "__main__":
    main()
