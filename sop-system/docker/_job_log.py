import os
import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(
    "192.168.1.82",
    username="pedro-levorato",
    password=os.environ.get("SNOP_SSH_PASS") or "!!qUnP9K",
    timeout=20,
)
_, stdout, _ = c.exec_command(
    "docker exec snop-app tail -50 /app/.previsao-python-jobs/job-1/run.log"
)
print(stdout.read().decode("utf-8", "replace"))
c.close()
