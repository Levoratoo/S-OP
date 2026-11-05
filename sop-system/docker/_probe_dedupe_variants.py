"""Compare billing dedupe keys by year for a representative product group."""
from __future__ import annotations

import os

import paramiko

HOST = os.environ.get("SNOP_SSH_HOST", "192.168.1.82")
USER = os.environ.get("SNOP_SSH_USER", "pedro-levorato")
PASSWORD = os.environ.get("SNOP_SSH_PASS") or os.environ.get("SNOP_DOCKER_PASS")

NODE = r"""
import('mysql2/promise').then(async m => {
  const c = await m.createConnection(process.env.DATABASE_URL);
  const common = `
    FROM faturamento f
    JOIN produtos p ON UPPER(TRIM(p.codItem))=UPPER(TRIM(f.codMaterial))
    WHERE p.marca='Adidas' AND p.linha='Automática' AND p.projetarEstatistica=1
      AND f.dataEmissao BETWEEN '2020-01-01' AND '2026-04-30'
  `;

  const queries = {
    raw: `SELECT YEAR(f.dataEmissao) y, COUNT(*) n,
      SUM(CASE WHEN f.tipoFaturamento='DEVOLUCAO' AND f.qtd>0 THEN -f.qtd ELSE f.qtd END) q
      ${common} GROUP BY YEAR(f.dataEmissao) ORDER BY y`,
    nf_sku_cliente_qtd_cfop: `SELECT y, COUNT(*) n, SUM(qtd) q FROM (
      SELECT YEAR(f.dataEmissao) y,
        CASE WHEN f.tipoFaturamento='DEVOLUCAO' AND f.qtd>0 THEN -f.qtd ELSE f.qtd END qtd
      ${common}
      GROUP BY YEAR(f.dataEmissao), DATE(f.dataEmissao), IFNULL(f.nfNumero,''),
        IFNULL(f.codMaterial,''), IFNULL(f.codCliente,''), f.qtd, IFNULL(f.cfop,''),
        IFNULL(f.tipoFaturamento,'')
    ) x GROUP BY y ORDER BY y`,
    nf_sku_cliente_qtd: `SELECT y, COUNT(*) n, SUM(qtd) q FROM (
      SELECT YEAR(f.dataEmissao) y,
        CASE WHEN f.tipoFaturamento='DEVOLUCAO' AND f.qtd>0 THEN -f.qtd ELSE f.qtd END qtd
      ${common}
      GROUP BY YEAR(f.dataEmissao), DATE(f.dataEmissao), IFNULL(f.nfNumero,''),
        IFNULL(f.codMaterial,''), IFNULL(f.codCliente,''), f.qtd,
        IFNULL(f.tipoFaturamento,'')
    ) x GROUP BY y ORDER BY y`,
    nf_sku: `SELECT y, COUNT(*) n, SUM(qtd) q FROM (
      SELECT YEAR(f.dataEmissao) y,
        CASE WHEN f.tipoFaturamento='DEVOLUCAO' AND f.qtd>0 THEN -f.qtd ELSE f.qtd END qtd
      ${common}
      GROUP BY YEAR(f.dataEmissao), DATE(f.dataEmissao), IFNULL(f.nfNumero,''),
        IFNULL(f.codMaterial,''), IFNULL(f.tipoFaturamento,'')
    ) x GROUP BY y ORDER BY y`
  };
  for (const [name, sql] of Object.entries(queries)) {
    const [rows] = await c.query(sql);
    console.log(name, JSON.stringify(rows));
  }
  const [cfops] = await c.query(`SELECT YEAR(f.dataEmissao) y, IFNULL(f.cfop,'') cfop,
    IFNULL(f.descCfop,'') descricao, COUNT(*) n,
    SUM(CASE WHEN f.tipoFaturamento='DEVOLUCAO' AND f.qtd>0 THEN -f.qtd ELSE f.qtd END) q
    ${common}
    GROUP BY YEAR(f.dataEmissao), IFNULL(f.cfop,''), IFNULL(f.descCfop,'')
    ORDER BY y, ABS(SUM(CASE WHEN f.tipoFaturamento='DEVOLUCAO' AND f.qtd>0 THEN -f.qtd ELSE f.qtd END)) DESC`);
  console.log('cfops', JSON.stringify(cfops));
  const [cfopsDePara] = await c.query(`
    SELECT YEAR(f.dataEmissao) y, IFNULL(f.cfop,'') cfop,
      IFNULL(f.descCfop,'') descricao, COUNT(*) n, SUM(f.qtd) q
    FROM faturamento f
    LEFT JOIN (
      SELECT UPPER(TRIM(sku_antigo)) sku_antigo, MAX(sku_novo) sku_novo
      FROM de_para_codigos GROUP BY UPPER(TRIM(sku_antigo))
    ) d ON d.sku_antigo=UPPER(TRIM(f.codMaterial))
    JOIN produtos p ON UPPER(TRIM(p.codItem))=
      UPPER(TRIM(COALESCE(d.sku_novo, f.codMaterial)))
    WHERE p.marca='Adidas' AND p.linha='Automática' AND p.projetarEstatistica=1
      AND f.dataEmissao BETWEEN '2020-01-01' AND '2026-04-30'
    GROUP BY YEAR(f.dataEmissao), IFNULL(f.cfop,''), IFNULL(f.descCfop,'')
    ORDER BY y, ABS(SUM(f.qtd)) DESC`);
  console.log('cfops_depara', JSON.stringify(cfopsDePara));
  await c.end();
}).catch(e => { console.error(e); process.exit(1); });
"""


def main() -> None:
    if not PASSWORD:
        raise SystemExit("Defina SNOP_SSH_PASS")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASSWORD, timeout=30)
    stdin, stdout, stderr = ssh.exec_command("docker exec -i snop-app node -", timeout=600)
    stdin.write(NODE)
    stdin.channel.shutdown_write()
    print(stdout.read().decode("utf-8", "replace"))
    error = stderr.read().decode("utf-8", "replace")
    if error.strip():
        print(error[-4000:])
    ssh.close()


if __name__ == "__main__":
    main()
