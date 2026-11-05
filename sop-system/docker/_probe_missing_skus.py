import os
import paramiko

HOST = os.environ.get("SNOP_SSH_HOST", "192.168.1.82")
USER = os.environ.get("SNOP_SSH_USER", "pedro-levorato")
PASSWORD = os.environ.get("SNOP_SSH_PASS") or os.environ.get("SNOP_DOCKER_PASS")

NODE = r"""
import('mysql2/promise').then(async m => {
  const c = await m.createConnection(process.env.DATABASE_URL);
  const skus = ['80.06.001702','80.06.001701','81.03.000168','80.01.000894','80.01.000851','80.04.000021','80.04.000020'];
  for (const sku of skus) {
    const [p] = await c.query('SELECT id,codItem,marca,linha,tipoEstoque,status,projetarEstatistica FROM produtos WHERE UPPER(codItem)=? OR UPPER(codigo)=?', [sku,sku]);
    const [f] = await c.query("SELECT COUNT(*) n, MIN(dataEmissao) a, MAX(dataEmissao) b FROM faturamento WHERE tipoFaturamento='SAIDA' AND UPPER(TRIM(codMaterial))=?", [sku]);
    const [f2] = await c.query("SELECT COUNT(*) n FROM faturamento f JOIN de_para_codigos d ON UPPER(TRIM(f.codMaterial))=UPPER(TRIM(d.sku_antigo)) WHERE f.tipoFaturamento='SAIDA' AND UPPER(TRIM(d.sku_novo))=?", [sku]);
    console.log(sku, 'prod', JSON.stringify(p[0]||null), 'fatDirect', JSON.stringify(f[0]), 'fatViaDePara', JSON.stringify(f2[0]));
  }
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
print(stderr.read().decode("utf-8", "replace")[-1500:])
c.close()
