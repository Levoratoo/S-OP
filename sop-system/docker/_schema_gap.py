import os
import paramiko

HOST = "192.168.1.82"
USER = "pedro-levorato"
PASSWORD = os.environ.get("SNOP_SSH_PASS") or "!!qUnP9K"

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)

cmd = r"""docker exec snop-app node --input-type=module -e '
import mysql from "mysql2/promise";
const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [tables] = await conn.query("SHOW TABLES");
const names = tables.map(t => Object.values(t)[0]);
console.log("TABLES", names.join(","));
for (const t of ["users","produtos","recursos","dias_uteis","__sql_migrations"]) {
  if (!names.includes(t)) { console.log("MISSING", t); continue; }
  const [cols] = await conn.query("SHOW COLUMNS FROM `" + t + "`");
  console.log("\\n==", t, "==");
  for (const col of cols) console.log(col.Field, col.Type, col.Null, col.Default);
}
const [migs] = await conn.query("SELECT * FROM __sql_migrations ORDER BY id");
console.log("\\nMIGRATIONS", JSON.stringify(migs));
await conn.end();
'"""
_, stdout, stderr = c.exec_command(cmd, get_pty=True)
print(stdout.read().decode("utf-8", "replace"))
print(stderr.read().decode("utf-8", "replace"))
c.close()
