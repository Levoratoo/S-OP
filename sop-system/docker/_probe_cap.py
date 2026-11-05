import os
import paramiko

HOST = os.environ.get("SNOP_SSH_HOST", "192.168.1.82")
USER = os.environ.get("SNOP_SSH_USER", "pedro-levorato")
PASSWORD = os.environ.get("SNOP_SSH_PASS") or os.environ.get("SNOP_DOCKER_PASS")

NODE = r"""
import('mysql2/promise').then(async m => {
  const c = await m.createConnection(process.env.DATABASE_URL);
  const skus = ['80.01.000962','80.02.000867','80.04.000053','80.01.001038','80.01.000971','80.03.001967','80.02.000915','80.03.002293','80.06.001607'];
  for (const sku of skus) {
    const [p] = await c.query('SELECT codItem,marca,linha,tipoEstoque,status,projetarEstatistica FROM produtos WHERE UPPER(codItem)=?', [sku]);
    const [f] = await c.query("SELECT COUNT(*) n, MIN(dataEmissao) a, MAX(dataEmissao) b FROM faturamento WHERE tipoFaturamento='SAIDA' AND UPPER(TRIM(codMaterial))=? AND dataEmissao BETWEEN '2020-01-01' AND '2026-04-30'", [sku]);
    console.log(sku, JSON.stringify(p[0]||null), 'fat', JSON.stringify(f[0]));
  }
  const [enc] = await c.query(`
    SELECT CONCAT(IFNULL(NULLIF(TRIM(p.tipoEstoque),''),'MTS'),'-',IFNULL(p.marca,''),'-',IFNULL(p.linha,'')) enc,
           SUM(f.qtd) q, COUNT(*) n
    FROM faturamento f
    JOIN produtos p ON UPPER(TRIM(p.codItem))=UPPER(TRIM(f.codMaterial))
    WHERE p.projetarEstatistica=1 AND p.marca IN ('Capodarte','Luz Da Lua','Mormaii','Petite Jolie')
      AND f.tipoFaturamento='SAIDA' AND f.dataEmissao BETWEEN '2020-01-01' AND '2026-04-30'
    GROUP BY enc ORDER BY enc`);
  console.log('encodings from fat:');
  for (const r of enc) console.log(r.enc, r.n, r.q);
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
err = stderr.read().decode("utf-8", "replace")
if err.strip():
    print("ERR", err[-1500:])
c.close()
