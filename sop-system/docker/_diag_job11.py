#!/usr/bin/env python3
import os
import paramiko

PASSWORD = os.environ.get("SNOP_SSH_PASS") or os.environ.get("SNOP_DOCKER_PASS")


def main():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect("192.168.1.82", username="pedro-levorato", password=PASSWORD, timeout=25)
    cmd = r"""
docker exec snop-app bash -lc '
echo ==== LOG CLIENTES ====
grep -nE "Clientes_Analise|Cliente_detalhado|Clientes_Por_Marca|formatação|Erro|sucesso|Escrevendo|gerada" /app/.previsao-python-jobs/job-11/run.log | grep -v "\[job 11\]" | tail -n 60
echo ==== XLSX ====
python3 - <<PY
import zipfile, re
p="/app/.previsao-python-jobs/job-11/relatorio_previsao_demanda_job_11.xlsx"
z=zipfile.ZipFile(p)
wb=z.read("xl/workbook.xml").decode("utf-8","replace")
sheets=re.findall(r"name=\"([^\"]+)\"", wb)
print("sheets:", sheets)
print("size:", __import__("os").path.getsize(p))
PY
ls -lah /app/.previsao-python-jobs/job-11/relatorio_previsao_demanda_job_11.xlsx
'
"""
    _i, o, e = client.exec_command(cmd, timeout=120)
    print(o.read().decode("utf-8", "replace"))
    err = e.read().decode("utf-8", "replace")
    if err:
        print("STDERR", err[-2000:])
    client.close()


if __name__ == "__main__":
    main()
