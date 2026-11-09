# AGENTS.md — start here (humans and AI tools)

## Project in 5 lines
- Mobile-first, offline-first PWA for Indian "review deal" users: buy product → review → mediator refunds. Currency INR.
- Users sign in with Google (own Authlib flow, no third-party auth service). Multi-user; **per-user isolation is the #1 requirement**.
- Backend: FastAPI + SQLAlchemy 2 + Alembic + PostgreSQL (Neon) with row-level security; runtime connects as restricted `app_user`.
- Frontend: React 18 + TS + Vite + Tailwind PWA; reads a local IndexedDB replica (Dexie), writes via an outbox synced to `/api/sync`.
- Status: Phases 1–3 done. Next: Phase 4 (admin and audit). See [docs/ROADMAP.md](docs/ROADMAP.md).

## Stack
Python 3.12, FastAPI 0.162 + Starlette 1.10, SQLAlchemy 2, Alembic, psycopg 3, Authlib, pydantic v2, python-dotenv 1.2, slowapi, pytest · Node 20.19+, Vite 5, React 18, TS 5, Tailwind 3, React Router 6, TanStack Query 5, Dexie 4, vite-plugin-pwa, Vitest, ESLint, Playwright · Postgres 16 / Neon · Render (API) + Vercel (SPA + `/api` rewrite).

## Commands
`dt` = `scripts/dt.sh <cmd>` (bash/macOS/Linux) or `.\scripts\dt.ps1 <cmd>` (Windows PowerShell). Same commands on both.

Run migrations from your own computer with the owner URL before deploying a release that needs them. Never configure the owner URL or `MIGRATION_DATABASE_URL` in Render; the API runtime must use only the restricted `app_user` URL.

| Task | Command |
|---|---|
| First-time setup (venv, deps, blank `.env` files) | `dt install` |
| Create/refresh `app_user` role (app DB / test DB) | `dt create-role` / `dt create-role-test` |
| Migrate (owner URL) app DB / test DB | `dt migrate` / `dt migrate-test` |
| Check configuration (PASS/FAIL, prints no secrets) | `dt check` (= `scripts/check_setup.sh` / `.ps1`) |
| Run API :8000 / app :5173 | `dt backend` / `dt frontend` |
| Backend tests + frontend typecheck + Vitest | `dt test` |
| E2E (needs API on a TEST DB + `yarn build && yarn preview`) | `cd frontend && yarn e2e` |
| Doc freshness | `dt docs` |
| New migration | `cd backend && .venv/bin/alembic revision -m "msg"` (Windows: `.venv\Scripts\alembic`) then hand-write SQL |
| Lint (backend) | `cd backend && ruff check app tests scripts` |
| Lint (frontend) | `cd frontend && yarn lint` |
| Lint (both) | `dt lint` |

## NON-NEGOTIABLE INVARIANTS
1. **User identity comes only from the server-side session** (`current_user` / `Me`). Never read a user id from body, query or path. Request schemas use `extra="forbid"`.
2. **Every per-user table**: `user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE`, `ENABLE` + `FORCE ROW LEVEL SECURITY`, one `FOR ALL` policy with `USING` and `WITH CHECK` = `user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid`. Add isolation tests.
3. **Per-user data only through `app/repos/*` inside `get_user_db`** (one transaction, `set_config(..., true)`). Routes never touch sessions/SQL (enforced by `tests/test_data_access_scan.py`). `users`/`sessions` only via `app/auth/`.
4. **Runtime role is `app_user`** (NOSUPERUSER, NOBYPASSRLS). Owner role only for migrations. Never connect the app as the owner.
5. **Money**: `numeric(12,2)` in DB, decimal **string** in JSON (`"1299.00"`), integer paise in frontend math. Floats are rejected. Dates are `DATE`, timestamps `timestamptz` UTC, "today" in the user's timezone.
6. Browser calls **same-origin `/api` only**; mutating requests need `X-Requested-With: dealtracker` (CSRF).
7. Every private `/api` route depends on `current_user` (enforced by `tests/test_route_auth.py`). **No auth bypass/test-login route may exist.**
8. Never log or commit secrets, tokens, cookies or full emails. `.env` files are git-ignored; CI fails if one is tracked.
9. Naming lives in one place: backend `app/config.py` (`APP_NAME`, `COOKIE_PREFIX`, `CSRF_HEADER_VALUE`), frontend `src/config/app.ts`.
10. Service worker never caches `/api`.
11. Rate limits are per instance: auth endpoints use forwarded IP, authenticated routes use user ID. Verify forwarded-IP trust through Vercel and Render after deployment; do not assume the proxy chain is trusted.
12. API request bodies are limited to 1 MiB by default, 512 KiB for sync push, and 5 MiB for imports (also the global ceiling). Sync operation data has bounded keys, depth, arrays, and strings.

## Repo map
- `backend/app/` FastAPI app: `config` settings+names, `db` engine+`get_user_db`, `auth/` Google login+sessions, `repos/` only table access, `services/` use-cases, `routes/` HTTP, `rules.py` pure business rules, `schemas.py` pydantic I/O.
- `backend/alembic/versions/` hand-written SQL migrations. `backend/tests/` pytest on real Postgres as `app_user`. `backend/scripts/` setup/check/docs scripts.
- `frontend/src/` `config/` names, `lib/` api/money/dates/rules, `data/` Dexie db+outbox+mutations+hooks, `sync/` engine, `components/`, `pages/`. `frontend/e2e/` Playwright.
- `scripts/` `dt.sh`, `dt.ps1`, `check_setup.*`, `create_app_role.sql` template. `docs/` architecture, implementation, roadmap, design, setup guides.

## Conventions
- Backend: thin routes → `services/` → `repos/`. Raise `AppError(status, code, message)`; errors are `{"error":{"code","message"}}`. Business rules in `app/rules.py` (pure), mirrored in `frontend/src/lib/rules.ts`; change both + tests.
- Migrations: raw SQL via `op.execute`, text + CHECK instead of enums, always a `downgrade`.
- Frontend: UI reads Dexie via hooks in `data/hooks.ts`; writes via `data/mutations.ts` only (never `fetch` directly; use `lib/api.ts`). Styling uses CSS variables from `src/styles/tokens.css` and the shared UI components. Keep raw hex colors in `tokens.css`; `yarn lint` enforces this. Inter and Plus Jakarta Sans are bundled; use Lucide for icons. The app column is 480px maximum on desktop and supports System, Light, and Dark appearance modes. Every interactive element has a `data-testid`.
- Small components, no comments beyond one-liners, no new dependency without need.
- Security findings, reporting guidance, and unmeasured capacity limits live in [SECURITY.md](SECURITY.md), [docs/SECURITY_AUDIT.md](docs/SECURITY_AUDIT.md), and [docs/SCALABILITY.md](docs/SCALABILITY.md).

## Definition of done
Tests pass (`dt test`, e2e if UI flow changed) · migration included for schema changes (with RLS if per-user) · isolation tests for new per-user data · `docs/IMPLEMENTATION.md` (API table, schema, status) and `CHANGELOG.md` updated · `dt docs` passes · no secrets.

## Docs
[ARCHITECTURE](docs/ARCHITECTURE.md) · [IMPLEMENTATION](docs/IMPLEMENTATION.md) · [ROADMAP](docs/ROADMAP.md) · [SECURITY](SECURITY.md) · [SECURITY_AUDIT](docs/SECURITY_AUDIT.md) · [SCALABILITY](docs/SCALABILITY.md) · [SETUP_CREDENTIALS](docs/SETUP_CREDENTIALS.md) · [VERIFY_ON_MY_MACHINE](docs/VERIFY_ON_MY_MACHINE.md) · [CHANGELOG](CHANGELOG.md)
