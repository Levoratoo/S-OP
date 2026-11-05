import http.cookiejar
import json
import os
import time
import urllib.request

import paramiko

HOST = "192.168.1.82"
PASSWORD = os.environ["SNOP_SSH_PASS"]
BASE = f"http://{HOST}:3042"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username="pedro-levorato", password=PASSWORD, timeout=30)

for i in range(30):
    _, stdout, _ = ssh.exec_command(
        "docker inspect --format='{{.State.Health.Status}}' snop-app", timeout=20
    )
    status = stdout.read().decode().strip()
    print("health", i, status, flush=True)
    if status == "healthy":
        break
    time.sleep(5)

_, stdout, _ = ssh.exec_command(
    "docker exec snop-app sh -c \"printenv | grep ERP_ | sed 's/PASSWORD=.*/PASSWORD=*/'\"",
    timeout=30,
)
print("env:\n" + stdout.read().decode(), flush=True)
ssh.close()

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
opener.open(BASE + "/api/auth/local-login", timeout=30)

req = urllib.request.Request(BASE + "/api/trpc/faturamento.testSqlConnection")
try:
    with opener.open(req, timeout=90) as resp:
        body = resp.read().decode()
        print("testSql", resp.status, body[:800], flush=True)
except Exception as exc:
    data = getattr(exc, "read", lambda: b"")()
    print("testSql ERR", data.decode()[:1000] if data else exc, flush=True)
