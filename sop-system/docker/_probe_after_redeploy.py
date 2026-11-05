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
    out = o.read().decode("utf-8", "replace").replace("\ufeff", "")
    err = e.read().decode("utf-8", "replace")
    print(out[:7000], flush=True)
    if err and "Using a password" not in err:
        print("[stderr]", err[:1500], flush=True)
    return out


def main():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect("192.168.1.82", username="pedro-levorato", password=PASSWORD, timeout=25)
    run(client, "docker ps --filter name=snop --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'")
    run(client, "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3042/ || true")
    run(
        client,
        "docker exec snop-app python3 -c \"import csv; p='/app/dados-sistema/estatistica_previsto.csv'; "
        "f=open(p,encoding='utf-8-sig',newline=''); h=next(csv.reader(f)); f.close(); print(h[-8:])\"",
    )
    run(
        client,
        "grep -E '^(APP_PORT|MYSQL_|HOST|PORT|NODE_ENV|ERP_MSSQL_SERVER|DATABASE_URL)=' /opt/sites_dev/snop/.env | sed -E 's/(PASSWORD|DATABASE_URL)=.*/\\1=***/'",
    )
    run(
        client,
        "docker exec snop-db mariadb -usnop -p'SnopApp!3042' sop_system -e "
        "\"SELECT COUNT(*) previsoes FROM previsoes; "
        "SELECT ano,mes,COUNT(*) n FROM previsoes GROUP BY ano,mes ORDER BY ano DESC,mes DESC LIMIT 12; "
        "SELECT id,nome,status,anoInicio,mesInicio FROM ciclos_comerciais ORDER BY id DESC LIMIT 5;\"",
    )
    client.close()


if __name__ == "__main__":
    main()
