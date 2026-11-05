"""Gera bases do faturamento, executa previsão Python e desagrega ciclo comercial."""
from __future__ import annotations

import http.cookiejar
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

BASE = os.environ.get("SNOP_BASE", "http://192.168.1.82:3042")
POLL_SEC = int(os.environ.get("PREVISAO_POLL_SEC", "15"))
MAX_WAIT_MIN = int(os.environ.get("PREVISAO_MAX_WAIT_MIN", "45"))
DESAGREGAR = os.environ.get("PREVISAO_DESAGREGAR", "1") != "0"


def call(opener, path: str, payload=None, method="GET", timeout=600):
    if method == "GET":
        url = f"{BASE}{path}"
        if payload is not None:
            url += "?input=" + urllib.parse.quote(json.dumps({"json": payload}))
        req = urllib.request.Request(url)
    else:
        req = urllib.request.Request(
            f"{BASE}{path}",
            data=json.dumps({"json": payload if payload is not None else {}}).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
    try:
        with opener.open(req, timeout=timeout) as resp:
            body = json.loads(resp.read().decode())
            return resp.status, body.get("result", {}).get("data", {}).get("json", body), None
    except urllib.error.HTTPError as exc:
        return exc.code, None, exc.read()[:1200].decode("utf-8", "replace")
    except Exception as exc:
        return 0, None, str(exc)


def main() -> None:
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    opener.open(f"{BASE}/api/auth/local-login", timeout=30)

    print("==> createFromSistema (ETL + enqueue)", flush=True)
    status, data, err = call(
        opener,
        "/api/trpc/previsaoPython.createFromSistema",
        {},
        method="POST",
        timeout=900,
    )
    if err or not data:
        print("FAIL createFromSistema", status, err, flush=True)
        raise SystemExit(1)

    job = data.get("job") or {}
    stats = data.get("stats") or {}
    job_id = job.get("id")
    print("job", json.dumps(job, ensure_ascii=False), flush=True)
    print("stats", json.dumps(stats, ensure_ascii=False), flush=True)
    if not job_id:
        raise SystemExit("job id ausente")

    deadline = time.time() + MAX_WAIT_MIN * 60
    last_status = None
    while time.time() < deadline:
        st, job_data, jerr = call(
            opener,
            "/api/trpc/previsaoPython.getById",
            {"id": job_id},
            timeout=60,
        )
        if jerr or not job_data:
            print("poll error", st, jerr, flush=True)
            time.sleep(POLL_SEC)
            continue

        cur = job_data.get("status")
        msg = job_data.get("message")
        if cur != last_status:
            print(f"status={cur} message={msg}", flush=True)
            last_status = cur
        else:
            print(f"... ainda {cur}: {msg}", flush=True)

        if cur in ("SUCCESS", "ERROR"):
            # log tail
            _, log_data, _ = call(
                opener,
                "/api/trpc/previsaoPython.log",
                {"id": job_id, "maxChars": 6000},
                timeout=60,
            )
            if isinstance(log_data, dict):
                text = log_data.get("content") or log_data.get("log") or json.dumps(log_data)[:6000]
            else:
                text = str(log_data)[:6000]
            print("==> LOG TAIL ==", flush=True)
            print(text[-4000:] if text else "(vazio)", flush=True)
            if cur == "ERROR":
                raise SystemExit(2)

            if DESAGREGAR:
                print("==> desagregarDoJob", flush=True)
                ds, dd, de = call(
                    opener,
                    "/api/trpc/cicloComercial.desagregarDoJob",
                    {"jobId": job_id},
                    method="POST",
                    timeout=300,
                )
                if de or not dd:
                    print("FAIL desagregar", ds, de, flush=True)
                    raise SystemExit(3)
                print("ciclo", json.dumps(dd, ensure_ascii=False), flush=True)

            print("DONE job", job_id, flush=True)
            return

        time.sleep(POLL_SEC)

    print("TIMEOUT aguardando job", job_id, flush=True)
    raise SystemExit(4)


if __name__ == "__main__":
    main()
