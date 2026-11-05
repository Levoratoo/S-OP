#!/usr/bin/env python3
from __future__ import annotations

import os
import re

import paramiko

PASSWORD = os.environ.get("SNOP_SSH_PASS") or os.environ.get("SNOP_DOCKER_PASS")


def main() -> None:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect("192.168.1.82", username="pedro-levorato", password=PASSWORD, timeout=25)

    _i, o, e = client.exec_command(
        "grep -E 'MYSQL_|DATABASE' /opt/sites_dev/snop/.env | sed 's/PASSWORD=.*/PASSWORD=***/'",
        timeout=30,
    )
    print(o.read().decode(), e.read().decode())

    _i, o, e = client.exec_command(
        "grep MYSQL_PASSWORD /opt/sites_dev/snop/.env",
        timeout=30,
    )
    env_line = o.read().decode().strip()
    m = re.search(r"MYSQL_PASSWORD=(.*)", env_line)
    db_pass = (m.group(1).strip().strip('"').strip("'") if m else "SnopApp!3042")
    print("using db pass length", len(db_pass), flush=True)

    sql = (
        "SELECT COUNT(*) AS previsoes FROM previsoes; "
        "SELECT ano, mes, COUNT(*) n FROM previsoes GROUP BY ano, mes ORDER BY ano DESC, mes DESC LIMIT 15; "
        "SHOW TABLES LIKE '%ciclo%'; "
        "SHOW TABLES LIKE '%previs%';"
    )
    cmd = f"docker exec snop-db mariadb -usnop -p'{db_pass}' sop_system -e \"{sql}\""
    _i, o, e = client.exec_command(cmd, timeout=60)
    print(o.read().decode("utf-8", "replace")[:8000])
    print(e.read().decode("utf-8", "replace")[:2000])

    # drizzle schema table names may be snake or camel
    sql2 = (
        "SELECT TABLE_NAME FROM information_schema.tables WHERE table_schema='sop_system' "
        "AND (TABLE_NAME LIKE '%ciclo%' OR TABLE_NAME LIKE '%previs%' OR TABLE_NAME LIKE '%Ciclo%' OR TABLE_NAME LIKE '%Previs%');"
    )
    cmd2 = f"docker exec snop-db mariadb -usnop -p'{db_pass}' sop_system -e \"{sql2}\""
    _i, o, e = client.exec_command(cmd2, timeout=60)
    print("TABLES:", o.read().decode("utf-8", "replace")[:4000])
    print(e.read().decode("utf-8", "replace")[:1000])

    client.close()


if __name__ == "__main__":
    main()
