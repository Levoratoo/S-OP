"""Ensure ERP_* vars are present on remote .env and recreate app container."""
from __future__ import annotations

import os
import sys

import paramiko

HOST = os.environ.get("SNOP_SSH_HOST", "192.168.1.82")
USER = os.environ.get("SNOP_SSH_USER", "pedro-levorato")
PASSWORD = os.environ.get("SNOP_SSH_PASS") or os.environ.get("SNOP_DOCKER_PASS")
REMOTE = os.environ.get("SNOP_REMOTE_DIR", "/opt/sites_dev/snop")

ENV_CMD = r"""
set -e
cd /opt/sites_dev/snop
touch .env
for kv in \
  'ERP_MSSQL_SERVER=VMDB2' \
  'ERP_MSSQL_INSTANCE=VMDB2' \
  'ERP_MSSQL_PORT=49257' \
  'ERP_MSSQL_DATABASE=MetricsPROD' \
  'ERP_MSSQL_USER=mitraconnect' \
  'ERP_MSSQL_PASSWORD=M1tra##2025' \
  'ERP_MSSQL_ENCRYPT=false' \
  'ERP_MSSQL_TRUST_CERT=true' \
  'ERP_FATURAMENTO_SOURCE=dbo.Usr_VIEW_MITRA_FAT_02' \
  'ERP_FATURAMENTO_DESDE=2022-01-01'
do
  key="${kv%%=*}"
  if grep -q "^${key}=" .env; then
    sed -i "s|^${key}=.*|${kv}|" .env
  else
    echo "${kv}" >> .env
  fi
done
chmod 600 .env
echo ENV_OK
grep '^ERP_' .env | sed 's/PASSWORD=.*/PASSWORD=***/'
docker compose up -d app
sleep 8
docker compose ps
"""


def main() -> None:
    if not PASSWORD:
        raise SystemExit("Defina SNOP_SSH_PASS")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASSWORD, timeout=30)
    _, stdout, stderr = ssh.exec_command(ENV_CMD, timeout=180)
    print(stdout.read().decode("utf-8", "replace"), flush=True)
    err = stderr.read().decode("utf-8", "replace")
    if err.strip():
        print(err[-2000:], flush=True)
    ssh.close()


if __name__ == "__main__":
    main()
