#!/usr/bin/env bash
# DealTracker helper for macOS/Linux. Usage: scripts/dt.sh <command>
#   install       create backend venv + install deps, install frontend deps, create blank .env files
#   create-role   create/refresh app_user on the app database (asks for its password)
#   create-role-test   same on the test database (TEST_MIGRATION_DATABASE_URL)
#   migrate       alembic upgrade head as the owner (MIGRATION_DATABASE_URL)
#   migrate-test  alembic upgrade head on the test database (TEST_MIGRATION_DATABASE_URL)
#   test          backend pytest (TEST_DATABASE_URL) + frontend typecheck/vitest
#   backend       run the API on :8000        frontend   run the app on :5173
#   check         run check_setup             docs       doc-freshness check
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PY="$ROOT/backend/.venv/bin/python"
cd "$ROOT/backend"
case "${1:-help}" in
  install)
    python3 -m venv .venv && "$PY" -m pip install -q -r requirements-dev.txt
    [ -f .env ] || grep -E '^[A-Z_]+=' .env.example | sed 's/=.*/=/' > .env
    cd "$ROOT/frontend" && yarn install && { [ -f .env ] || grep -E '^[A-Z_]+=' .env.example | sed 's/=.*/=/' > .env; } ;;
  create-role) "$PY" scripts/create_role.py ;;
  create-role-test) "$PY" scripts/create_role.py --test ;;
  migrate) "$PY" -m alembic upgrade head ;;
  migrate-test)
    MIGRATION_DATABASE_URL="$("$PY" -c 'import sys; sys.path.insert(0,"scripts"); from _common import env; print(env("TEST_MIGRATION_DATABASE_URL") or "")')" \
      "$PY" -m alembic upgrade head ;;
  test) "$PY" -m pytest -q && cd "$ROOT/frontend" && yarn typecheck && yarn test ;;
  backend) "$PY" -m uvicorn app.main:app --reload --port 8000 ;;
  frontend) cd "$ROOT/frontend" && yarn dev ;;
  check) "$PY" scripts/check_setup.py ;;
  docs) "$PY" scripts/check_docs.py ;;
  *) sed -n '2,12p' "$0" ;;
esac
