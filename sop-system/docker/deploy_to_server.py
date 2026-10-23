"""
Empacota sop-system + script Python e sobe em /opt/sites_dev/snop no Docker host.
Uso (na pasta sop-system):
  set SNOP_SSH_PASS=...
  python docker/deploy_to_server.py

Se SNOP_SSH_PASS não estiver definido, usa SSH agent/chaves locais.
"""
from __future__ import annotations

import os
import posixpath
import sys
import tarfile
import tempfile
import time
from pathlib import Path

import paramiko

HOST = os.environ.get("SNOP_SSH_HOST", "192.168.1.82")
USER = os.environ.get("SNOP_SSH_USER", "pedro-levorato")
PASSWORD = os.environ.get("SNOP_SSH_PASS") or os.environ.get("SNOP_DOCKER_PASS")
REMOTE_DIR = os.environ.get("SNOP_REMOTE_DIR", "/opt/sites_dev/snop")
APP_PORT = os.environ.get("SNOP_APP_PORT", "3042")

ROOT = Path(__file__).resolve().parents[1]  # sop-system
REPO = ROOT.parent
# Preferir o script canônico do sop-system; fallback para pasta histórica do repo.
SCRIPT_SRC_CANDIDATES = [
    ROOT / "scripts-previsao",
    REPO / "3. Script Python Previsão Demanda",
]
SCRIPT_SRC = next((p for p in SCRIPT_SRC_CANDIDATES if (p / "previsao_demanda_final_v5_2_COMPLETO.py").exists()), SCRIPT_SRC_CANDIDATES[0])
SCRIPT_NAME = "previsao_demanda_final_v5_2_COMPLETO.py"
HELPER_NAME = "previsao_meses.py"

EXCLUDE_DIRS = {
    "node_modules",
    ".venv-previsao",
    ".previsao-python-jobs",
    "dist",
    ".git",
    "coverage",
    "__pycache__",
    ".cursor",
    "canvases",
}
EXCLUDE_SUFFIXES = {".log", ".zip", ".bak", ".pyc"}
EXCLUDE_FILES = {".env", ".env.local", ".env.development", ".env.production"}


def should_exclude(path: Path) -> bool:
    parts = set(path.parts)
    if parts & EXCLUDE_DIRS:
        return True
    if path.name in EXCLUDE_FILES:
        return True
    if path.suffix.lower() in EXCLUDE_SUFFIXES:
        return True
    if path.name.startswith("OneDrive"):
        return True
    if path.name.startswith("_probe") or path.name.startswith("_fetch"):
        return True
    return False


def make_tarball(dest: Path) -> None:
    import os

    script_dst_name = "3. Script Python Previsão Demanda"
    count = 0
    with tarfile.open(dest, "w:gz") as tar:
        for dirpath, dirnames, filenames in os.walk(ROOT):
            # Não entrar em pastas pesadas
            dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS and not d.startswith(".")]
            # Mantém .env.example / docker; remove só dirs de cache
            rel_dir = Path(dirpath).relative_to(ROOT)
            if any(p in EXCLUDE_DIRS for p in rel_dir.parts):
                dirnames[:] = []
                continue
            for name in filenames:
                path = Path(dirpath) / name
                rel = path.relative_to(ROOT)
                if should_exclude(rel):
                    continue
                tar.add(path, arcname=rel.as_posix())
                count += 1
                if count % 200 == 0:
                    print(f"  packed {count} files...", flush=True)

        script_file = SCRIPT_SRC / SCRIPT_NAME
        if not script_file.exists():
            raise FileNotFoundError(f"Script Python não encontrado: {script_file}")
        helper_file = SCRIPT_SRC / HELPER_NAME
        # Pasta ASCII no contexto Docker (evita problema de encoding no Linux)
        tar.add(script_file, arcname=f"scripts-previsao/{SCRIPT_NAME}")
        # Mantém também o path esperado em runtime pelo backend
        tar.add(script_file, arcname=f"{script_dst_name}/{SCRIPT_NAME}")
        count += 2
        if helper_file.exists():
            tar.add(helper_file, arcname=f"scripts-previsao/{HELPER_NAME}")
            tar.add(helper_file, arcname=f"{script_dst_name}/{HELPER_NAME}")
            count += 2
            print(f"  packed {HELPER_NAME} helper from {SCRIPT_SRC}", flush=True)
        else:
            print(f"  WARN: helper {HELPER_NAME} nao encontrado: {helper_file}", flush=True)

        # Cadastros mestres (CSVs) — pasta ASCII no container
        dados_src = REPO / "dados sistema"
        if dados_src.is_dir():
            for path in dados_src.rglob("*"):
                if not path.is_file():
                    continue
                if path.suffix.lower() not in {".csv", ".txt", ".md"}:
                    continue
                rel = path.relative_to(dados_src).as_posix()
                tar.add(path, arcname=f"dados-sistema/{rel}")
                count += 1
            print(f"  packed dados-sistema from {dados_src}", flush=True)
        else:
            print(f"  WARN: pasta dados sistema nao encontrada: {dados_src}", flush=True)

        # Baseline homologado das bases estatísticas. O runtime usa estes arquivos
        # para preservar 100% do histórico e acrescenta meses novos vindos do ERP.
        baseline_dir = (
            REPO
            / "OneDrive_2026-07-30"
            / "1-Módulo Previsão Demanda"
            / "1.1 arquivos"
        )
        for name in ("1-BasedeDadosVendas.xlsx", "1-BasedeDadosClientes.xlsx"):
            baseline = baseline_dir / name
            if not baseline.is_file():
                raise FileNotFoundError(f"Baseline homologado não encontrado: {baseline}")
            tar.add(baseline, arcname=f"dados-sistema/{name}")
            count += 1

        print(f"  packed {count} files total (incl. script Python + seed)", flush=True)


def ssh_connect() -> paramiko.SSHClient:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    key_filename = os.environ.get("SNOP_SSH_KEY")
    connect_options: dict[str, object] = {
        "hostname": HOST,
        "username": USER,
        "timeout": 30,
        "allow_agent": True,
        "look_for_keys": True,
    }
    if PASSWORD:
        connect_options["password"] = PASSWORD
    if key_filename:
        connect_options["key_filename"] = key_filename
    try:
        client.connect(**connect_options)
    except (paramiko.AuthenticationException, paramiko.SSHException) as error:
        raise SystemExit(
            "Falha de autenticação SSH. Defina SNOP_SSH_PASS, SNOP_DOCKER_PASS "
            "ou SNOP_SSH_KEY com uma chave autorizada."
        ) from error
    return client


def _safe_print(text: str) -> None:
    try:
        print(text)
    except UnicodeEncodeError:
        enc = getattr(sys.stdout, "encoding", None) or "utf-8"
        print(text.encode(enc, errors="replace").decode(enc, errors="replace"))


def run(client: paramiko.SSHClient, cmd: str, check: bool = True) -> str:
    _safe_print(f"$ {cmd}")
    stdin, stdout, stderr = client.exec_command(cmd, get_pty=True)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    text = (out + err).strip()
    if text:
        _safe_print(text)
    if check and code != 0:
        raise RuntimeError(f"Command failed ({code}): {cmd}\n{text}")
    return text


def sftp_put(client: paramiko.SSHClient, local: Path, remote: str) -> None:
    sftp = client.open_sftp()
    try:
        print(f"Upload {local} -> {remote}")
        sftp.put(str(local), remote)
    finally:
        sftp.close()


def main() -> None:
    # stdout sem buffer (útil no Windows/PowerShell)
    try:
        sys.stdout.reconfigure(line_buffering=True)  # type: ignore[attr-defined]
    except Exception:
        pass

    with tempfile.TemporaryDirectory() as tmp:
        tarball = Path(tmp) / "snop-deploy.tgz"
        print("Packing source...", flush=True)
        make_tarball(tarball)
        size_mb = tarball.stat().st_size / (1024 * 1024)
        print(f"Archive size: {size_mb:.1f} MB")

        client = ssh_connect()
        try:
            run(client, f"mkdir -p {REMOTE_DIR}")
            remote_tgz = posixpath.join(REMOTE_DIR, "snop-deploy.tgz")
            sftp_put(client, tarball, remote_tgz)

            # Extrai por cima (preserva .env se já existir)
            run(
                client,
                f"cd {REMOTE_DIR} && tar -xzf snop-deploy.tgz && rm -f snop-deploy.tgz",
            )

            # Sempre garante .env Docker (nunca reaproveitar .env Windows local).
            # Preserva ERP_* do .env remoto atual; se faltar, injeta do ambiente local do deploy.
            erp_from_local = ""
            local_env = ROOT / ".env"
            if local_env.is_file():
                for line in local_env.read_text(encoding="utf-8", errors="replace").splitlines():
                    if line.startswith("ERP_"):
                        erp_from_local += line + "\n"
            erp_fallback = erp_from_local.replace("'", "'\"'\"'")
            run(
                client,
                f"""
set -e
ERP_BLOCK=""
if [ -f {REMOTE_DIR}/.env ]; then
  ERP_BLOCK=$(grep -E '^ERP_' {REMOTE_DIR}/.env || true)
fi
if [ -z "$ERP_BLOCK" ]; then
  ERP_BLOCK='{erp_fallback}'
fi
cat > {REMOTE_DIR}/.env <<'EOF'
APP_PORT={APP_PORT}
MYSQL_ROOT_PASSWORD=snop_root_change_me
MYSQL_DATABASE=sop_system
MYSQL_USER=snop
MYSQL_PASSWORD=SnopApp!{APP_PORT}
JWT_SECRET=snop-jwt-{APP_PORT}-change-me
DEV_AUTH_BYPASS=true
DEV_AUTH_OPEN_ID=local-dev-user
DEV_AUTH_NAME=Admin S&OP
DEV_AUTH_EMAIL=admin@printbag.local
DEV_AUTH_ROLE=admin
DEV_AUTH_NIVEL_ACESSO=3
VITE_APP_ID=snop-printbag
PREVISAO_PYTHON_TIMEOUT_MIN=70
PREVISAO_PYTHON_HEARTBEAT_SEC=15
HOST=0.0.0.0
PORT=3012
NODE_ENV=production
EOF
if [ -n "$ERP_BLOCK" ]; then
  printf '%s\\n' "$ERP_BLOCK" >> {REMOTE_DIR}/.env
fi
grep -q '^PREVISAO_PYTHON_TIMEOUT_MIN=' {REMOTE_DIR}/.env || echo PREVISAO_PYTHON_TIMEOUT_MIN=70 >> {REMOTE_DIR}/.env
sed -i 's/^PREVISAO_PYTHON_TIMEOUT_MIN=.*/PREVISAO_PYTHON_TIMEOUT_MIN=70/' {REMOTE_DIR}/.env
chmod 600 {REMOTE_DIR}/.env
""".strip(),
            )

            # Garantir CRLF->LF no entrypoint
            run(
                client,
                f"sed -i 's/\\r$//' {REMOTE_DIR}/docker/entrypoint.sh && chmod +x {REMOTE_DIR}/docker/entrypoint.sh",
            )

            print("Building and starting containers (this can take several minutes)...")
            run(
                client,
                f"cd {REMOTE_DIR} && docker compose down --remove-orphans || true",
                check=False,
            )
            run(
                client,
                f"cd {REMOTE_DIR} && docker compose up -d --build",
            )

            # Espera health
            for i in range(40):
                time.sleep(5)
                status = run(
                    client,
                    "docker inspect --format='{{.State.Health.Status}}' snop-app 2>/dev/null || echo starting",
                    check=False,
                ).strip()
                print(f"health[{i}]: {status}")
                if status == "healthy":
                    break
                if status == "unhealthy":
                    run(client, "docker compose -f {}/docker-compose.yml logs --tail=80 app".format(REMOTE_DIR), check=False)
                    break

            run(client, "docker ps --filter name=snop --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'")
            print(f"\nOK -> http://{HOST}:{APP_PORT}/")
            print(f"Pasta no servidor: {REMOTE_DIR}")
            print("Nginx Proxy Manager -> Forward to {}:{}".format(HOST, APP_PORT))
        finally:
            client.close()


if __name__ == "__main__":
    main()
