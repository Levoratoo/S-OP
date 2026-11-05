import os
import paramiko

HOST = os.environ.get("SNOP_SSH_HOST", "192.168.1.82")
USER = os.environ.get("SNOP_SSH_USER", "pedro-levorato")
PASSWORD = os.environ.get("SNOP_SSH_PASS") or os.environ.get("SNOP_DOCKER_PASS")

NODE = r"""
import('mysql2/promise').then(async m => {
  const c = await m.createConnection(process.env.DATABASE_URL);

  const sql = `
    SELECT
      COUNT(*) AS totalRows,
      COUNT(DISTINCT CONCAT_WS('|', IFNULL(nfNumero,''), DATE(dataEmissao), IFNULL(codMaterial,''), IFNULL(codCliente,''), qtd)) AS k1,
      COUNT(DISTINCT CONCAT_WS('|', IFNULL(nfNumero,''), DATE(dataEmissao), IFNULL(codMaterial,''), IFNULL(codCliente,''), qtd, valorTotal)) AS k2,
      COUNT(DISTINCT CONCAT_WS('|', IFNULL(nfNumero,''), DATE(dataEmissao), IFNULL(codMaterial,''), IFNULL(codCliente,''))) AS k3,
      SUM(qtd) AS sumAll
    FROM faturamento f
    JOIN produtos p ON UPPER(TRIM(p.codItem))=UPPER(TRIM(f.codMaterial))
    WHERE p.marca='Adidas' AND p.linha='Automática' AND p.projetarEstatistica=1
      AND f.tipoFaturamento='SAIDA' AND f.dataEmissao BETWEEN '2020-01-01' AND '2026-04-30'
  `;
  const [r] = await c.query(sql);
  console.log('adidas keys', r[0]);

  // sum with de-para
  const [r2] = await c.query(`
    SELECT SUM(f.qtd) sumQ, COUNT(*) n
    FROM faturamento f
    LEFT JOIN de_para_codigos d ON UPPER(TRIM(d.sku_antigo))=UPPER(TRIM(f.codMaterial))
    JOIN produtos p ON UPPER(TRIM(p.codItem))=UPPER(TRIM(COALESCE(d.sku_novo, f.codMaterial)))
    WHERE p.marca='Adidas' AND p.linha='Automática' AND p.projetarEstatistica=1
      AND f.tipoFaturamento='SAIDA' AND f.dataEmissao BETWEEN '2020-01-01' AND '2026-04-30'
  `);
  console.log('adidas depara', r2[0]);

  // how many fat rows have null nfNumero for adidas
  const [r3] = await c.query(`
    SELECT SUM(nfNumero IS NULL OR nfNumero='') nullNf, COUNT(*) n
    FROM faturamento f
    JOIN produtos p ON UPPER(TRIM(p.codItem))=UPPER(TRIM(f.codMaterial))
    WHERE p.marca='Adidas' AND p.linha='Automática' AND p.projetarEstatistica=1
      AND f.tipoFaturamento='SAIDA' AND f.dataEmissao BETWEEN '2020-01-01' AND '2026-04-30'
  `);
  console.log('null nf', r3[0]);

  // sample two rows same nf material date cliente
  const [r4] = await c.query(`
    SELECT nfNumero, DATE(dataEmissao) d, codMaterial, codCliente, qtd, valorTotal, cfop, COUNT(*) n
    FROM faturamento f
    JOIN produtos p ON UPPER(TRIM(p.codItem))=UPPER(TRIM(f.codMaterial))
    WHERE p.marca='Adidas' AND p.linha='Automática' AND p.projetarEstatistica=1
      AND f.tipoFaturamento='SAIDA' AND f.dataEmissao BETWEEN '2020-01-01' AND '2026-04-30'
    GROUP BY nfNumero, DATE(dataEmissao), codMaterial, codCliente, qtd, valorTotal, cfop
    HAVING COUNT(*)>1
    ORDER BY n DESC LIMIT 5
  `);
  console.log('adidas exact dups', r4);

  const [r5] = await c.query(`
    SELECT nfNumero, DATE(dataEmissao) d, codMaterial, codCliente, qtd, COUNT(*) n, COUNT(DISTINCT valorTotal) nVal, COUNT(DISTINCT cfop) nCfop
    FROM faturamento f
    JOIN produtos p ON UPPER(TRIM(p.codItem))=UPPER(TRIM(f.codMaterial))
    WHERE p.marca='Adidas' AND p.linha='Automática' AND p.projetarEstatistica=1
      AND f.tipoFaturamento='SAIDA' AND f.dataEmissao BETWEEN '2020-01-01' AND '2026-04-30'
    GROUP BY nfNumero, DATE(dataEmissao), codMaterial, codCliente, qtd
    HAVING COUNT(*)>1
    ORDER BY n DESC LIMIT 5
  `);
  console.log('adidas soft dups', r5);

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
