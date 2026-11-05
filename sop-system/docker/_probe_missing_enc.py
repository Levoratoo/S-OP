import os
import paramiko

HOST = os.environ.get("SNOP_SSH_HOST", "192.168.1.82")
USER = os.environ.get("SNOP_SSH_USER", "pedro-levorato")
PASSWORD = os.environ.get("SNOP_SSH_PASS") or os.environ.get("SNOP_DOCKER_PASS")

NODE = r"""
import('mysql2/promise').then(async m => {
  const c = await m.createConnection(process.env.DATABASE_URL);
  const missing = [
    'MTO-Usaflex-Automática','MTS-Usaflex-Automática',
    'MTS-Capodarte-Automática','MTS-Capodarte-Classic','MTS-Capodarte-Evolution','MTS-Capodarte-Elegance',
    'MTS-Luz Da Lua-Classic','MTS-Mormaii-Evolution','MTS-Petite Jolie-Evolution',
    'MTO-Aramis-Classic','MTS-Aramis-Classic'
  ];
  for (const enc of missing) {
    const [tipo, ...rest] = enc.split('-');
    const marca = rest.slice(0,-1).join('-');
    const linha = rest[rest.length-1];
    const [prods] = await c.query(
      `SELECT codItem,status,projetarEstatistica,tipoEstoque,marca,linha FROM produtos
       WHERE marca=? AND linha=? AND (tipoEstoque=? OR ?='MTS') LIMIT 8`,
      [marca, linha, tipo, tipo]
    );
    const [fat] = await c.query(
      `SELECT COUNT(*) n, MIN(f.dataEmissao) a, MAX(f.dataEmissao) b
       FROM faturamento f
       JOIN produtos p ON UPPER(TRIM(p.codItem))=UPPER(TRIM(f.codMaterial))
       WHERE p.marca=? AND p.linha=? AND f.tipoFaturamento='SAIDA'
         AND f.dataEmissao BETWEEN '2020-01-01' AND '2026-04-30'
         AND p.projetarEstatistica=1`,
      [marca, linha]
    );
    console.log(enc, 'prods', prods.length, JSON.stringify(prods.slice(0,3)), 'fatProjetar', fat[0]);
  }
  // Capodarte any
  const [cap] = await c.query(`SELECT DISTINCT tipoEstoque,marca,linha,status,projetarEstatistica,COUNT(*) n FROM produtos WHERE marca LIKE '%Capodarte%' GROUP BY 1,2,3,4,5`);
  console.log('capodarte groups', cap);
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
    print("ERR", err[-2000:])
c.close()
