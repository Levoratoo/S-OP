import os
import paramiko

PASSWORD = os.environ.get("SNOP_SSH_PASS") or "!!qUnP9K"
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("192.168.1.82", username="pedro-levorato", password=PASSWORD, timeout=20)
for cmd in [
    "docker inspect --format='{{.State.Status}} {{.State.Health.Status}} restarts={{.RestartCount}}' snop-app",
    "cd /opt/sites_dev/snop && docker compose logs --tail=120 app",
    "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3042/ || true",
]:
    print("$", cmd, flush=True)
    _i, o, e = c.exec_command(cmd, timeout=60)
    print(o.read().decode(errors="replace")[-5000], flush=True)
    err = e.read().decode(errors="replace")
    if err:
        print(err[-1000], flush=True)
c.close()
