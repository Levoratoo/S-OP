import http.cookiejar
import json
import os
import urllib.parse
import urllib.request

import paramiko

HOST = "192.168.1.82"
PASS = os.environ.get("SNOP_SSH_PASS") or os.environ.get("SNOP_DOCKER_PASS") or "!!qUnP9K"
BASE = f"http://{HOST}:3042"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username="pedro-levorato", password=PASS, timeout=30)
cmd = (
    "docker exec snop-db mysql -usnop -p'SnopApp!3042' sop_system -N -e "
    "\"SHOW COLUMNS FROM ciclo_comercial_itens LIKE 'e1'; "
    "SELECT id FROM __sql_migrations WHERE id='0009_mts_estatistica_meses.sql';\""
)
_, stdout, stderr = ssh.exec_command(cmd, timeout=40)
print("db:", stdout.read().decode(), flush=True)
err = stderr.read().decode()
if err and "Warning" not in err:
    print("stderr:", err[:500], flush=True)
ssh.close()

jar = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
op.open(BASE + "/api/auth/local-login", timeout=30)
q = urllib.parse.quote(json.dumps({"json": {"anos": [2025, 2026]}}))
with op.open(BASE + "/api/trpc/cicloComercial.realizadoAnual?input=" + q, timeout=180) as resp:
    data = json.loads(resp.read().decode())["result"]["data"]["json"]
    keys = list(data.keys())[:2]
    print("skus", len(data), "sample", {k: data[k] for k in keys}, flush=True)
