#!/usr/bin/env python3
import os
import paramiko

PASSWORD = os.environ.get("SNOP_SSH_PASS") or os.environ.get("SNOP_DOCKER_PASS")


def main():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect("192.168.1.82", username="pedro-levorato", password=PASSWORD, timeout=25)
    cmd = (
        "docker inspect --format='{{.State.Status}} {{.State.Health.Status}}' snop-app; "
        "docker exec snop-app grep -c resolveSkuCodificacao /app/dist/index.js || true; "
        "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3042/"
    )
    _i, o, e = client.exec_command(cmd, timeout=60)
    print(o.read().decode("utf-8", "replace"))
    err = e.read().decode("utf-8", "replace")
    if err:
        print(err[-500:])
    client.close()


if __name__ == "__main__":
    main()
