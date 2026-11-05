#!/usr/bin/env python3
from __future__ import annotations

import os

import paramiko

PASSWORD = os.environ.get("SNOP_SSH_PASS") or os.environ.get("SNOP_DOCKER_PASS")


def run(client, cmd, timeout=90):
    print("==", cmd[:180], flush=True)
    _i, o, e = client.exec_command(cmd, timeout=timeout)
    text = o.read().decode("utf-8", "replace").replace("\ufeff", "")
    # redact passwords in env dumps
    safe = []
    for line in text.splitlines():
        if "PASSWORD" in line.upper() or "SECRET" in line.upper() or "DATABASE_URL" in line.upper():
            key = line.split("=", 1)[0]
            safe.append(f"{key}=***")
        else:
            safe.append(line)
    print("\n".join(safe)[:9000], flush=True)
    err = e.read().decode("utf-8", "replace")
    if err:
        print("[stderr]", err[:2000], flush=True)


def main():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect("192.168.1.82", username="pedro-levorato", password=PASSWORD, timeout=25)

    run(client, "cat /opt/sites_dev/snop/.env")
    run(client, "docker exec snop-app printenv | grep -E 'MYSQL|DATABASE|DB_' | sed 's/PASSWORD=.*/PASSWORD=***/'")
    run(
        client,
        "docker exec snop-db mariadb -uroot -p'SnopRoot!3042' sop_system -e "
        "\"SELECT COUNT(*) previsoes FROM previsoes; "
        "SELECT ano,mes,COUNT(*) n FROM previsoes GROUP BY ano,mes ORDER BY ano DESC,mes DESC LIMIT 20; "
        "SELECT id,nome,status,anoInicio,mesInicio FROM ciclos_comerciais ORDER BY id DESC LIMIT 10; "
        "SELECT c.id, COUNT(i.id) itens_mts "
        "FROM ciclos_comerciais c "
        "LEFT JOIN ciclo_comercial_itens i ON i.cicloId=c.id AND i.planoColab IN ('MTS','JITO') "
        "GROUP BY c.id ORDER BY c.id DESC LIMIT 10;\"",
    )
    # try root:root too
    run(
        client,
        "docker exec snop-db mariadb -uroot -proot -e 'SHOW DATABASES;'",
    )
    client.close()


if __name__ == "__main__":
    main()
