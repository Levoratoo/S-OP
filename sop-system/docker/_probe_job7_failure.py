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


def run(client, cmd, timeout=90):
    print("==", cmd[:200], flush=True)
    _i, o, e = client.exec_command(cmd, timeout=timeout)
    print(o.read().decode("utf-8", "replace")[:6000], flush=True)
    err = e.read().decode("utf-8", "replace")
    if err and "Using a password" not in err:
        print("[e]", err[:1500], flush=True)


def main():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect("192.168.1.82", username="pedro-levorato", password=PASSWORD, timeout=25)
    run(client, "docker ps --filter name=snop --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'")
    run(client, "curl -s -o /dev/null -w '%{http_code}\\n' http://127.0.0.1:3042/")
    run(client, "docker inspect --format='{{.RestartCount}} {{.State.Status}} {{.State.StartedAt}}' snop-app")
    run(client, "docker logs snop-app --tail 80 2>&1")
    run(
        client,
        "docker exec snop-app sh -c 'ls -la /app/.previsao-python-jobs/job-7/ 2>/dev/null; "
        "tail -n 80 /app/.previsao-python-jobs/job-7/run.log 2>/dev/null || true'",
    )
    run(
        client,
        "docker exec snop-db mariadb -usnop -p'SnopApp!3042' sop_system -e "
        "\"SELECT id,status,message,startedAt,finishedAt FROM previsao_python_jobs ORDER BY id DESC LIMIT 5;\"",
    )
    # memory
    run(client, "free -h; docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}' | head")
    client.close()


if __name__ == "__main__":
    main()
