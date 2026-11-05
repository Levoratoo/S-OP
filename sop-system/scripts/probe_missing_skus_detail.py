import os
import paramiko

PASSWORD = os.environ.get("SNOP_SSH_PASS") or "!!qUnP9K"
SQL = r"""
SELECT p.codItem, p.codigo, p.marca, p.linha, p.tipoEstoque, p.projetarEstatistica, p.status
FROM produtos p
WHERE (
  (p.marca='Milon' AND p.linha IN ('Classic','Elegance','Evolution') AND p.tipoEstoque IN ('MTO','MTS'))
  OR (p.marca='Toli' AND p.linha='Evolution' AND p.tipoEstoque='MTO')
  OR (p.marca='Luz Da Lua' AND p.linha IN ('Classic','Elegance') AND p.tipoEstoque='MTS')
)
ORDER BY p.tipoEstoque, p.marca, p.linha, p.codItem
LIMIT 80;
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("192.168.1.82", username="pedro-levorato", password=PASSWORD, timeout=20)
cmd = (
    "docker exec -i snop-db mariadb -usnop -p'SnopApp!3042' sop_system <<'EOSQL'\n"
    + SQL
    + "\nEOSQL"
)
_i, o, e = c.exec_command(cmd, timeout=60)
print(o.read().decode(errors="replace"))
print(e.read().decode(errors="replace")[-500])
c.close()
