#!/bin/sh
# Drop from root to an unprivileged user before running the app, so the network-facing
# uvicorn process is never root. Only this short setup runs as root.
#
# PUID/PGID let the container match the owner of the bind-mounted data volume, so the
# SQLite database stays writable and its files keep the host user's ownership. Defaults
# match the walflow user baked into the image.
set -e

PUID="${PUID:-1000}"
PGID="${PGID:-1000}"

# The directory that holds the database (DATABASE_PATH points at a file inside it).
DB_DIR="$(dirname "${DATABASE_PATH:-/app/data/walflow.db}")"
mkdir -p "$DB_DIR"
# Best effort: a read-only or already-correct volume must not stop startup.
chown -R "$PUID:$PGID" "$DB_DIR" 2>/dev/null || true

# gosu accepts numeric uid:gid directly, so no matching passwd entry is required.
exec gosu "${PUID}:${PGID}" "$@"
