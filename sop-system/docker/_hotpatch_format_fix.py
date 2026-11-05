#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import os
import sys

import paramiko

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

PASSWORD = os.environ.get("SNOP_SSH_PASS") or os.environ.get("SNOP_DOCKER_PASS")
LOCAL_SCRIPT = r"C:\Users\pedro.levorato\Documents\SNOP\sop-system\scripts-previsao\previsao_demanda_final_v5_2_COMPLETO.py"
LOCAL_HELPER = r"C:\Users\pedro.levorato\Documents\SNOP\sop-system\scripts-previsao\previsao_meses.py"


def run(client, cmd, timeout=120):
    print("==", cmd[:200], flush=True)
    _i, o, e = client.exec_command(cmd, timeout=timeout)
    print(o.read().decode("utf-8", "replace")[:4000], flush=True)
    err = e.read().decode("utf-8", "replace")
    if err.strip() and "password" not in err.lower():
        print("[e]", err[:1000], flush=True)


def main():
    local_hash = hashlib.sha256(open(LOCAL_SCRIPT, "rb").read()).hexdigest()
    print("local_hash", local_hash, flush=True)

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect("192.168.1.82", username="pedro-levorato", password=PASSWORD, timeout=25)

    sftp = client.open_sftp()
    sftp.put(LOCAL_SCRIPT, "/tmp/previsao_demanda_final_v5_2_COMPLETO.py")
    sftp.put(LOCAL_HELPER, "/tmp/previsao_meses.py")
    sftp.close()

    run(
        client,
        "docker cp /tmp/previsao_demanda_final_v5_2_COMPLETO.py "
        "snop-app:/app/scripts-previsao/previsao_demanda_final_v5_2_COMPLETO.py && "
        "docker cp /tmp/previsao_meses.py snop-app:/app/scripts-previsao/previsao_meses.py && "
        "docker cp /tmp/previsao_demanda_final_v5_2_COMPLETO.py "
        "'snop-app:/app/3. Script Python Previsão Demanda/previsao_demanda_final_v5_2_COMPLETO.py' && "
        "docker cp /tmp/previsao_meses.py "
        "'snop-app:/app/3. Script Python Previsão Demanda/previsao_meses.py' && "
        "mkdir -p /opt/sites_dev/snop/scripts-previsao && "
        "cp /tmp/previsao_demanda_final_v5_2_COMPLETO.py /opt/sites_dev/snop/scripts-previsao/ && "
        "cp /tmp/previsao_meses.py /opt/sites_dev/snop/scripts-previsao/ && "
        "sha256sum /opt/sites_dev/snop/scripts-previsao/previsao_demanda_final_v5_2_COMPLETO.py && "
        "docker exec snop-app sha256sum /app/scripts-previsao/previsao_demanda_final_v5_2_COMPLETO.py && "
        "echo SCRIPT_UPDATED",
    )
    client.close()


if __name__ == "__main__":
    main()
