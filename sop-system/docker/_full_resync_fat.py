"""
1) Garante ERP_* no .env remoto
2) Reinicia app
3) Limpa faturamento + syncFromSql (fonte limpa do ERP)
4) Compara Adidas por ano vs Excel
"""
from __future__ import annotations

import base64
import io
import json
import os
import sys
import time
from collections import defaultdict

import openpyxl
import paramiko
import requests

HOST = os.environ.get("SNOP_SSH_HOST", "192.168.1.82")
USER = os.environ.get("SNOP_SSH_USER", "pedro-levorato")
PASSWORD = os.environ.get("SNOP_SSH_PASS") or os.environ.get("SNOP_DOCKER_PASS")
REMOTE = os.environ.get("SNOP_REMOTE_DIR", "/opt/sites_dev/snop")
BASE = f"http://{HOST}:3042"
EXCEL = r"c:\Users\pedro.levorato\Documents\SNOP\OneDrive_2026-07-30\1-Módulo Previsão Demanda\1.1 arquivos\1-BasedeDadosVendas.xlsx"
ENC = "MTS-Adidas-Automática"

ENV_CMD = r"""
set -e
cd /opt/sites_dev/snop
touch .env
for kv in \
  'ERP_MSSQL_SERVER=VMDB2' \
  'ERP_MSSQL_INSTANCE=VMDB2' \
  'ERP_MSSQL_PORT=49257' \
  'ERP_MSSQL_DATABASE=MetricsPROD' \
  'ERP_MSSQL_USER=mitraconnect' \
  'ERP_MSSQL_PASSWORD=M1tra##2025' \
  'ERP_MSSQL_ENCRYPT=false' \
  'ERP_MSSQL_TRUST_CERT=true' \
  'ERP_FATURAMENTO_SOURCE=dbo.Usr_VIEW_MITRA_FAT_02' \
  'ERP_FATURAMENTO_DESDE=2022-01-01'
do
  key="${kv%%=*}"
  if grep -q "^${key}=" .env; then
    sed -i "s|^${key}=.*|${kv}|" .env
  else
    echo "${kv}" >> .env
  fi
done
chmod 600 .env
# Avoid hanging self-join DELETE — truncate via SQL then let sync refill
docker exec snop-db mysql -usnop -pSnopApp!3042 sop_system -e "SET SESSION innodb_lock_wait_timeout=5; SELECT COUNT(*) AS fat_rows FROM faturamento;"
docker compose up -d app
for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
  if curl -fsS http://127.0.0.1:3012/ >/dev/null 2>&1; then echo APP_UP; break; fi
  sleep 5
done
docker compose ps
grep '^ERP_' .env | sed 's/PASSWORD=.*/PASSWORD=***/'
"""


def ssh_run(cmd: str, timeout: int = 300) -> str:
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASSWORD, timeout=30)
    try:
        _, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
        out = stdout.read().decode("utf-8", "replace")
        err = stderr.read().decode("utf-8", "replace")
        return out + (("\nSTDERR:\n" + err) if err.strip() else "")
    finally:
        ssh.close()


def wait_http(timeout_s: int = 180) -> None:
    t0 = time.time()
    while time.time() - t0 < timeout_s:
        try:
            r = requests.get(BASE + "/", timeout=5)
            if r.status_code < 500:
                print("HTTP OK", r.status_code, flush=True)
                return
        except Exception as e:
            print("wait http...", e.__class__.__name__, flush=True)
        time.sleep(5)
    raise SystemExit("App não respondeu a tempo")


def session() -> requests.Session:
    s = requests.Session()
    s.get(f"{BASE}/api/auth/local-login", allow_redirects=True, timeout=30)
    return s


def load_row(b64=None, path=None, code=ENC):
    wb = openpyxl.load_workbook(
        io.BytesIO(base64.b64decode(b64)) if b64 else path,
        read_only=True,
        data_only=True,
    )
    ws = wb.active
    rows = ws.iter_rows(values_only=True)
    header = [str(h).strip() if h is not None else "" for h in next(rows)]
    months = header[1:]
    for row in rows:
        if row and str(row[0]).strip() == code:
            vals = []
            for v in row[1:]:
                if v is None or v == "" or str(v).strip() in {"-", " -   "}:
                    vals.append(0.0)
                else:
                    vals.append(float(v))
            wb.close()
            return months, vals
    wb.close()
    raise SystemExit(f"code {code} not found")


def main() -> None:
    if not PASSWORD:
        raise SystemExit("Defina SNOP_SSH_PASS")

    print("=== patch ERP env + ensure app ===", flush=True)
    print(ssh_run(ENV_CMD, timeout=300), flush=True)
    wait_http()

    s = session()

    print("=== clear faturamento ===", flush=True)
    r = s.post(f"{BASE}/api/trpc/faturamento.clear", json={"json": None}, timeout=600)
    print(r.status_code, r.text[:500], flush=True)
    r.raise_for_status()

    print("=== syncFromSql (pode demorar vários minutos) ===", flush=True)
    r = s.post(
        f"{BASE}/api/trpc/faturamento.syncFromSql",
        json={"json": {"clearBefore": True}},
        timeout=7200,
    )
    print(r.status_code, flush=True)
    try:
        print(json.dumps(r.json(), ensure_ascii=False, indent=2)[:5000], flush=True)
    except Exception:
        print(r.text[:2000], flush=True)
    if r.status_code >= 400:
        sys.exit(1)

    print("=== gerarBasesPreview + compare Adidas ===", flush=True)
    r2 = s.post(
        f"{BASE}/api/trpc/previsaoPython.gerarBasesPreview",
        json={"json": {"dataInicio": "2020-01-01", "dataFim": "2026-04-30"}},
        timeout=600,
    )
    data = r2.json()["result"]["data"]["json"]
    gm, gv = load_row(b64=data["vendasBase64"])
    em, ev = load_row(path=EXCEL)
    gmap = dict(zip(gm, gv))
    emap = dict(zip(em, ev))
    by_year = defaultdict(lambda: [0.0, 0.0])
    for m in set(gmap) | set(emap):
        y = "20" + m.split("-")[1]
        by_year[y][0] += gmap.get(m, 0.0)
        by_year[y][1] += emap.get(m, 0.0)
    print(f"=== {ENC} by year ===", flush=True)
    for y in sorted(by_year):
        a, b = by_year[y]
        ratio = round(a / b, 4) if b else None
        print(y, int(a), int(b), ratio, "delta", int(a - b), flush=True)


if __name__ == "__main__":
    main()
