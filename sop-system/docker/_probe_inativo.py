import os
import paramiko

HOST = os.environ.get("SNOP_SSH_HOST", "192.168.1.82")
USER = os.environ.get("SNOP_SSH_USER", "pedro-levorato")
PASSWORD = os.environ.get("SNOP_SSH_PASS") or os.environ.get("SNOP_DOCKER_PASS")

NODE = r"""
import('mysql2/promise').then(async m => {
  const c = await m.createConnection(process.env.DATABASE_URL);

  const [pi] = await c.query("SELECT COUNT(*) n FROM produtos WHERE projetarEstatistica=1 AND status='INATIVO'");
  console.log('projetar inativo', pi[0]);

  const [enc] = await c.query(`
    SELECT DISTINCT CONCAT(
      IFNULL(NULLIF(TRIM(p.tipoEstoque),''),'MTS'), '-',
      IFNULL(p.marca,''), '-', IFNULL(p.linha,'')
    ) AS enc
    FROM faturamento f
    JOIN produtos p ON UPPER(TRIM(p.codItem))=UPPER(TRIM(f.codMaterial))
      OR UPPER(TRIM(p.codigo))=UPPER(TRIM(f.codMaterial))
    WHERE p.projetarEstatistica=1
      AND UPPER(IFNULL(p.status,''))='INATIVO'
      AND f.tipoFaturamento='SAIDA'
      AND f.dataEmissao BETWEEN '2020-01-01' AND '2026-04-30'
    ORDER BY enc
  `);
  console.log('inativo encodings count', enc.length);
  for (const r of enc) console.log(' ', r.enc);

  const [usa] = await c.query(`
    SELECT MIN(f.dataEmissao) a, MAX(f.dataEmissao) b, COUNT(*) n
    FROM faturamento f
    JOIN produtos p ON UPPER(TRIM(p.codItem))=UPPER(TRIM(f.codMaterial))
    WHERE p.marca='Usaflex' AND p.linha LIKE '%utom%'
      AND f.tipoFaturamento='SAIDA'
      AND f.dataEmissao < '2026-05-01'
  `);
  console.log('usaflex before may', usa[0]);

  const [usaAll] = await c.query(`
    SELECT MIN(f.dataEmissao) a, MAX(f.dataEmissao) b, COUNT(*) n
    FROM faturamento f
    JOIN produtos p ON UPPER(TRIM(p.codItem))=UPPER(TRIM(f.codMaterial))
    WHERE p.marca='Usaflex' AND p.linha LIKE '%utom%'
      AND f.tipoFaturamento='SAIDA'
  `);
  console.log('usaflex all fat', usaAll[0]);

  const [prev] = await c.query('SELECT COUNT(*) n FROM previsoes');
  console.log('previsoes count', prev[0]);

  const [cic] = await c.query('SELECT id, nome, status, mesInicio, anoInicio FROM ciclos_comerciais ORDER BY id DESC LIMIT 5');
  console.log('ciclos', JSON.stringify(cic));

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
