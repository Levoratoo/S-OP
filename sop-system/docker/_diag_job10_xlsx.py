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
sed -n "580,720p" /app/.previsao-python-jobs/job-10/run.log | grep -v "\[job 10\]"
echo ====
# inspect partial xlsx with zip+python stdlib
python3 - <<PY
import zipfile, re
p="/app/.previsao-python-jobs/job-10/relatorio_previsao_demanda_job_10.xlsx"
try:
  z=zipfile.ZipFile(p)
  names=[n for n in z.namelist() if n.startswith("xl/worksheets/")]
  print("worksheet parts:", names)
  # workbook.xml sheet names
  wb=z.read("xl/workbook.xml").decode("utf-8","replace")
  sheets=re.findall(r'name="([^"]+)"', wb)
  print("sheet names:", sheets)
  for n in names:
    info=z.getinfo(n)
    print(f"  {n}: {info.file_size} bytes compressed={info.compress_size}")
except Exception as e:
  print("err", type(e).__name__, e)
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
