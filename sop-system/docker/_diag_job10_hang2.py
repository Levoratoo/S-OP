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
echo ==== AFTER PRINTBAG ====
grep -n "Printbag\|Análise por marca\|ano a ano\|Análise de comportamento\|Gerando aba\|Clientes_\|sucesso\|concluída\|relatorio\|Excel\|Visao\|Metodologia\|Timeout\|Timeout\|OOM\|Killed\|Memory" /app/.previsao-python-jobs/job-10/run.log | grep -v "\[job 10\]" | tail -n 60
echo ==== XLSX ====
python3 - <<PY
from openpyxl import load_workbook
p="/app/.previsao-python-jobs/job-10/relatorio_previsao_demanda_job_10.xlsx"
try:
  wb=load_workbook(p, read_only=True, data_only=False)
  print("sheets:", wb.sheetnames)
  for s in wb.sheetnames:
    ws=wb[s]
    print(f"  {s}: dim={ws.dimensions}")
  wb.close()
except Exception as e:
  print("xlsx error:", type(e).__name__, e)
PY
echo ==== TIMESTAMPS ====
ls -lah /app/.previsao-python-jobs/job-10/relatorio_previsao_demanda_job_10.xlsx /app/.previsao-python-jobs/job-10/run.log
'
"""
    _i, out, err = client.exec_command(cmd, timeout=120)
    print(out.read().decode("utf-8", "replace"))
    stderr = err.read().decode("utf-8", "replace")
    if stderr:
        print("STDERR", stderr[-3000:])
    client.close()


if __name__ == "__main__":
    main()
