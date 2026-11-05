#!/usr/bin/env python3
import os
import paramiko

PASSWORD = os.environ.get("SNOP_SSH_PASS") or os.environ.get("SNOP_DOCKER_PASS")


def main():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect("192.168.1.82", username="pedro-levorato", password=PASSWORD, timeout=25)
    cmd = (
        "docker exec snop-app bash -lc "
        "'grep -nE \"Clientes_Analise|Cliente_detalhado|sucesso|filtro|Erro|Relatório|Timeout\" "
        "/app/.previsao-python-jobs/job-12/run.log 2>/dev/null | grep -v \"\\[job 12\\]\" | tail -n 40'"
    )
    _i, o, e = client.exec_command(cmd, timeout=60)
    print(o.read().decode("utf-8", "replace"))
    client.close()


if __name__ == "__main__":
    main()
