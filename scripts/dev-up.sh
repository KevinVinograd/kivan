#!/usr/bin/env bash
#
# One-shot local bring-up: installs dependencies, starts Postgres in Docker and
# creates the database with scripts/create-db.sh. Then you run the API and the front
# in two terminals (see the end).
#
# Requirements: Docker, Node 24, pnpm 10 (corepack). Recreates the DB container on
# every run, so you always start from a fresh database.
#
# Usage:   ./scripts/dev-up.sh
# Config:  PG_PORT (default 5477), SEED_EMAIL, SEED_PASSWORD, DUMP_FILE (load real data)
set -euo pipefail
cd "$(dirname "$0")/.."

PG_CONTAINER="kivan-pg"
PG_PORT="${PG_PORT:-5477}"

echo "▸ Checking prerequisites..."
command -v docker >/dev/null || { echo "✗ Docker is required. Install Docker Desktop and start it."; exit 1; }
docker info >/dev/null 2>&1 || { echo "✗ Docker is installed but not running. Start Docker Desktop."; exit 1; }
command -v pnpm >/dev/null 2>&1 || corepack enable

echo "▸ Installing workspace dependencies..."
pnpm install --frozen-lockfile

echo "▸ Starting Postgres (docker container '${PG_CONTAINER}' on :${PG_PORT})..."
docker rm -f "$PG_CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$PG_CONTAINER" \
  -e POSTGRES_USER=owner -e POSTGRES_PASSWORD=owner \
  -p "${PG_PORT}:5432" postgres:16-alpine >/dev/null
printf "  waiting for Postgres"
until docker exec "$PG_CONTAINER" pg_isready -h 127.0.0.1 -U owner >/dev/null 2>&1; do printf "."; sleep 1; done
echo " ready."

ADMIN_URL="postgresql://owner:owner@localhost:${PG_PORT}/postgres" ./scripts/create-db.sh

if [ -n "${DUMP_FILE:-}" ]; then
  LOGIN="any user of the dump  /  owner1234"
else
  LOGIN="${SEED_EMAIL:-owner@studio.test}  /  ${SEED_PASSWORD:-owner1234}"
fi

cat <<EOF

✅ Backend ready.

Now run these in TWO terminals from the repo root:
  1) API:    pnpm --filter api dev          # http://localhost:3010
  2) Front:  pnpm dev                       # http://localhost:5173

Login:  ${LOGIN}

Tear down:     ./scripts/dev-down.sh
EOF
