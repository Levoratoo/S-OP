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
        # last non-heartbeat lines from python stdout in run.log
        "docker exec snop-app sh -c \"grep -v 'Em execucao ha' /app/.previsao-python-jobs/job-9/run.log | tail -n 40\"",
        "docker exec snop-app sh -c 'ls -la /app/.previsao-python-jobs/job-9/relatorio*.xlsx; file /app/.previsao-python-jobs/job-9/relatorio_previsao_demanda_job_9.xlsx'",
        "docker exec snop-db mariadb -usnop -p'SnopApp!3042' sop_system -e \"SELECT id,status,LEFT(message,100) FROM previsao_python_jobs WHERE id=9;\"",
    ]
    for cmd in cmds:
        print("==", cmd[:140], flush=True)
        _i, o, e = client.exec_command(cmd, timeout=60)
        print(o.read().decode("utf-8", "replace")[:5000], flush=True)
        err = e.read().decode("utf-8", "replace")
        if err.strip():
            print("[e]", err[:800], flush=True)
    client.close()


if __name__ == "__main__":
    main()
