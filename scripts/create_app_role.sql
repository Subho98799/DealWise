-- Creates the restricted runtime role "app_user". TEMPLATE: never put a real password in this file.
-- Preferred: run `scripts/dt.sh create-role` / `scripts\dt.ps1 create-role`, which fills the placeholder
-- from APP_USER_PASSWORD (or a prompt) and runs this as the OWNER role (MIGRATION_DATABASE_URL).
-- Manual (e.g. Neon SQL editor, as the owner): replace __APP_USER_PASSWORD__ in your copy only, then run.
-- Safe to run more than once; run it on every database the app uses (app and test).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

ALTER ROLE app_user WITH LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD '__APP_USER_PASSWORD__';

GRANT USAGE ON SCHEMA public TO app_user;
