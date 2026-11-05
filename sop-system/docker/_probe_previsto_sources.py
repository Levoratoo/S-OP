#!/usr/bin/env python3
"""Inspect previsto / ciclo data available for closed month."""
from __future__ import annotations

import os
import sys

import paramiko

PASSWORD = os.environ.get("SNOP_SSH_PASS") or os.environ.get("SNOP_DOCKER_PASS")


def run(client: paramiko.SSHClient, cmd: str, timeout: int = 120) -> str:
    print(f"== {cmd[:160]}", flush=True)
    _i, out, err = client.exec_command(cmd, timeout=timeout)
    text = out.read().decode("utf-8", "replace")
    etext = err.read().decode("utf-8", "replace")
    if text:
        print(text[:6000], flush=True)
    if etext and "Using a password" not in etext:
        print("[stderr]", etext[:2000], flush=True)
    return text


def main() -> None:
    if not PASSWORD:
        raise SystemExit("SNOP_SSH_PASS required")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect("192.168.1.82", username="pedro-levorato", password=PASSWORD, timeout=25)

    run(
        client,
        "docker exec snop-app python3 -c "
        "\"import csv; from collections import Counter; "
        "p='/app/dados-sistema/estatistica_previsto.csv'; "
        "cols=Counter(); "
        "f=open(p,newline='',encoding='utf-8-sig'); r=csv.DictReader(f); "
        "hdr=r.fieldnames or []; "
        "print('headers', hdr[:3], '...', hdr[-8:]); "
        "[cols.update({k:1 for k,v in row.items() if k and k.lower() not in {'codificacao','codigo','codificação'} and str(v).strip() not in {'','0','0.0','-'}}) for row in r]; "
        "f.close(); keys=sorted(cols); print('nmonths', len(keys)); print('last', keys[-15:])\"",
    )

    run(
        client,
        "docker exec snop-db mariadb -usnop -p'SnopApp!3042' sop_system -e "
        "\"SELECT COUNT(*) AS previsoes FROM previsoes; "
        "SELECT ano, mes, COUNT(*) n FROM previsoes GROUP BY ano, mes ORDER BY ano DESC, mes DESC LIMIT 15; "
        "SELECT id, nome, status, ano, mes FROM ciclosComerciais ORDER BY id DESC LIMIT 8; "
        "SELECT c.id, c.nome, COUNT(i.id) itens "
        "FROM ciclosComerciais c LEFT JOIN cicloComercialItens i ON i.cicloId=c.id "
        "GROUP BY c.id ORDER BY c.id DESC LIMIT 8;\"",
    )

    # Also check local seed file months
    local = r"C:\Users\pedro.levorato\Documents\SNOP\dados sistema\estatistica_previsto.csv"
    try:
        import csv
        from pathlib import Path

        p = Path(local)
        if p.exists():
            with p.open(newline="", encoding="utf-8-sig") as f:
                r = csv.reader(f)
                headers = next(r)
            print("LOCAL seed headers last:", headers[-12:], flush=True)
            print("ago-26 in seed?", any("ago-26" in h.lower() for h in headers), flush=True)
    except Exception as exc:
        print("local seed check fail", exc, flush=True)

    client.close()


if __name__ == "__main__":
    main()
