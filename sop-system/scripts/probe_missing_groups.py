import os
import paramiko

PASSWORD = os.environ.get("SNOP_SSH_PASS") or "!!qUnP9K"
SQL = r"""
SELECT tipoEstoque, marca, linha, COUNT(*) n,
       SUM(CASE WHEN projetarEstatistica=1 THEN 1 ELSE 0 END) projetar
FROM produtos
WHERE marca IN ('Milon','Toli','Luz Da Lua')
GROUP BY tipoEstoque, marca, linha
ORDER BY 1,2,3;
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("192.168.1.82", username="pedro-levorato", password=PASSWORD, timeout=20)
cmd = (
    "docker exec -i snop-db mariadb -usnop -p'SnopApp!3042' sop_system "
    "<<'EOSQL'\n" + SQL + "\nEOSQL"
)
_i, o, e = c.exec_command(cmd, timeout=60)
print(o.read().decode(errors="replace"))
err = e.read().decode(errors="replace")
if err:
    print(err[-1000])
c.close()
