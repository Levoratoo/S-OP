import os
import paramiko

PASS = os.environ.get("SNOP_SSH_PASS") or "!!qUnP9K"
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("192.168.1.82", username="pedro-levorato", password=PASS, timeout=30)
_, stdout, _ = ssh.exec_command(
    "docker logs snop-app 2>&1 | grep -E '0009|migrate' | tail -30",
    timeout=40,
)
print(stdout.read().decode())
ssh.close()
