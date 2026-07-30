# Local Development

## First run

```powershell
npm install
npm run setup:local
npm run setup:python-previsao
```

## Start app

```powershell
npm run dev
```

The app runs on:

- `http://localhost:3012` (preferred)
- If `3012` is busy, it automatically starts on the next free port (`3013+`)

The local MariaDB runs on:

- `127.0.0.1:3307`
- user: `root`
- password: `root`
- database: `sop_system`

## Local auth

Development bypass is enabled in `.env`:

- `DEV_AUTH_BYPASS=true`
- user has admin role and level 3.

## Python forecast module

The integration route is:

- `/integracao/previsao-python`

If you created a virtual environment with `setup:python-previsao`, set:

- `PREVISAO_PYTHON_CMD=<path-da-venv>\python.exe`
- `PREVISAO_PYTHON_TIMEOUT_MIN=35` (timeout de seguranca por job)
- `PREVISAO_PYTHON_HEARTBEAT_SEC=15` (log periodico para acompanhar execucao)

Example:

- `PREVISAO_PYTHON_CMD=C:\repo\sop-system\.venv-previsao\Scripts\python.exe`
