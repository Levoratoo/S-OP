"""Remove stale DB blockers and truncate faturamento before a clean ERP reload."""
from __future__ import annotations

import os

import paramiko

HOST = os.environ.get("SNOP_SSH_HOST", "192.168.1.82")
USER = os.environ.get("SNOP_SSH_USER", "pedro-levorato")
PASSWORD = os.environ.get("SNOP_SSH_PASS") or os.environ.get("SNOP_DOCKER_PASS")

COMMAND = r"""
set -e
echo '=== containers ==='
docker compose -f /opt/sites_dev/snop/docker-compose.yml ps
echo '=== app db errors ==='
docker logs --tail 80 snop-app 2>&1 | grep -E 'faturamento|lock|timeout|Failed query' || true
echo '=== restart db to clear stale transactions ==='
cd /opt/sites_dev/snop
docker compose restart db
for i in $(seq 1 30); do
  if docker inspect --format='{{.State.Health.Status}}' snop-db 2>/dev/null | grep -q healthy; then break; fi
  sleep 2
done
echo '=== truncate faturamento ==='
docker exec snop-app node --input-type=module -e \
  "import mysql from 'mysql2/promise'; const c=await mysql.createConnection(process.env.DATABASE_URL); await c.query('SET FOREIGN_KEY_CHECKS=0'); await c.query('TRUNCATE TABLE faturamento'); await c.query('SET FOREIGN_KEY_CHECKS=1'); const [r]=await c.query('SELECT COUNT(*) fat_rows FROM faturamento'); console.log(r); await c.end();"
docker compose up -d app
docker compose ps
"""


def main() -> None:
    if not PASSWORD:
        raise SystemExit("Defina SNOP_SSH_PASS")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASSWORD, timeout=30)
    try:
        _, stdout, stderr = ssh.exec_command(COMMAND, timeout=600)
        print(stdout.read().decode("utf-8", "replace"))
        error = stderr.read().decode("utf-8", "replace")
        if error.strip():
            print(error[-4000:])
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
