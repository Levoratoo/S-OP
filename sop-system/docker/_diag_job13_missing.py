import os
import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(
    "192.168.1.82",
    username="pedro-levorato",
    password=os.environ["SNOP_SSH_PASS"],
    timeout=20,
    allow_agent=True,
    look_for_keys=True,
)
cmds = [
    'docker ps --format "{{.Names}} {{.Status}}"',
    "docker exec snop-db mariadb -usnop -p'SnopApp!3042' sop_system -e \"SELECT id,status,LEFT(outputFileName,80) AS outf FROM previsao_python_jobs ORDER BY id DESC LIMIT 10;\"",
    "docker exec snop-app ls -la /app/.previsao-python-jobs | head -n 30",
    "docker logs snop-app --tail 40",
]
for cmd in cmds:
    print("===", cmd[:120])
    _stdin, stdout, stderr = c.exec_command(cmd, timeout=50)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    print(out[:2500])
    if err.strip():
        print("ERR", err[:800])
c.close()
