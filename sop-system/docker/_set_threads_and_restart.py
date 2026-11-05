#!/usr/bin/env python3
from __future__ import annotations

import os
import sys
import time

import paramiko

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

PASSWORD = os.environ.get("SNOP_SSH_PASS") or os.environ.get("SNOP_DOCKER_PASS")


def run(client, cmd, timeout=120):
    print("==", cmd[:180], flush=True)
    _i, o, e = client.exec_command(cmd, timeout=timeout)
    print(o.read().decode("utf-8", "replace")[:4000], flush=True)
    err = e.read().decode("utf-8", "replace")
    if err and "Using a password" not in err:
        print("[e]", err[:1200], flush=True)


def main():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect("192.168.1.82", username="pedro-levorato", password=PASSWORD, timeout=25)

    # Upload updated compose (threads=1) without full image rebuild.
    sftp = client.open_sftp()
    local = r"C:\Users\pedro.levorato\Documents\SNOP\sop-system\docker-compose.yml"
    remote = "/opt/sites_dev/snop/docker-compose.yml"
    sftp.put(local, remote)
    sftp.close()

    run(
        client,
        "grep -q '^PREVISAO_PYTHON_THREADS=' /opt/sites_dev/snop/.env "
        "&& sed -i 's/^PREVISAO_PYTHON_THREADS=.*/PREVISAO_PYTHON_THREADS=1/' /opt/sites_dev/snop/.env "
        "|| echo PREVISAO_PYTHON_THREADS=1 >> /opt/sites_dev/snop/.env",
    )
    run(client, "cd /opt/sites_dev/snop && docker compose up -d app")
    for i in range(24):
        _i, o, _e = client.exec_command(
            "docker inspect --format='{{.State.Health.Status}}' snop-app", timeout=20
        )
        st = o.read().decode().strip()
        print(f"health[{i}]={st}", flush=True)
        if st == "healthy":
            break
        time.sleep(5)
    run(client, "curl -s -o /dev/null -w '%{http_code}\\n' http://127.0.0.1:3042/")
    run(
        client,
        "docker exec snop-app printenv PREVISAO_PYTHON_THREADS",
    )
    client.close()


if __name__ == "__main__":
    main()
