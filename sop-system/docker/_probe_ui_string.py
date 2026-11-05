#!/usr/bin/env python3
import os
import paramiko

PASSWORD = os.environ.get("SNOP_SSH_PASS") or os.environ.get("SNOP_DOCKER_PASS")


def main():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect("192.168.1.82", username="pedro-levorato", password=PASSWORD, timeout=25)
    cmd = "docker exec snop-app grep -c 'Abas da planilha' /app/dist/public/assets/*.js || docker exec snop-app grep -l 'Abas da planilha' -r /app/dist | head"
    _i, o, e = client.exec_command(cmd, timeout=40)
    print(o.read().decode("utf-8", "replace")[:2000])
    print(e.read().decode("utf-8", "replace")[-400:])
    client.close()


if __name__ == "__main__":
    main()
