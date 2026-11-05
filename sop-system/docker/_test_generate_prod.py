"""Trigger one production forecast and monitor it through completion."""
from __future__ import annotations

import json
import time

import requests

BASE = "http://192.168.1.82:3042"


def trpc_json(response: requests.Response):
    response.raise_for_status()
    return response.json()["result"]["data"]["json"]


session = requests.Session()
session.get(f"{BASE}/api/auth/local-login", allow_redirects=True, timeout=30)

started = time.perf_counter()
response = session.post(
    f"{BASE}/api/trpc/previsaoPython.createFromSistema",
    json={"json": {}},
    timeout=600,
)
elapsed = time.perf_counter() - started
result = trpc_json(response)
job_id = result["job"]["id"]
print(f"CREATE job={job_id} response_seconds={elapsed:.2f}", flush=True)
print("stats", json.dumps(result["stats"], ensure_ascii=False), flush=True)

last_status = None
last_message = None
while True:
    jobs = trpc_json(
        session.get(
            f"{BASE}/api/trpc/previsaoPython.list",
            params={"input": json.dumps({"json": {"limit": 20}})},
            timeout=30,
        )
    )
    job = next(item for item in jobs if item["id"] == job_id)
    status = job["status"]
    message = job.get("message")
    if status != last_status or message != last_message:
        print(
            f"{time.perf_counter() - started:.0f}s status={status} message={message}",
            flush=True,
        )
        last_status = status
        last_message = message
    if status in {"SUCCESS", "ERROR"}:
        print("FINAL", json.dumps(job, ensure_ascii=False, default=str), flush=True)
        raise SystemExit(0 if status == "SUCCESS" else 1)
    time.sleep(30)
