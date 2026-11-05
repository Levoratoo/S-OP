#!/usr/bin/env python3
"""Quick SSH probe of remote Docker / deploy state."""
from __future__ import annotations

import os
import sys

import paramiko

HOST = os.environ.get("SNOP_SSH_HOST", "192.168.1.82")
USER = os.environ.get("SNOP_SSH_USER", "pedro-levorato")
PASSWORD = os.environ.get("SNOP_SSH_PASS") or os.environ.get("SNOP_DOCKER_PASS")


def main() -> None:
    if not PASSWORD:
        raise SystemExit("Defina SNOP_SSH_PASS")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=25)
    cmds = [
        "docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'",
        "cd /opt/sites_dev/snop && docker compose ps",
        "ps -ef | grep -E 'docker|compose|buildkit' | grep -v grep | head -25",
        "ls -la /opt/sites_dev/snop/scripts-previsao/ | head -20",
        "test -f /opt/sites_dev/snop/scripts-previsao/previsao_meses.py && echo HELPER_OK || echo HELPER_MISSING",
        "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3042/ || true",
    ]
    for cmd in cmds:
        print(f"== {cmd}", flush=True)
        _stdin, stdout, stderr = client.exec_command(cmd, timeout=60)
        out = stdout.read().decode("utf-8", "replace")
        err = stderr.read().decode("utf-8", "replace")
        if out:
            print(out[:4000], flush=True)
        if err:
            print("[stderr]", err[:1000], flush=True)
    client.close()


if __name__ == "__main__":
    main()
