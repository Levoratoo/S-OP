#!/usr/bin/env python3
from __future__ import annotations

import os
import sys
from pathlib import Path

import paramiko

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

PASSWORD = os.environ.get("SNOP_SSH_PASS") or os.environ.get("SNOP_DOCKER_PASS")
OUT = Path(__file__).resolve().parent / "_audit_out" / "job_8_partial.xlsx"


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect("192.168.1.82", username="pedro-levorato", password=PASSWORD, timeout=25)
    # copy from container to host then sftp
    cmd = (
        "docker cp snop-app:/app/.previsao-python-jobs/job-8/relatorio_previsao_demanda_job_8.xlsx "
        "/tmp/job8.xlsx && ls -la /tmp/job8.xlsx"
    )
    _i, o, e = client.exec_command(cmd, timeout=60)
    print(o.read().decode(), e.read().decode())
    sftp = client.open_sftp()
    sftp.get("/tmp/job8.xlsx", str(OUT))
    sftp.close()
    client.close()
    print("downloaded", OUT, OUT.stat().st_size)


if __name__ == "__main__":
    main()
