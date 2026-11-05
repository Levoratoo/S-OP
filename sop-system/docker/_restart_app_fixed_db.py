#!/usr/bin/env python3
from __future__ import annotations

import os
import sys
import time

import paramiko

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

PASSWORD = os.environ.get("SNOP_SSH_PASS") or os.environ.get("SNOP_DOCKER_PASS")


def run(client, cmd, timeout=120):
    print("==", cmd[:200], flush=True)
    _i, o, e = client.exec_command(cmd, timeout=timeout)
    out = o.read().decode("utf-8", "replace")
    err = e.read().decode("utf-8", "replace")
    print(out[:5000], flush=True)
    if err and "Using a password on the command line" not in err:
        print("[e]", err[:1500], flush=True)
    return out


def main():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect("192.168.1.82", username="pedro-levorato", password=PASSWORD, timeout=25)

    # Patch remote .env MYSQL_ROOT to match existing volume.
    patch = r"""
from pathlib import Path
p = Path('/opt/sites_dev/snop/.env')
lines = []
for line in p.read_text(encoding='utf-8').splitlines():
    if line.startswith('MYSQL_ROOT_PASSWORD='):
        lines.append('MYSQL_ROOT_PASSWORD=snop_root_change_me')
    elif line.startswith('MYSQL_PASSWORD='):
        lines.append('MYSQL_PASSWORD=SnopApp!3042')
    else:
        lines.append(line)
p.write_text('\n'.join(lines) + '\n', encoding='utf-8')
print('env patched')
"""
    remote_patch = "/tmp/patch_snop_env.py"
    sftp = client.open_sftp()
    with sftp.file(remote_patch, "w") as f:
        f.write(patch)
    sftp.close()
    run(client, f"python3 {remote_patch}")

    # Ensure snop password again
    run(
        client,
        "docker exec snop-db mariadb -uroot -p'snop_root_change_me' -e "
        "\"ALTER USER 'snop'@'%' IDENTIFIED BY 'SnopApp!3042'; FLUSH PRIVILEGES;\"",
    )

    run(client, "cd /opt/sites_dev/snop && docker compose up -d --force-recreate app")
    for i in range(36):
        out = run(
            client,
            "docker inspect --format='{{.State.Health.Status}}' snop-app 2>/dev/null || echo starting",
        )
        st = out.strip().splitlines()[-1] if out.strip() else "starting"
        print(f"health[{i}]={st}", flush=True)
        if st == "healthy":
            break
        if st == "unhealthy":
            run(client, "docker logs snop-app --tail 50 2>&1")
            break
        time.sleep(5)

    run(client, "curl -s -o /dev/null -w '%{http_code}\\n' http://127.0.0.1:3042/")
    run(
        client,
        "docker exec snop-db mariadb -usnop -p'SnopApp!3042' sop_system -e "
        "\"SELECT COUNT(*) fat FROM faturamento; SELECT COUNT(*) prev FROM previsoes;\"",
    )
    client.close()


if __name__ == "__main__":
    main()
