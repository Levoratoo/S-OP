#!/usr/bin/env python3
from __future__ import annotations

import http.cookiejar
import json
import os
import sys
import urllib.parse
import urllib.request

import paramiko

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

HOST = "192.168.1.82"
PASSWORD = os.environ.get("SNOP_SSH_PASS") or "!!qUnP9K"
BASE = f"http://{HOST}:3042"


def ssh_run(cmd: str, timeout: int = 60) -> str:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        HOST,
        username="pedro-levorato",
        password=PASSWORD,
        timeout=15,
        allow_agent=False,
        look_for_keys=False,
    )
    try:
        _i, o, e = client.exec_command(cmd, timeout=timeout)
        out = o.read().decode("utf-8", "replace")
        err = e.read().decode("utf-8", "replace")
        if err.strip() and "Using a password" not in err:
            print("[stderr]", err[:1500], flush=True)
        return out
    finally:
        client.close()


def trpc_get(path: str, payload: dict, timeout: int = 120):
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    opener.open(BASE + "/api/auth/local-login", timeout=40)
    url = BASE + path + "?input=" + urllib.parse.quote(json.dumps({"json": payload}))
    with opener.open(url, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def main() -> None:
    print("== docker", flush=True)
    print(ssh_run('docker ps --format "{{.Names}} {{.Status}}"')[:800], flush=True)
    print("== job dir", flush=True)
    print(
        ssh_run(
            "docker exec snop-app ls -lah /app/.previsao-python-jobs/job-13 | head -n 20"
        )[:1200],
        flush=True,
    )
    print("== workbookMeta", flush=True)
    try:
        meta = trpc_get("/api/trpc/previsaoPython.workbookMeta", {"id": 13}, timeout=180)
        print(json.dumps(meta)[:2000], flush=True)
    except Exception as exc:
        print("workbookMeta FAIL", type(exc).__name__, exc, flush=True)
    print("== getById", flush=True)
    try:
        job = trpc_get("/api/trpc/previsaoPython.getById", {"id": 13}, timeout=60)
        print(json.dumps(job)[:1200], flush=True)
    except Exception as exc:
        print("getById FAIL", type(exc).__name__, exc, flush=True)


if __name__ == "__main__":
    main()
