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
    print("==", cmd[:200], flush=True)
    _i, o, e = client.exec_command(cmd, timeout=timeout)
    print(o.read().decode("utf-8", "replace")[:5000], flush=True)
    err = e.read().decode("utf-8", "replace")
    if err and "Using a password" not in err:
        print("[e]", err[:1500], flush=True)


def main():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect("192.168.1.82", username="pedro-levorato", password=PASSWORD, timeout=25)

    run(
        client,
        "docker exec snop-db mariadb -usnop -p'SnopApp!3042' sop_system -e "
        "\"SELECT id,status,LEFT(message,140) msg, startedAt, finishedAt "
        "FROM previsao_python_jobs ORDER BY id DESC LIMIT 5;\"",
    )
    run(
        client,
        "docker exec snop-app sh -c "
        "'ls -la /app/.previsao-python-jobs/job-8/; "
        "wc -c /app/.previsao-python-jobs/job-8/run.log; "
        "tail -n 50 /app/.previsao-python-jobs/job-8/run.log'",
    )
    run(client, "grep PREVISAO /opt/sites_dev/snop/.env")

    # bump timeout + threads and recreate app (no full rebuild)
    sftp = client.open_sftp()
    sftp.put(
        r"C:\Users\pedro.levorato\Documents\SNOP\sop-system\docker-compose.yml",
        "/opt/sites_dev/snop/docker-compose.yml",
    )
    sftp.close()

    run(
        client,
        "grep -q '^PREVISAO_PYTHON_TIMEOUT_MIN=' /opt/sites_dev/snop/.env "
        "&& sed -i 's/^PREVISAO_PYTHON_TIMEOUT_MIN=.*/PREVISAO_PYTHON_TIMEOUT_MIN=70/' /opt/sites_dev/snop/.env "
        "|| echo PREVISAO_PYTHON_TIMEOUT_MIN=70 >> /opt/sites_dev/snop/.env; "
        "grep -q '^PREVISAO_PYTHON_THREADS=' /opt/sites_dev/snop/.env "
        "&& sed -i 's/^PREVISAO_PYTHON_THREADS=.*/PREVISAO_PYTHON_THREADS=1/' /opt/sites_dev/snop/.env "
        "|| echo PREVISAO_PYTHON_THREADS=1 >> /opt/sites_dev/snop/.env; "
        "grep PREVISAO /opt/sites_dev/snop/.env",
    )
    run(client, "cd /opt/sites_dev/snop && docker compose up -d --force-recreate app")
    for i in range(24):
        _i, o, _e = client.exec_command(
            "docker inspect --format='{{.State.Health.Status}}' snop-app", timeout=20
        )
        st = o.read().decode().strip()
        print(f"health[{i}]={st}", flush=True)
        if st == "healthy":
            break
        time.sleep(5)
    run(client, "docker exec snop-app printenv PREVISAO_PYTHON_TIMEOUT_MIN PREVISAO_PYTHON_THREADS")
    run(client, "curl -s -o /dev/null -w '%{http_code}\\n' http://127.0.0.1:3042/")
    client.close()


if __name__ == "__main__":
    main()
