#!/bin/sh
# Drop from root to an unprivileged user before running the app, so the network-facing
# uvicorn process is never root. Only this short setup runs as root.
#
# PUID/PGID set the user the app runs as. Left unset, it takes the non-root owner of the
# data folder, so an upgrade never takes the files away from the host user. A new or
# root-owned folder goes to the walflow user baked into the image (1000).
set -e

# Already unprivileged (compose "user:"): nothing to set up and no root to drop.
if [ "$(id -u)" != "0" ]; then
    exec "$@"
fi

# The directory that holds the database (DATABASE_PATH points at a file inside it).
DB_FILE="${DATABASE_PATH:-/app/data/walflow.db}"
DB_DIR="$(dirname "$DB_FILE")"
mkdir -p "$DB_DIR"

# Prints the data folder's owner id (stat format %u or %g), or 1000 when root owns it.
owner_id() {
    id_value="$(stat -c "$1" "$DB_DIR")"
    if [ "$id_value" = "0" ]; then echo 1000; else echo "$id_value"; fi
}

PUID="${PUID:-$(owner_id %u)}"
PGID="${PGID:-$(owner_id %g)}"

# Only a warning: a volume that refuses chown (NFS root_squash, CIFS) may already be writable.
if ! chown -R "$PUID:$PGID" "$DB_DIR"; then
    echo "WARNING: could not change the owner of $DB_DIR to $PUID:$PGID." >&2
fi

# Stop with a clear message here instead of SQLite's "unable to open database file" later.
if ! gosu "$PUID:$PGID" test -w "$DB_DIR" || { [ -e "$DB_FILE" ] && ! gosu "$PUID:$PGID" test -w "$DB_FILE"; }; then
    echo "ERROR: user $PUID:$PGID cannot write to the database in $DB_DIR. Check the folder's owner, PUID/PGID and the mount options." >&2
    exit 1
fi

# gosu accepts numeric uid:gid directly, so no matching passwd entry is required.
exec gosu "${PUID}:${PGID}" "$@"
