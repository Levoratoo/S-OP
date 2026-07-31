# Docker — S&OP Printbag

## Servidor

- Host: `192.168.1.82`
- Pasta: `/opt/sites_dev/snop`
- Porta publicada: **3042** → container `3012`
- Proxy: Nginx Proxy Manager (aponta para `192.168.1.82:3042`)

## Link direto

http://192.168.1.82:3042/

## Arquivos nesta pasta / no servidor

| Arquivo | Função |
|---------|--------|
| `../Dockerfile` | Build Node + Python (previsão) |
| `../docker-compose.yml` | Serviços `app` + `db` (MariaDB) |
| `entrypoint.sh` | Espera DB → migrations → start |
| `apply-sql-migrations.mjs` | Aplica `drizzle/*.sql` |
| `../.env` | Segredos / porta (não versionar) |
| `.env.example` | Modelo de variáveis |

## Subir / atualizar

No servidor:

```bash
cd /opt/sites_dev/snop
docker compose up -d --build
docker compose logs -f app
docker compose ps
```

Deploy a partir do Windows (com senha em env):

```powershell
$env:SNOP_SSH_PASS = '***'
$env:PYTHONUNBUFFERED = '1'
python docker/deploy_to_server.py
```

## NPM (Nginx Proxy Manager)

- Forward Hostname / IP: `192.168.1.82`
- Forward Port: `3042`
- Scheme: `http`

## Auth inicial

Com `DEV_AUTH_BYPASS=true` no `.env`, o login local entra como admin (nível 3).
Ajuste JWT/senhas do MySQL no `.env` antes de expor para fora da LAN.
