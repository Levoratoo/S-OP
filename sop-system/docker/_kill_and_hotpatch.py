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
LOCAL_SCRIPT = r"C:\Users\pedro.levorato\Documents\SNOP\sop-system\scripts-previsao\previsao_demanda_final_v5_2_COMPLETO.py"


def run(client, cmd, timeout=90):
    print("==", cmd[:200], flush=True)
    _i, o, e = client.exec_command(cmd, timeout=timeout)
    print(o.read().decode("utf-8", "replace")[:4000], flush=True)
    err = e.read().decode("utf-8", "replace")
    if err.strip():
        print("[e]", err[:1200], flush=True)


def main():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect("192.168.1.82", username="pedro-levorato", password=PASSWORD, timeout=25)

    run(
        client,
        "docker exec snop-app sh -c \"ps aux | grep -E 'previsao_demanda|python' | grep -v grep\"",
    )
    run(
        client,
        "docker exec snop-app sh -c "
        "\"kill -9 \\$(ps aux | awk '/previsao_demanda_final/ {print \\$2}') 2>/dev/null || true; "
        "kill -9 \\$(ps aux | awk '/job-9\\/previsao/ {print \\$2}') 2>/dev/null || true; "
        "echo killed; ps aux | grep previsao | grep -v grep || echo no-previsao\"",
    )

    sftp = client.open_sftp()
    sftp.put(LOCAL_SCRIPT, "/tmp/previsao_demanda_final_v5_2_COMPLETO.py")
    sftp.close()
    run(
        client,
        "docker cp /tmp/previsao_demanda_final_v5_2_COMPLETO.py "
        "snop-app:/app/scripts-previsao/previsao_demanda_final_v5_2_COMPLETO.py && "
        "cp /tmp/previsao_demanda_final_v5_2_COMPLETO.py /opt/sites_dev/snop/scripts-previsao/ && "
        "docker exec snop-app sh -c 'wc -c /app/scripts-previsao/previsao_demanda_final_v5_2_COMPLETO.py; "
        "grep -n \"Matriz numérica\" /app/scripts-previsao/previsao_demanda_final_v5_2_COMPLETO.py | head'",
    )
    run(
        client,
        "docker exec snop-db mariadb -usnop -p'SnopApp!3042' sop_system -e "
        "\"UPDATE previsao_python_jobs SET status='ERROR', "
        "message='Interrompido para otimizacao Clientes_Por_Marca', finishedAt=NOW() "
        "WHERE status IN ('RUNNING','PENDING'); "
        "SELECT id,status,LEFT(message,80) FROM previsao_python_jobs ORDER BY id DESC LIMIT 3;\"",
    )
    run(client, "free -h")
    client.close()


if __name__ == "__main__":
    main()
