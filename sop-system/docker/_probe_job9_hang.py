#!/usr/bin/env python3
from __future__ import annotations

import os
import sys

import paramiko

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

PASSWORD = os.environ.get("SNOP_SSH_PASS") or os.environ.get("SNOP_DOCKER_PASS")


def main():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect("192.168.1.82", username="pedro-levorato", password=PASSWORD, timeout=25)
    cmds = [
        "docker exec snop-app printenv PREVISAO_PYTHON_TIMEOUT_MIN",
        "docker exec snop-app sh -c 'tail -n 60 /app/.previsao-python-jobs/job-9/run.log'",
        "docker exec snop-app sh -c 'ls -la /app/.previsao-python-jobs/job-9/ | head'",
        "free -h",
        "docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}' | head -5",
        "ps -ef | grep -E 'previsao_demanda|python' | grep -v grep | head",
    ]
    for cmd in cmds:
        print("==", cmd[:120], flush=True)
        _i, o, e = client.exec_command(cmd, timeout=60)
        print(o.read().decode("utf-8", "replace")[:4000], flush=True)
        err = e.read().decode("utf-8", "replace")
        if err and "password" not in err.lower():
            print("[e]", err[:800], flush=True)
    client.close()


if __name__ == "__main__":
    main()
