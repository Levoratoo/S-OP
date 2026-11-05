import os
import time

import paramiko

PASSWORD = os.environ.get("SNOP_SSH_PASS") or os.environ.get("SNOP_DOCKER_PASS") or "!!qUnP9K"


def main() -> None:
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect("192.168.1.82", username="pedro-levorato", password=PASSWORD, timeout=20)

    def run(cmd: str, timeout: int = 180) -> str:
        print("$", cmd, flush=True)
        _stdin, stdout, stderr = c.exec_command(cmd, timeout=timeout)
        out = stdout.read().decode(errors="replace")
        err = stderr.read().decode(errors="replace")
        if out:
            print(out[-3000:], flush=True)
        if err:
            print(err[-1500:], flush=True)
        return out

    run("cd /opt/sites_dev/snop && docker compose ps")
    run("cd /opt/sites_dev/snop && docker compose up -d --build", timeout=600)
    for i in range(36):
        time.sleep(5)
        st = run(
            "docker inspect --format='{{.State.Health.Status}}' snop-app 2>/dev/null || echo starting"
        ).strip()
        print("health", i, st, flush=True)
        if st == "healthy":
            break
        if st == "unhealthy":
            run("cd /opt/sites_dev/snop && docker compose logs --tail=60 app")
            break
    run('docker ps --filter name=snop --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"')
    c.close()


if __name__ == "__main__":
    main()
