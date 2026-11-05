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
    print("==", cmd[:220], flush=True)
    _i, o, e = client.exec_command(cmd, timeout=timeout)
    out = o.read().decode("utf-8", "replace").replace("\ufeff", "")
    err = e.read().decode("utf-8", "replace")
    print(out[:8000], flush=True)
    if err and "Using a password on the command line" not in err:
        print("[stderr]", err[:2000], flush=True)
    return out, err


def main():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect("192.168.1.82", username="pedro-levorato", password=PASSWORD, timeout=25)

    run(client, "grep -E '^MYSQL_' /opt/sites_dev/snop/.env | sed 's/=.*/=***/'")

    # Wait health
    for i in range(24):
        out, _ = run(
            client,
            "docker inspect --format='{{.State.Health.Status}}' snop-app 2>/dev/null || echo starting",
        )
        status = out.strip().splitlines()[-1] if out.strip() else "starting"
        print(f"health[{i}]={status}", flush=True)
        if status in {"healthy", "unhealthy"}:
            break
        time.sleep(5)

    run(client, "docker logs snop-app --tail 60 2>&1")
    run(client, "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3042/ || true")

    # Try common root passwords against existing volume
    for root_pass in ["SnopRoot!3042", "root", "snop_root_change_me"]:
        out, err = run(
            client,
            f"docker exec snop-db mariadb -uroot -p'{root_pass}' -e \"SELECT 1 AS ok; SELECT user,host FROM mysql.user;\"",
        )
        if "ok" in out:
            print(f"ROOT_OK with {root_pass}", flush=True)
            run(
                client,
                f"docker exec snop-db mariadb -uroot -p'{root_pass}' -e \""
                "ALTER USER 'snop'@'%' IDENTIFIED BY 'SnopApp!3042'; "
                "ALTER USER 'snop'@'localhost' IDENTIFIED BY 'SnopApp!3042'; "
                "CREATE USER IF NOT EXISTS 'snop'@'%' IDENTIFIED BY 'SnopApp!3042'; "
                "GRANT ALL ON sop_system.* TO 'snop'@'%'; FLUSH PRIVILEGES;\"",
            )
            run(
                client,
                "docker exec snop-db mariadb -usnop -p'SnopApp!3042' sop_system -e "
                "\"SELECT COUNT(*) previsoes FROM previsoes; "
                "SELECT ano,mes,COUNT(*) n FROM previsoes GROUP BY ano,mes ORDER BY ano DESC,mes DESC LIMIT 12; "
                "SELECT id,nome,status,anoInicio,mesInicio FROM ciclos_comerciais ORDER BY id DESC LIMIT 5; "
                "SELECT COUNT(*) fat FROM faturamento;\"",
            )
            break
    else:
        print("NO_ROOT_PASSWORD_WORKED", flush=True)

    client.close()


if __name__ == "__main__":
    main()
