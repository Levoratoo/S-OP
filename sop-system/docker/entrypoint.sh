#!/bin/sh
set -eu

echo "[entrypoint] Waiting for database..."
i=0
until node --input-type=module -e "
import mysql from 'mysql2/promise';
const url = process.env.DATABASE_URL;
if (!url) process.exit(1);
const conn = await mysql.createConnection(url);
await conn.query('SELECT 1');
await conn.end();
"; do
  i=$((i + 1))
  if [ "$i" -gt 60 ]; then
    echo "[entrypoint] Database not ready after 60 attempts."
    exit 1
  fi
  sleep 2
done

echo "[entrypoint] Applying SQL migrations..."
node /app/docker/apply-sql-migrations.mjs

echo "[entrypoint] Starting S&OP on ${HOST:-0.0.0.0}:${PORT:-3012}"
exec node dist/index.js
