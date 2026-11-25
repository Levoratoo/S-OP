"""Mescla o .env remoto com as chaves que o deploy gerencia.

Valores nunca devem ser impressos pelo chamador. Este módulo só devolve texto.
"""

from __future__ import annotations

import json
import sys
from dataclasses import dataclass


@dataclass(frozen=True)
class MergeStats:
    updated: int
    preserved: int
    added: int
    changed: bool


def parse_assignments(text: str) -> dict[str, str]:
    """Último valor de cada KEY=value. Ignora comentários e linhas vazias."""
    found: dict[str, str] = {}
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.startswith("export "):
            line = line[len("export ") :].strip()
        key, value = line.split("=", 1)
        key = key.strip()
        if key:
            found[key] = value
    return found


def managed_docker_env(app_port: str) -> dict[str, str]:
    """Chaves reescritas pelo deploy. O restante do arquivo remoto fica intacto."""
    return {
        "APP_PORT": app_port,
        "MYSQL_ROOT_PASSWORD": "snop_root_change_me",
        "MYSQL_DATABASE": "sop_system",
        "MYSQL_USER": "snop",
        "MYSQL_PASSWORD": f"SnopApp!{app_port}",
        "JWT_SECRET": f"snop-jwt-{app_port}-change-me",
        "DEV_AUTH_BYPASS": "true",
        "DEV_AUTH_OPEN_ID": "local-dev-user",
        "DEV_AUTH_NAME": "Admin S&OP",
        "DEV_AUTH_EMAIL": "admin@printbag.local",
        "DEV_AUTH_ROLE": "admin",
        "DEV_AUTH_NIVEL_ACESSO": "3",
        "VITE_APP_ID": "snop-printbag",
        "PREVISAO_PYTHON_TIMEOUT_MIN": "70",
        "PREVISAO_PYTHON_HEARTBEAT_SEC": "15",
        "HOST": "0.0.0.0",
        "PORT": "3012",
        "NODE_ENV": "production",
    }


def _assignment_key(raw: str) -> str | None:
    line = raw.strip()
    if not line or line.startswith("#") or "=" not in line:
        return None
    if line.startswith("export "):
        line = line[len("export ") :].strip()
    key = line.split("=", 1)[0].strip()
    return key or None


def merge_env(
    remote: str,
    managed: dict[str, str],
    fill_if_absent: dict[str, str] | None = None,
) -> tuple[str, MergeStats]:
    """Atualiza só as chaves gerenciadas e acrescenta fill_if_absent se faltarem.

    Comentários, ordem e qualquer outra chave (PIPEDRIVE_*, ERP_* já presentes,
    segredos locais do servidor) são preservados.
    """
    extras = fill_if_absent or {}
    remote_keys = parse_assignments(remote)
    seen_managed: set[str] = set()
    updated = 0
    preserved = 0
    out: list[str] = []

    for raw in remote.splitlines():
        key = _assignment_key(raw)
        if key is None:
            out.append(raw)
            continue
        if key in managed:
            seen_managed.add(key)
            new_line = f"{key}={managed[key]}"
            if remote_keys.get(key) != managed[key]:
                updated += 1
            out.append(new_line)
            continue
        preserved += 1
        out.append(raw)

    added = 0
    missing_managed = [key for key in managed if key not in seen_managed]
    missing_extra = [key for key in extras if key not in remote_keys and key not in managed]
    if (missing_managed or missing_extra) and out and out[-1] != "":
        out.append("")
    for key in missing_managed:
        out.append(f"{key}={managed[key]}")
        added += 1
    for key in missing_extra:
        out.append(f"{key}={extras[key]}")
        added += 1

    merged = "\n".join(out)
    if merged and not merged.endswith("\n"):
        merged += "\n"
    remote_norm = remote.replace("\r\n", "\n")
    if remote_norm and not remote_norm.endswith("\n"):
        remote_norm += "\n"
    changed = merged != remote_norm
    return merged, MergeStats(updated=updated, preserved=preserved, added=added, changed=changed)


def _main() -> None:
    payload = json.load(sys.stdin)
    merged, stats = merge_env(
        payload.get("remote") or "",
        payload.get("managed") or {},
        payload.get("fill_if_absent") or {},
    )
    json.dump(
        {
            "merged": merged,
            "updated": stats.updated,
            "preserved": stats.preserved,
            "added": stats.added,
            "changed": stats.changed,
        },
        sys.stdout,
    )


if __name__ == "__main__":
    _main()
