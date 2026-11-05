import os
import paramiko

HOST = os.environ.get("SNOP_SSH_HOST", "192.168.1.82")
USER = os.environ.get("SNOP_SSH_USER", "pedro-levorato")
PASSWORD = os.environ.get("SNOP_SSH_PASS") or "!!qUnP9K"

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)


def run(cmd: str) -> str:
    print("$", cmd, flush=True)
    _, stdout, stderr = c.exec_command(cmd, get_pty=True)
    out = stdout.read().decode("utf-8", "replace") + stderr.read().decode("utf-8", "replace")
    try:
        print(out[:8000], flush=True)
    except Exception:
        print(out.encode("ascii", "replace").decode(), flush=True)
    return out


run("docker logs snop-app --tail 80 2>&1")
run(
    "docker exec snop-db mysql -usnop -pSnopApp!3042 sop_system -e "
    "\"SHOW TABLES; SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema='sop_system';\""
)
run(
    "docker exec snop-app sh -c "
    "\"ls -la /app/drizzle | head -40; ls -la /app/docker; cat /app/docker/entrypoint.sh | head -80\""
)
run(
    "docker exec snop-app sh -c "
    "\"node -e \\\"import('mysql2/promise').then(async m=>{const c=await m.createConnection(process.env.DATABASE_URL); const [r]=await c.query('SHOW TABLES'); console.log(r); await c.end();})\\\"\""
)
c.close()
