#!/usr/bin/env python3
import os
import paramiko

HOST = "192.168.1.82"
USER = "pedro-levorato"
PASSWORD = os.environ.get("SNOP_SSH_PASS") or os.environ.get("SNOP_DOCKER_PASS") or ""


def main() -> None:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=25)
    cmd = (
        "docker exec snop-app bash -lc "
        "'echo ==== LOG TAIL ====; "
        "tail -n 120 /app/.previsao-python-jobs/job-10/run.log; "
        "echo ==== FILES ====; "
        "ls -lah /app/.previsao-python-jobs/job-10/; "
        "echo ==== MEM ====; "
        "free -h; "
        "echo ==== LAST PROGRESS ====; "
        "grep -E \"Gerando|sucesso|Iniciando|marca|Clientes_|Luz|Analise|Por_Marca\" "
        "/app/.previsao-python-jobs/job-10/run.log | tail -n 40'"
    )
    _i, out, err = client.exec_command(cmd, timeout=90)
    print(out.read().decode("utf-8", "replace"))
    stderr = err.read().decode("utf-8", "replace")
    if stderr:
        print("STDERR", stderr[-2000:])
    client.close()


if __name__ == "__main__":
    main()
