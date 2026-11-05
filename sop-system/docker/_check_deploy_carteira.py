"""Confere saúde do container e se syncFromErp está no bundle."""
from __future__ import annotations

import http.cookiejar
import os
import urllib.parse
import urllib.request

import paramiko

HOST = "192.168.1.82"
PASSWORD = os.environ.get("SNOP_SSH_PASS") or os.environ.get("SNOP_DOCKER_PASS") or "!!qUnP9K"
BASE = f"http://{HOST}:3042"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username="pedro-levorato", password=PASSWORD, timeout=30)

_, stdout, _ = ssh.exec_command(
    "docker ps --filter name=snop-app --format '{{.Status}}' ; "
    "docker exec snop-app sh -c \"grep -l syncFromErp /app/dist/index.js 2>/dev/null || "
    "grep -R -l syncFromErp /app/dist 2>/dev/null | head -3 || echo NO_SYNC_IN_DIST\"",
    timeout=60,
)
print("remote:\n" + stdout.read().decode("utf-8", errors="replace"), flush=True)
ssh.close()

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
try:
    opener.open(BASE + "/api/auth/local-login", timeout=30)
    req = urllib.request.Request(
        BASE + "/api/trpc/carteiraPedidos.list?input=" + urllib.parse.quote('{"json":{"limit":5}}')
    )
    with opener.open(req, timeout=60) as resp:
        body = resp.read().decode()
        print("list OK", resp.status, body[:300], flush=True)
except Exception as exc:
    data = getattr(exc, "read", lambda: b"")()
    print("API ERR", data.decode()[:800] if data else exc, flush=True)
