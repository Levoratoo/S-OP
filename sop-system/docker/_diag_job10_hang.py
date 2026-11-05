#!/usr/bin/env python3
import os
import paramiko

HOST = "192.168.1.82"
USER = "pedro-levorato"
PASSWORD = os.environ.get("SNOP_SSH_PASS") or os.environ.get("SNOP_DOCKER_PASS") or ""


def main() -> None:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=25)
    cmd = r"""
docker exec snop-app bash -lc '
echo ==== SCRIPT PROGRESS ====
grep -nE "Processando marca|Marca .*clientes|Análise por marca|Gerando aba|sucesso|Clientes_|Visao|Metodologia|Erro|Timeout" /app/.previsao-python-jobs/job-10/run.log | grep -v "\[job 10\]" | tail -n 80
echo ==== PARTIAL XLSX ====
python - <<PY
from openpyxl import load_workbook
p="/app/.previsao-python-jobs/job-10/relatorio_previsao_demanda_job_10.xlsx"
try:
  wb=load_workbook(p, read_only=True, data_only=False)
  print("sheets:", wb.sheetnames)
  for s in wb.sheetnames:
    ws=wb[s]
    print(f"  {s}: {ws.max_row}x{ws.max_column}")
  wb.close()
except Exception as e:
  print("xlsx error:", e)
PY
'
"""
    _i, out, err = client.exec_command(cmd, timeout=120)
    print(out.read().decode("utf-8", "replace"))
    stderr = err.read().decode("utf-8", "replace")
    if stderr:
        print("STDERR", stderr[-2000:])
    client.close()


if __name__ == "__main__":
    main()
