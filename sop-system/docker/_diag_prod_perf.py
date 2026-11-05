"""Read-only production diagnostics for restart and database performance."""
from __future__ import annotations

import os

import paramiko

HOST = os.environ.get("SNOP_SSH_HOST", "192.168.1.82")
USER = os.environ.get("SNOP_SSH_USER", "pedro-levorato")
PASSWORD = os.environ.get("SNOP_SSH_PASS") or os.environ.get("SNOP_DOCKER_PASS")

COMMAND = r"""
set -e
cd /opt/sites_dev/snop
echo '=== host memory ==='
free -h
echo '=== docker stats ==='
docker stats --no-stream snop-app snop-db
echo '=== app state ==='
docker inspect snop-app --format='OOMKilled={{.State.OOMKilled}} Exit={{.State.ExitCode}} RestartCount={{.RestartCount}} Started={{.State.StartedAt}} Finished={{.State.FinishedAt}}'
echo '=== app logs ==='
docker logs --since 48h --tail 250 snop-app 2>&1
echo '=== faturamento indexes ==='
docker exec snop-app node --input-type=module - <<'NODE'
import mysql from 'mysql2/promise';
const c=await mysql.createConnection(process.env.DATABASE_URL);
const [idx]=await c.query('SHOW INDEX FROM faturamento');
console.log(idx.map(x => ({name:x.Key_name,column:x.Column_name,seq:x.Seq_in_index})));
const [size]=await c.query(`SELECT table_rows, ROUND(data_length/1024/1024,1) data_mb, ROUND(index_length/1024/1024,1) index_mb FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='faturamento'`);
console.log(size);
await c.end();
NODE
"""


def main() -> None:
    if not PASSWORD:
        raise SystemExit("Defina SNOP_SSH_PASS")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASSWORD, timeout=30)
    stdin, stdout, stderr = ssh.exec_command(COMMAND, timeout=600)
    stdin.channel.shutdown_write()
    print(stdout.read().decode("utf-8", "replace"))
    error = stderr.read().decode("utf-8", "replace")
    if error.strip():
        print(error[-4000:])
    ssh.close()


if __name__ == "__main__":
    main()
