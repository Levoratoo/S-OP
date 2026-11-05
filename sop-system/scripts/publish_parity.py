"""Empacota o deploy e sobe quando a senha/chave SSH estiver disponivel.

Uso:
  $env:SNOP_SSH_PASS = 'sua-senha'
  python scripts/publish_parity.py

Ou com chave:
  $env:SNOP_SSH_KEY = \"$env:USERPROFILE\\.ssh\\snop_192_168_1_82\"
  python scripts/publish_parity.py
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    if not (
        os.environ.get("SNOP_SSH_PASS")
        or os.environ.get("SNOP_DOCKER_PASS")
        or os.environ.get("SNOP_SSH_KEY")
    ):
        print(
            "Defina SNOP_SSH_PASS (ou SNOP_DOCKER_PASS / SNOP_SSH_KEY) e rode de novo.\n"
            "Exemplo PowerShell:\n"
            "  $env:SNOP_SSH_PASS = '***'\n"
            "  python scripts/publish_parity.py"
        )
        return 2

    cmd = [sys.executable, str(ROOT / "docker" / "deploy_to_server.py")]
    print("Publicando paridade Word em 192.168.1.82:3042 ...", flush=True)
    return subprocess.call(cmd, cwd=str(ROOT))


if __name__ == "__main__":
    raise SystemExit(main())
