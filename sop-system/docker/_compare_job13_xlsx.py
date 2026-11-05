#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import http.cookiejar
import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path

import paramiko

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

HOST = "192.168.1.82"
PASSWORD = os.environ.get("SNOP_SSH_PASS") or "!!qUnP9K"
BASE = f"http://{HOST}:3042"
LOCAL = Path(r"C:\Users\pedro.levorato\Downloads\relatorio_previsao_demanda_job_13.xlsx")


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> None:
    if LOCAL.exists():
        local_bytes = LOCAL.read_bytes()
        print("local", LOCAL.stat().st_size, sha256(local_bytes)[:16], flush=True)
    else:
        print("local MISSING", LOCAL, flush=True)
        local_bytes = b""

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        HOST,
        username="pedro-levorato",
        password=PASSWORD,
        timeout=20,
        allow_agent=False,
        look_for_keys=False,
    )
    cmd = (
        "docker exec snop-app sh -c "
        "'ls -la /app/.previsao-python-jobs/job-13/*.xlsx; "
        "sha256sum /app/.previsao-python-jobs/job-13/relatorio_previsao_demanda_job_13.xlsx; "
        "mariadb -h db -usnop -pSnopApp!3042 sop_system -N -e "
        "\"SELECT id,status,outputFileName,workdir FROM previsao_python_jobs WHERE id=13\"'"
    )
    _i, o, e = client.exec_command(cmd, timeout=40)
    print(o.read().decode("utf-8", "replace")[:2000], flush=True)
    err = e.read().decode("utf-8", "replace")
    if err.strip():
        print("[e]", err[:800], flush=True)
    client.close()

    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    opener.open(BASE + "/api/auth/local-login", timeout=40)

    # download via trpc mutation needs POST
    req = urllib.request.Request(
        BASE + "/api/trpc/previsaoPython.download",
        data=json.dumps({"json": {"id": 13}}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with opener.open(req, timeout=180) as resp:
        payload = json.loads(resp.read().decode())
    result = payload["result"]["data"]["json"]
    import base64

    remote_dl = base64.b64decode(result["contentBase64"])
    print(
        "api_download",
        result.get("fileName"),
        len(remote_dl),
        sha256(remote_dl)[:16],
        "match_local",
        bool(local_bytes) and sha256(remote_dl) == sha256(local_bytes),
        flush=True,
    )


if __name__ == "__main__":
    main()
