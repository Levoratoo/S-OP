"""Upload faturamento SQL sync + rebuild snop-app."""
from __future__ import annotations

import os
import posixpath
import sys
from pathlib import Path

import paramiko

HOST = os.environ.get("SNOP_SSH_HOST", "192.168.1.82")
USER = os.environ.get("SNOP_SSH_USER", "pedro-levorato")
PASSWORD = os.environ.get("SNOP_SSH_PASS") or os.environ.get("SNOP_DOCKER_PASS")
REMOTE = os.environ.get("SNOP_REMOTE_DIR", "/opt/sites_dev/snop")
ROOT = Path(__file__).resolve().parents[1]

FILES = [
    "package.json",
    "package-lock.json",
    "pnpm-lock.yaml",
    "docker-compose.yml",
    "server/db.ts",
    "server/routers.ts",
    "server/services/erp-mssql.ts",
    "server/services/faturamento-sql-sync.ts",
    "server/services/faturamento-sql-sync.test.ts",
    "server/services/seed-from-faturamento.ts",
    "server/services/seed-capacidade.ts",
    "server/services/desagregacao.ts",
    "server/services/de-para-map.ts",
    "server/services/previsao-etl.ts",
    "server/previsaoPython.ts",
    "shared/linha.ts",
    "scripts-previsao/previsao_demanda_final_v5_2_COMPLETO.py",
    "client/src/pages/vendas/ImportarFaturamento.tsx",
    "client/src/pages/vendas/HistoricoVendas.tsx",
    "client/src/pages/capacidade/CapacidadeVsDemanda.tsx",
    "client/src/pages/integracao/PrevisaoPython.tsx",
    "docker/.env.example",
]


def ensure_dir(sftp: paramiko.SFTPClient, remote_dir: str) -> None:
    parts = remote_dir.strip("/").split("/")
    cur = ""
    for part in parts:
        cur += "/" + part
        try:
            sftp.stat(cur)
        except FileNotFoundError:
            try:
                sftp.mkdir(cur)
            except OSError:
                pass


def main() -> None:
    if not PASSWORD:
        raise SystemExit("Defina SNOP_SSH_PASS")

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASSWORD, timeout=30)
    sftp = ssh.open_sftp()
    try:
        for rel in FILES:
            local = ROOT / rel
            if not local.exists():
                print("SKIP missing", rel, flush=True)
                continue
            remote = posixpath.join(REMOTE, rel.replace("\\", "/"))
            ensure_dir(sftp, posixpath.dirname(remote))
            print("put", rel, flush=True)
            sftp.put(str(local), remote)
    finally:
        sftp.close()

    env_cmd = f"""
set -e
cd "{REMOTE}"
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
  key="${{kv%%=*}}"
  if grep -q "^${{key}}=" .env; then
    sed -i "s|^${{key}}=.*|${{kv}}|" .env
  else
    echo "${{kv}}" >> .env
  fi
done
chmod 600 .env
echo ENV_OK
grep '^ERP_' .env | sed 's/PASSWORD=.*/PASSWORD=***/'
"""
    print("patch .env", flush=True)
    _, stdout, stderr = ssh.exec_command(env_cmd, timeout=60)
    print(stdout.read().decode("utf-8", "replace"), flush=True)
    err = stderr.read().decode("utf-8", "replace")
    if err:
        print(err, flush=True)

    print("build app...", flush=True)
    _, stdout, stderr = ssh.exec_command(
        f'cd "{REMOTE}" && docker compose up -d --build app 2>&1 | tail -50',
        timeout=1200,
    )
    print(stdout.read().decode("utf-8", "replace"), flush=True)
    err = stderr.read().decode("utf-8", "replace")
    if err:
        print(err[-800:], flush=True)

    ssh.close()
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
