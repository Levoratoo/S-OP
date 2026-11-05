"""Lista views ERP relacionadas a pedidos/PV/carteira no MetricsPROD."""
from __future__ import annotations

import os
import sys

import paramiko

HOST = "192.168.1.82"
PASSWORD = os.environ.get("SNOP_SSH_PASS") or os.environ.get("SNOP_DOCKER_PASS")
if not PASSWORD:
    sys.exit("missing SNOP_SSH_PASS")

NODE_SCRIPT = r"""
const sql = require('mssql');
(async () => {
  const port = Number(process.env.ERP_MSSQL_PORT || 0) || undefined;
  const cfg = {
    server: process.env.ERP_MSSQL_SERVER,
    port,
    database: process.env.ERP_MSSQL_DATABASE,
    user: process.env.ERP_MSSQL_USER,
    password: process.env.ERP_MSSQL_PASSWORD,
    options: {
      encrypt: String(process.env.ERP_MSSQL_ENCRYPT || 'false').toLowerCase() === 'true',
      trustServerCertificate: String(process.env.ERP_MSSQL_TRUST_CERT || 'true').toLowerCase() !== 'false',
      enableArithAbort: true,
    },
    connectionTimeout: 30000,
    requestTimeout: 180000,
  };
  if (!port && process.env.ERP_MSSQL_INSTANCE) {
    cfg.options.instanceName = process.env.ERP_MSSQL_INSTANCE;
  }
  const pool = await sql.connect(cfg);
  const q = await pool.request().query(`
    SELECT TABLE_SCHEMA, TABLE_NAME
    FROM INFORMATION_SCHEMA.VIEWS
    WHERE TABLE_NAME LIKE '%PED%'
       OR TABLE_NAME LIKE '%PV%'
       OR TABLE_NAME LIKE '%CART%'
       OR TABLE_NAME LIKE '%ORDEM%'
       OR TABLE_NAME LIKE '%MITRA%'
       OR TABLE_NAME LIKE '%LIBER%'
       OR TABLE_NAME LIKE '%PRG%'
    ORDER BY TABLE_NAME
  `);
  console.log('VIEWS', q.recordset.length);
  for (const r of q.recordset) {
    console.log(r.TABLE_SCHEMA + '.' + r.TABLE_NAME);
  }
  await pool.close();
})().catch((e) => {
  console.error('ERR', e && e.message ? e.message : e);
  process.exit(1);
});
"""

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username="pedro-levorato", password=PASSWORD, timeout=30)

# Write script into container and run
b64 = __import__("base64").b64encode(NODE_SCRIPT.encode()).decode()
cmd = (
    "docker exec snop-app sh -c "
    + repr(f"echo {b64} | base64 -d > /tmp/probe_pedidos.js && node /tmp/probe_pedidos.js")
)
_, stdout, stderr = ssh.exec_command(cmd, timeout=180)
out = stdout.read().decode("utf-8", errors="replace")
err = stderr.read().decode("utf-8", errors="replace")
print(out)
if err.strip():
    print("STDERR:", err[:3000], file=sys.stderr)
ssh.close()
