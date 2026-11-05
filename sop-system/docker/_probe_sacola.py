import os
import paramiko

HOST = os.environ.get("SNOP_SSH_HOST", "192.168.1.82")
USER = os.environ.get("SNOP_SSH_USER", "pedro-levorato")
PASSWORD = os.environ.get("SNOP_SSH_PASS") or os.environ.get("SNOP_DOCKER_PASS")

NODE = r"""
import('mysql2/promise').then(async m => {
  const c = await m.createConnection(process.env.DATABASE_URL);
  const [bad] = await c.query(`
    SELECT codItem,marca,linha,tipoEstoque,status,projetarEstatistica
    FROM produtos
    WHERE projetarEstatistica=1 AND (
      linha LIKE '%SACOLA%' OR linha LIKE '%CAIXA%' OR linha LIKE '%PRESENTE%'
      OR marca IN ('Milon','Luz Da Lua','Toli','Usaflex')
    )
    ORDER BY marca,linha,codItem
    LIMIT 80
  `);
  for (const r of bad) console.log(JSON.stringify(r));

  const [dp] = await c.query(`SELECT sku_antigo,sku_novo FROM de_para_codigos WHERE sku_antigo IN ('80.01.000971','80.01.000232') OR sku_novo IN ('80.01.001038','80.01.000971') LIMIT 20`);
  console.log('depara', dp);

  const [p1038] = await c.query(`SELECT * FROM produtos WHERE codItem IN ('80.01.001038','80.01.000971')`);
  console.log('luz', p1038.map(p => ({cod:p.codItem,linha:p.linha,status:p.status,proj:p.projetarEstatistica})));

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
print(stderr.read().decode("utf-8", "replace")[-800:])
c.close()
