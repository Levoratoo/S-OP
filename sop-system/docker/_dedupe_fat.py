"""Dedupe faturamento in prod DB via docker exec + report year totals."""
import os
import paramiko

HOST = os.environ.get("SNOP_SSH_HOST", "192.168.1.82")
USER = os.environ.get("SNOP_SSH_USER", "pedro-levorato")
PASSWORD = os.environ.get("SNOP_SSH_PASS") or os.environ.get("SNOP_DOCKER_PASS")

NODE = r"""
import('mysql2/promise').then(async m => {
  const c = await m.createConnection(process.env.DATABASE_URL);

  const [before] = await c.query(`
    SELECT YEAR(dataEmissao) y, COUNT(*) n, COUNT(DISTINCT CONCAT(
      IFNULL(nfNumero,''),'|',IFNULL(codMaterial,''),'|',DATE(dataEmissao),'|',IFNULL(codCliente,''),'|',IFNULL(cnpj,''),'|',IFNULL(qtd,''),'|',IFNULL(valorTotal,''),'|',IFNULL(cfop,''),'|',IFNULL(tipoFaturamento,'')
    )) d, SUM(qtd) q
    FROM faturamento
    WHERE dataEmissao BETWEEN '2020-01-01' AND '2026-04-30'
    GROUP BY YEAR(dataEmissao) ORDER BY y
  `);
  console.log('BEFORE year', JSON.stringify(before));

  // Delete exact duplicates keeping MIN(id)
  const [del] = await c.query(`
    DELETE f1 FROM faturamento f1
    INNER JOIN faturamento f2
      ON f1.id > f2.id
     AND IFNULL(f1.nfNumero,'') = IFNULL(f2.nfNumero,'')
     AND IFNULL(f1.codMaterial,'') = IFNULL(f2.codMaterial,'')
     AND DATE(f1.dataEmissao) = DATE(f2.dataEmissao)
     AND IFNULL(f1.codCliente,'') = IFNULL(f2.codCliente,'')
     AND IFNULL(f1.cnpj,'') = IFNULL(f2.cnpj,'')
     AND IFNULL(f1.qtd,'') = IFNULL(f2.qtd,'')
     AND IFNULL(f1.valorTotal,'') = IFNULL(f2.valorTotal,'')
     AND IFNULL(f1.cfop,'') = IFNULL(f2.cfop,'')
     AND IFNULL(f1.tipoFaturamento,'') = IFNULL(f2.tipoFaturamento,'')
    WHERE f1.dataEmissao BETWEEN '2020-01-01' AND '2026-04-30'
  `);
  console.log('deleted', del.affectedRows);

  const [after] = await c.query(`
    SELECT YEAR(dataEmissao) y, COUNT(*) n, COUNT(DISTINCT CONCAT(
      IFNULL(nfNumero,''),'|',IFNULL(codMaterial,''),'|',DATE(dataEmissao),'|',IFNULL(codCliente,''),'|',IFNULL(cnpj,''),'|',IFNULL(qtd,''),'|',IFNULL(valorTotal,''),'|',IFNULL(cfop,''),'|',IFNULL(tipoFaturamento,'')
    )) d, SUM(qtd) q
    FROM faturamento
    WHERE dataEmissao BETWEEN '2020-01-01' AND '2026-04-30'
    GROUP BY YEAR(dataEmissao) ORDER BY y
  `);
  console.log('AFTER year', JSON.stringify(after));

  const [tipos] = await c.query(`
    SELECT tipoFaturamento, COUNT(*) n, SUM(qtd) q
    FROM faturamento
    WHERE dataEmissao BETWEEN '2020-01-01' AND '2026-04-30'
    GROUP BY tipoFaturamento
  `);
  console.log('tipos', tipos);

  await c.end();
}).catch(e => { console.error(e); process.exit(1); });
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)
stdin, stdout, stderr = c.exec_command("docker exec -i snop-app node -", timeout=600)
stdin.write(NODE)
stdin.channel.shutdown_write()
print(stdout.read().decode("utf-8", "replace"))
err = stderr.read().decode("utf-8", "replace")
if err.strip():
    print("STDERR", err[-2000:])
c.close()
