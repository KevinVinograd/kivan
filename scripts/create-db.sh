#!/usr/bin/env bash
#
# Creates the Kivan database on ANY Postgres 14+ (Docker, local install or a hosted one):
#   1. the app role (non-superuser, what the API connects as)
#   2. the database, if it does not exist
#   3. the schema (Prisma migrations in packages/db/prisma/migrations)
#   4. table privileges for the app role
#   5. the studio settings row + an owner user (seed), or the data in DUMP_FILE
#   6. apps/api/.env pointing at the new database, if it does not exist yet
#
# Safe to re-run: every step skips what already exists.
#
# Usage:
#   ADMIN_URL=postgresql://postgres:secret@localhost:5432/postgres ./scripts/create-db.sh
#
# Config (env vars):
#   ADMIN_URL     a user that can create roles and databases (required). Its database
#                 part is ignored; the script connects to DB_NAME for everything but step 2.
#   DB_NAME       default: kivan
#   APP_USER      default: kivan_app
#   APP_PASSWORD  default: app          (change it for anything that is not your laptop)
#   SEED_EMAIL    default: owner@studio.test
#   SEED_PASSWORD default: owner1234
#   SKIP_SEED=1   create the schema without the owner user
#   DUMP_FILE     a data-only .sql (e.g. dumps/kivan-data.sql) to load instead of the seed.
#                 Only into an EMPTY database: it does not merge with existing rows.
#
# Needs `psql` on the PATH. Without it, the script runs psql inside a throwaway
# postgres:16-alpine container (Docker required).
set -euo pipefail
cd "$(dirname "$0")/.."

: "${ADMIN_URL:?Set ADMIN_URL, e.g. postgresql://postgres:secret@localhost:5432/postgres}"
DB_NAME="${DB_NAME:-kivan}"
APP_USER="${APP_USER:-kivan_app}"
APP_PASSWORD="${APP_PASSWORD:-app}"

# Same server, different database: swap the path of the URL (no query string expected).
SERVER_URL="${ADMIN_URL%/*}"
MAINTENANCE_URL="${SERVER_URL}/postgres"
DB_URL="${SERVER_URL}/${DB_NAME}"
APP_URL="$(echo "$SERVER_URL" | sed -E "s#//[^@]*@#//${APP_USER}:${APP_PASSWORD}@#")/${DB_NAME}"

run_psql() {
  local url="$1"; shift
  if command -v psql >/dev/null 2>&1; then
    psql "$url" -v ON_ERROR_STOP=1 -q "$@"
  else
    local in_docker="${url//localhost/host.docker.internal}"
    in_docker="${in_docker//127.0.0.1/host.docker.internal}"
    docker run --rm -i --add-host=host.docker.internal:host-gateway postgres:16-alpine \
      psql "$in_docker" -v ON_ERROR_STOP=1 -q "$@"
  fi
}

echo "▸ Creating the app role '${APP_USER}' (if missing)..."
run_psql "$MAINTENANCE_URL" <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${APP_USER}') THEN
    CREATE ROLE "${APP_USER}" LOGIN PASSWORD '${APP_PASSWORD}';
  END IF;
END
\$\$;
SQL

echo "▸ Creating the database '${DB_NAME}' (if missing)..."
if [ "$(run_psql "$MAINTENANCE_URL" -tA -c "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'")" != "1" ]; then
  run_psql "$MAINTENANCE_URL" -c "CREATE DATABASE \"${DB_NAME}\";"
fi
run_psql "$DB_URL" \
  -c "GRANT CONNECT ON DATABASE \"${DB_NAME}\" TO \"${APP_USER}\";" \
  -c "GRANT USAGE ON SCHEMA public TO \"${APP_USER}\";"

echo "▸ Building the database package..."
pnpm --filter @hold/db generate >/dev/null
pnpm --filter @hold/shared --filter @hold/config --filter @hold/db build >/dev/null

echo "▸ Applying migrations..."
DATABASE_URL="$DB_URL" pnpm --filter @hold/db exec prisma migrate deploy

echo "▸ Granting table privileges to '${APP_USER}'..."
run_psql "$DB_URL" \
  -c "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO \"${APP_USER}\";" \
  -c "GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO \"${APP_USER}\";"

if [ -n "${DUMP_FILE:-}" ]; then
  echo "▸ Loading data from ${DUMP_FILE}..."
  run_psql "$DB_URL" < "$DUMP_FILE"
elif [ "${SKIP_SEED:-}" != "1" ]; then
  echo "▸ Seeding the owner user..."
  SEED_DATABASE_URL="$DB_URL" pnpm --filter api exec tsx scripts/seed-dev.ts
fi

if [ ! -f apps/api/.env ]; then
  sed "s#^DATABASE_URL=.*#DATABASE_URL=${APP_URL}#" apps/api/.env.example > apps/api/.env
  echo "▸ Created apps/api/.env (DATABASE_URL → ${APP_USER}@…/${DB_NAME})."
else
  echo "▸ apps/api/.env already exists; make sure its DATABASE_URL is:"
  echo "    ${APP_URL}"
fi

echo "✅ Database '${DB_NAME}' ready."
