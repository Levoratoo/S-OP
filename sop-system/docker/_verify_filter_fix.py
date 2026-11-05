#!/usr/bin/env python3
import os
import paramiko

PASSWORD = os.environ.get("SNOP_SSH_PASS") or os.environ.get("SNOP_DOCKER_PASS")


def main():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect("192.168.1.82", username="pedro-levorato", password=PASSWORD, timeout=25)
    cmd = (
        "docker cp /tmp/previsao_demanda_final_v5_2_COMPLETO.py "
        "snop-app:/app/scripts-previsao/previsao_demanda_final_v5_2_COMPLETO.py; "
        "docker exec snop-app grep -n 'Clientes_Analise filtro' "
        "/app/scripts-previsao/previsao_demanda_final_v5_2_COMPLETO.py | head; "
        "docker exec snop-app sha256sum /app/scripts-previsao/previsao_demanda_final_v5_2_COMPLETO.py"
    )
    _i, o, e = client.exec_command(cmd, timeout=60)
    print(o.read().decode("utf-8", "replace"))
    print(e.read().decode("utf-8", "replace")[-500:])
    client.close()


if __name__ == "__main__":
    main()
