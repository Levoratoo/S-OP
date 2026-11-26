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

from env_merge import managed_docker_env, merge_env, parse_assignments

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


def read_remote_text(client: paramiko.SSHClient, remote: str) -> str:
    sftp = client.open_sftp()
    try:
        try:
            with sftp.open(remote, "r") as fh:
                data = fh.read()
        except FileNotFoundError:
            return ""
        except OSError as exc:
            if getattr(exc, "errno", None) == 2:
                return ""
            raise
    finally:
        sftp.close()
    if isinstance(data, bytes):
        return data.decode("utf-8", errors="replace")
    return str(data)


def write_remote_text(client: paramiko.SSHClient, remote: str, text: str) -> None:
    sftp = client.open_sftp()
    try:
        with sftp.open(remote, "w") as fh:
            fh.write(text.encode("utf-8"))
    finally:
        sftp.close()


def erp_local() -> dict[str, str]:
    path = ROOT / ".env"
    if not path.is_file():
        return {}
    return {
        key: value
        for key, value in parse_assignments(path.read_text(encoding="utf-8", errors="replace")).items()
        if key.startswith("ERP_")
    }


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
            remote_env_path = posixpath.join(REMOTE_DIR, ".env")
            # Lê antes do tar: o pacote não leva .env, mas a mescla parte do arquivo
            # que já está no servidor (PIPEDRIVE_* e demais segredos).
            remote_env = read_remote_text(client, remote_env_path)
            sftp_put(client, tarball, remote_tgz)

            # Extrai por cima (preserva .env se já existir)
            run(
                client,
                f"cd {REMOTE_DIR} && tar -xzf snop-deploy.tgz && rm -f snop-deploy.tgz",
            )

            # Mescla o .env remoto: atualiza só as chaves do Docker e preserva
            # PIPEDRIVE_*, ERP_* e qualquer outra chave que não está no arquivo local.
            # Os valores não entram no comando SSH nem no log.
            merged_env, env_stats = merge_env(remote_env, managed_docker_env(APP_PORT), erp_local())
            write_remote_text(client, remote_env_path, merged_env)
            run(client, f"chmod 600 {remote_env_path}")
            print(
                ".env mesclado: "
                f"{env_stats.updated} atualizada(s), "
                f"{env_stats.preserved} preservada(s), "
                f"{env_stats.added} acrescentada(s), "
                f"recreate={'sim' if env_stats.changed else 'nao'}"
            )

            # Garantir CRLF->LF no entrypoint
            run(
                client,
                f"sed -i 's/\\r$//' {REMOTE_DIR}/docker/entrypoint.sh && chmod +x {REMOTE_DIR}/docker/entrypoint.sh",
            )

            print("Building and starting containers (this can take several minutes)...")
            recreate = " --force-recreate" if env_stats.changed else ""
            run(
                client,
                f"cd {REMOTE_DIR} && docker compose up -d --build{recreate}",
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
