#!/bin/sh
# Runs once, on the first start of an empty Postgres volume.
# Creates the app database and a separate test database, then the restricted app_user role.
set -eu

for db in dealtracker dealtracker_test; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
    -c "CREATE DATABASE $db"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$db" \
    -f /scripts/create_app_role.sql
done
