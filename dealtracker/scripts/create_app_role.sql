-- Creates the restricted runtime role "app_user".
-- Run this as the database OWNER role (the same role that runs Alembic migrations),
-- connected to the app database. It is safe to run more than once.
--
-- PLACEHOLDER PASSWORD: 'app_user_local_dev' is for local Docker only.
-- On Neon / any shared host, replace it with a long random password BEFORE running,
-- or run afterwards:  ALTER ROLE app_user PASSWORD '<long-random-password>';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user LOGIN PASSWORD 'app_user_local_dev'
      NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

-- Re-assert the restrictions in case the role already existed with other attributes.
ALTER ROLE app_user NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;

GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;

-- Applies to tables created later by the role running this script (the owner / migrations role).
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
