import os
import paramiko

PASS = os.environ.get("SNOP_SSH_PASS") or "!!qUnP9K"
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("192.168.1.82", username="pedro-levorato", password=PASS, timeout=30)
script = r"""
const m = require('mysql2/promise');
(async () => {
  const c = await m.createConnection(process.env.DATABASE_URL);
  const [r] = await c.query("SHOW COLUMNS FROM ciclo_comercial_itens LIKE 'e%'");
  console.log('cols', r.map(x => x.Field).join(','));
  const [mig] = await c.query(
    "SELECT id FROM __sql_migrations WHERE id='0009_mts_estatistica_meses.sql'"
  );
  console.log('mig', JSON.stringify(mig));
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
"""
import base64

b64 = base64.b64encode(script.encode()).decode()
cmd = (
    f"docker exec -w /app snop-app sh -c "
    f"'echo {b64} | base64 -d > /tmp/check_e.js && node /tmp/check_e.js'"
)
_, stdout, stderr = ssh.exec_command(cmd, timeout=60)
print(stdout.read().decode())
print(stderr.read().decode()[:500])
ssh.close()
