import os
import paramiko

HOST = os.environ.get("SNOP_SSH_HOST", "192.168.1.82")
USER = os.environ.get("SNOP_SSH_USER", "pedro-levorato")
PASSWORD = os.environ.get("SNOP_SSH_PASS") or os.environ.get("SNOP_DOCKER_PASS")

NODE = r"""
import('mysql2/promise').then(async m => {
  const c = await m.createConnection(process.env.DATABASE_URL);

  const [dup] = await c.query(`
    SELECT nfNumero, codMaterial, dataEmissao, qtd, COUNT(*) n
    FROM faturamento
    WHERE tipoFaturamento='SAIDA' AND dataEmissao BETWEEN '2020-01-01' AND '2026-04-30'
    GROUP BY nfNumero, codMaterial, dataEmissao, qtd
    HAVING COUNT(*) > 1
    ORDER BY n DESC LIMIT 10
  `);
  console.log('exact dups sample', dup);

  const [stats] = await c.query(`
    SELECT COUNT(*) rows, COUNT(DISTINCT CONCAT(nfNumero,'|',codMaterial,'|',dataEmissao,'|',qtd)) distinctKeys,
           SUM(qtd) sumQtd
    FROM faturamento
    WHERE tipoFaturamento='SAIDA' AND dataEmissao BETWEEN '2020-01-01' AND '2026-04-30'
  `);
  console.log('fat stats', stats[0]);

  // Adidas automatica projetar totals
  const [ad] = await c.query(`
    SELECT SUM(f.qtd) q, COUNT(*) n
    FROM faturamento f
    JOIN produtos p ON UPPER(TRIM(p.codItem))=UPPER(TRIM(f.codMaterial))
    WHERE p.marca='Adidas' AND p.linha='Automática' AND p.projetarEstatistica=1
      AND f.tipoFaturamento='SAIDA' AND f.dataEmissao BETWEEN '2020-01-01' AND '2026-04-30'
  `);
  console.log('adidas direct', ad[0]);

  // with de-para resolution approximation: any fat whose material or depara target is adidas auto projetar
  const [ad2] = await c.query(`
    SELECT SUM(f.qtd) q, COUNT(*) n
    FROM faturamento f
    LEFT JOIN de_para_codigos d ON UPPER(TRIM(d.sku_antigo))=UPPER(TRIM(f.codMaterial))
    JOIN produtos p ON UPPER(TRIM(p.codItem))=UPPER(TRIM(IFNULL(d.sku_novo, f.codMaterial)))
    WHERE p.marca='Adidas' AND p.linha='Automática' AND p.projetarEstatistica=1
      AND f.tipoFaturamento='SAIDA' AND f.dataEmissao BETWEEN '2020-01-01' AND '2026-04-30'
  `);
  console.log('adidas via depara', ad2[0]);

  const [cfop] = await c.query(`
    SELECT descCfop, cfop, SUM(qtd) q, COUNT(*) n
    FROM faturamento
    WHERE tipoFaturamento='SAIDA' AND dataEmissao BETWEEN '2020-01-01' AND '2026-04-30'
    GROUP BY descCfop, cfop ORDER BY q DESC LIMIT 15
  `);
  console.log('top cfop', cfop);

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
print(stderr.read().decode("utf-8", "replace")[-1000:])
c.close()
