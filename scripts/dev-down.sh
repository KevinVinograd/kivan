#!/usr/bin/env bash
# Tear down the local dev backend: stop the API/front dev servers and remove the
# Postgres container. Safe to run anytime.
set -uo pipefail

PG_CONTAINER="kivan-pg"

echo "▸ Stopping dev servers (API + front)..."
pkill -f 'tsx watch src/server.ts' 2>/dev/null || true
pkill -f 'node .*vite' 2>/dev/null || true

echo "▸ Removing Postgres container '${PG_CONTAINER}'..."
docker rm -f "$PG_CONTAINER" >/dev/null 2>&1 || true

echo "✅ Down."
