import os
import paramiko

HOST = os.environ.get("SNOP_SSH_HOST", "192.168.1.82")
USER = os.environ.get("SNOP_SSH_USER", "pedro-levorato")
PASSWORD = os.environ.get("SNOP_SSH_PASS") or os.environ.get("SNOP_DOCKER_PASS")

NODE = r"""
import('mysql2/promise').then(async m => {
  const c = await m.createConnection(process.env.DATABASE_URL);
  const [a] = await c.query("SELECT COUNT(*) n, SUM(qtd) s FROM faturamento WHERE tipoFaturamento='SAIDA'");
  const [b] = await c.query("SELECT COUNT(*) n, SUM(qtd) s FROM faturamento WHERE tipoFaturamento='DEVOLUCAO'");
  console.log(JSON.stringify({saida:a[0], devolucao:b[0]}));
  await c.end();
}).catch(e => { console.error(e); process.exit(1); });
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)
stdin, stdout, stderr = c.exec_command("docker exec -i snop-app node -")
stdin.write(NODE)
stdin.channel.shutdown_write()
print(stdout.read().decode("utf-8", "replace"))
print(stderr.read().decode("utf-8", "replace")[-500:])
c.close()
