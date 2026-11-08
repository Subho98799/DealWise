# DealTracker — PRD

## Original problem statement
Build PHASE 1 of "DealTracker", a multi-user, mobile-first PWA for Indian review-deal users (INR): project scaffold, Google login, isolated per-user data layer (Postgres RLS), PWA shell. Standard open tech only (FastAPI/SQLAlchemy/Alembic/psycopg3/Authlib/slowapi + Vite/React18/TS/Tailwind/TanStack Query/vite-plugin-pwa, Postgres 16 / Neon, Render + Vercel). Full spec in the user's first message (Steps 1–9 + acceptance checklist). Do not start Phase 2.

## User choices
- Standalone repo in /app/dealtracker, tested here against a real Postgres 16 (no Docker in workspace)
- Google OAuth keys added later by the user on their laptop; login verified with mocked Google in tests

## Architecture
- backend/: FastAPI; app/auth (only module touching users/sessions), app/repos (only access to deals/mediators), get_user_db sets transaction-local app.current_user_id; RLS ENABLE+FORCE on deals/mediators; runtime role app_user (NOBYPASSRLS)
- frontend/: Vite React PWA, same-origin /api only, Vite proxy (dev) / Vercel rewrite (prod)
- Git history: separate git dir /app/.dealtracker-git (work tree /app/dealtracker) + /app/dealtracker-history.bundle

## Implemented (2026-06)
- Steps 1–9 complete, 9 commits (one per step)
- 43 pytest tests pass as app_user (isolation, auth, CSRF, rate limit, health, scan)
- Frontend typecheck + build pass; shell verified in browser (login gate, home, settings, delete confirm, logout)

## Backlog
- P0 Phase 2: deals & mediators CRUD, offline-first quick add, status taps, filters, summary, deadline alerts
- P1 Phase 3: Excel import with column mapping
- P1 Phase 4: admin dashboard, isolation self-test, time-limited support access, audit log
- P2 Phase 5 UI polish, Phase 6 web push
