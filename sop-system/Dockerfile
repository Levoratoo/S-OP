# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate
COPY package.json pnpm-lock.yaml* package-lock.json* ./
COPY patches ./patches
# Prefer pnpm (packageManager field); fall back to npm if lock missing
RUN if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile; \
    elif [ -f package-lock.json ]; then npm ci; \
    else pnpm install; fi

FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
ENV ENABLE_MANUS_RUNTIME=false
RUN if [ -f pnpm-lock.yaml ]; then pnpm run build; else npm run build; fi

FROM node:22-bookworm-slim AS runtime
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-pip python3-venv \
      ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

# Python deps for forecast (sem prophet/xgboost — imagem menor; script faz fallback)
COPY requirements-previsao-python.txt /tmp/requirements-previsao-python.txt
RUN python3 -m venv /opt/venv-previsao \
 && /opt/venv-previsao/bin/pip install --no-cache-dir -U pip \
 && /opt/venv-previsao/bin/pip install --no-cache-dir \
      "numpy>=1.26" "pandas>=2.2" "scikit-learn>=1.6" "openpyxl>=3.1" \
      "python-dateutil>=2.9" "matplotlib>=3.9" "statsmodels>=0.14" \
 && mkdir -p /opt/matplotlib-cache \
 && MPLCONFIGDIR=/opt/matplotlib-cache /opt/venv-previsao/bin/python -c "import matplotlib.pyplot"

ENV PATH="/opt/venv-previsao/bin:${PATH}"
ENV PREVISAO_PYTHON_CMD=/opt/venv-previsao/bin/python
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3012
ENV PYTHONUTF8=1
ENV MPLCONFIGDIR=/opt/matplotlib-cache

COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=build /app/patches ./patches
RUN mkdir -p /app/docker /app/.previsao-python-jobs
COPY docker/entrypoint.sh /entrypoint.sh
COPY docker/apply-sql-migrations.mjs /app/docker/apply-sql-migrations.mjs
RUN chmod +x /entrypoint.sh

# Script Python canônico (pasta ASCII — evita espaços/acentos no COPY do Docker)
COPY scripts-previsao/ ./scripts-previsao/

# CSVs mestres para seed/importação operacional
COPY dados-sistema/ ./dados-sistema/
ENV SEED_CADASTROS_DIR=/app/dados-sistema

# Evita chown gigante em node_modules (minutos no build). App roda como root no container interno.
EXPOSE 3012
ENTRYPOINT ["/entrypoint.sh"]
