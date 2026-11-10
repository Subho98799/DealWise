#!/bin/sh
# OPTIONAL Docker path only. Runs once on the first start of an empty volume.
set -eu
PW="${APP_USER_PASSWORD:?APP_USER_PASSWORD must be set (docker compose reads it from your shell)}"
for db in dealbook dealbook_test; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres -c "CREATE DATABASE $db"
  sed "s/__APP_USER_PASSWORD__/$PW/" /scripts/create_app_role.sql | \
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$db"
done
