# IMPLEMENTATION

**TL;DR**
- Phases 1–3 are built and tested; Phases 4–6 are not started ([ROADMAP](ROADMAP.md)).
- This file is the reference for: status, file map, API table, schema, env vars, change recipes, testing, tech debt.
- The API table and migration list are machine-checked by `backend/scripts/check_docs.py` (CI) — keep them exact.
- Invariants live in [AGENTS.md](../AGENTS.md); design reasons in [ARCHITECTURE.md](ARCHITECTURE.md).
- Setup values: [SETUP_CREDENTIALS.md](SETUP_CREDENTIALS.md). Manual checks: [VERIFY_ON_MY_MACHINE.md](VERIFY_ON_MY_MACHINE.md).
- Backend: 194 pytest tests on local PostgreSQL 16 as `app_user`; frontend: 26 Vitest tests, typecheck and production build; Ruff and ESLint pass. No new Playwright tests were added or run in Phase 3.
- Real Neon, Google OAuth, Render, and Vercel integrations are **NOT VERIFIED HERE** (no credentials were provided).
- Money = decimal strings; dates = `YYYY-MM-DD`; timestamps ISO-8601 UTC.
- All errors: `{"error": {"code": "...", "message": "..."}}`.
- Every private route needs the `dt_session` cookie; mutations need `X-Requested-With: dealtracker`.

## Status
| Area | Status |
|---|---|
| P1 scaffold, Google login, sessions, RLS, PWA shell | done |
| P2 deals/mediators API, sync, summary, settings | done |
| P2 offline-first UI (Dexie, outbox, sync chip, screens, alerts, badge) | done |
| PWA installation flow (Home, Settings, Login, native and manual steps) | done; real install not verified locally |
| P2 tests (pytest, Vitest, Playwright) | done |
| P3 import normalization, jobs, API, wizard, sync pagination, tests | done |
| Real Neon / Google / Render / Vercel run | **NOT VERIFIED HERE** (see VERIFY_ON_MY_MACHINE) |
| P4 admin/audit/support access, P5 polish, P6 push | not started |

## File map
| File | Purpose |
|---|---|
| `backend/app/config.py` | Settings (env), naming constants, human-readable startup errors |
| `backend/app/db.py` | engine, `SessionLocal`, `set_user_context`, `get_user_db`, `UserDB` |
| `backend/app/auth/` | `oauth.py` Google client + safe `next`; `routes.py` login/callback/logout; `deps.py` `current_user`/`Me`; `sessions.py` tokens+cookies; `service.py` users table writes |
| `backend/app/repos/` | `deals.py`, `mediators.py`, `sync.py` — the only access to per-user tables (filter `CURRENT_USER_ID` + RLS) |
| `backend/app/import_normalization.py`, `backend/app/services/imports.py`, `backend/app/repos/imports.py` | pure row normalization and repository-backed import preview/commit/undo |
| `backend/app/services/` | `deals.py` create/update/action/mediator use-cases + `present()`; `sync.py` pull/push/LWW |
| `backend/app/rules.py` | pure rules: urgency, overdue, completed, transitions, validation |
| `backend/app/routes/` | `health`, `me`, `mediators`, `deals`, `sync` (incl. `/api/summary`) |
| `backend/app/clock.py` | single `now()` (tests monkeypatch) |
| `backend/scripts/` | `create_role.py`, `check_setup.py`, `check_docs.py` |
| `frontend/src/config/app.ts` | naming + timeouts |
| `frontend/src/lib/` | `api.ts` fetch wrapper (same-origin, CSRF, 70 s timeout), `money.ts`, `dates.ts`, `rules.ts`, `auth.ts`, `usePwaInstall.tsx` (shared prompt, detection, dismissal, copy link) |
| `frontend/src/components/InstallPrompt.tsx` | Shared Home banner, Settings row, Login link, and platform-specific install sheet |
| `frontend/src/data/` | `db.ts` Dexie + wipe/openFor, `outbox.ts`, `mutations.ts` (all writes), `hooks.ts` (all reads), `types.ts` |
| `frontend/src/sync/engine.ts` | push outbox → pull changes, backoff, status |
| `frontend/src/imports/` | SheetJS worker/parser, header mapping, templates, fake fixtures |
| `frontend/src/pages/` | Login, Home, Deals, DealForm, DealDetail, Mediators (+detail), Settings, ImportPage |
| `frontend/e2e/` | Playwright specs + DB-backed session helper (no backdoor route) |

## API reference
| Method | Path | Auth | Purpose · request → response |
|---|---|---|---|
| GET | `/api/health` | none | liveness, no DB → `{status}` |
| GET | `/api/health/db` | none | `SELECT 1` → `{status}` |
| GET | `/api/auth/google/login` | none | `?next=/path` → 302 to Google (400 `invalid_next`) |
| GET | `/api/auth/google/callback` | none | Google redirect → sets cookie, 302 to `FRONTEND_URL+next` or `/login?error=` |
| POST | `/api/auth/logout` | cookie | deletes session, clears cookie → 204 |
| GET | `/api/me` | session | → `{id,name,email,avatar_url,role,alert_days,timezone}` |
| PATCH | `/api/me/settings` | session | `{alert_days?0-14, timezone?IANA}` → Me |
| DELETE | `/api/me` | session | delete account + all data (cascade) → 204 |
| GET | `/api/mediators` | session | → `[Mediator + pending_refund_amount, open_deal_count]` |
| POST | `/api/mediators` | session | `{name, contact?}` → 201 Mediator (409 `name_exists`) |
| PATCH | `/api/mediators/{mediator_id}` | session | `{name?, contact?}` → Mediator; rename updates deal snapshots |
| DELETE | `/api/mediators/{mediator_id}` | session | soft delete → 204 (deals keep `mediator_name`) |
| GET | `/api/deals` | session | `status, mediator_id, platform, q, date_from, date_to, sort=urgency\|newest\|amount, limit≤200, cursor` → `{items:[Deal], next_cursor}` |
| POST | `/api/deals` | session | DealIn (`client_id?`, `mediator_name?` creates mediator) → 201 Deal, or 200 existing for same `client_id` |
| GET | `/api/deals/{deal_id}` | session | → Deal |
| PATCH | `/api/deals/{deal_id}` | session | partial DealIn → Deal |
| DELETE | `/api/deals/{deal_id}` | session | soft delete → 204 |
| POST | `/api/deals/{deal_id}/action` | session | `{action, payment_received_on?}` → Deal (409 `invalid_transition`) |
| GET | `/api/sync/changes` | session | `?since=ISO&cursor=…&limit=1..500` → `{server_time, deals, mediators, deleted:{deals,mediators}, next_cursor}`; follow pages before advancing the saved sync time |
| POST | `/api/sync/push` | session | `{ops:[≤100 {op_id,type,op,id,client_id?,data,client_updated_at}]}` → `{results:[{op_id,status,reason?,id?}]}` |
| POST | `/api/import/preview` | session | mapped rows and import options → normalized rows, duplicate matches, errors, and reconciliation totals; does not write |
| POST | `/api/import/commit` | session | import id, filename, options, and a batch of up to 500 mapped rows → import job and batch results |
| GET | `/api/import/jobs` | session | → current user's import history |
| GET | `/api/import/jobs/{job_id}` | session | → import job status, counts, totals, and errors |
| GET | `/api/import/jobs/{job_id}/errors.csv` | session | → formula-safe CSV error report |
| POST | `/api/import/jobs/{job_id}/undo` | session | → undo counts and rows that could not be undone because they were edited |
| GET | `/api/summary` | session | → totals (strings), `open_deals, urgent_count, overdue_count, top_mediators[5]` |

Deal response = all columns except `user_id`, plus `net_amount`, `is_urgent`, `is_overdue`, `urgency_reason` (`review_overdue|form_overdue|review_due_soon|form_due_soon|null`).
Action order: `review_done` → `form_submitted` (needs review done) → `payment_received` (needs form submitted; sets date = today in user tz). Reopen in reverse order only.
Status filters: `open` = not completed; `payment_pending` = payment ≠ received; `completed` = review done + form submitted + payment received. `urgent_count` includes overdue.

## Database schema
Migrations: `0001_initial.py` (Phase 1), `0002_phase2_sync.py` (Phase 2), `0003_import_jobs.py` (Phase 3).

| Table | RLS | Key columns / constraints | Indexes |
|---|---|---|---|
| users | no (auth module only) | `google_sub` unique, `role` ∈ user/admin, `alert_days` 0–14 default 2, `timezone` default Asia/Kolkata | pk, unique google_sub |
| sessions | no (auth module only) | `token_hash` unique (SHA-256), `expires_at`, FK users cascade | user_id, expires_at |
| mediators | ENABLE+FORCE | `name` non-blank, `updated_at` trigger, `deleted_at`, `client_updated_at`, unique `(id,user_id)` | unique `(user_id, lower(name)) WHERE deleted_at IS NULL`; `(user_id, updated_at)` |
| deals | ENABLE+FORCE | money `numeric(12,2) ≥ 0`; CHECKs on deal_type/statuses; FK `(mediator_id,user_id)→mediators(id,user_id) ON DELETE SET NULL (mediator_id)`; optional composite FK `(import_job_id,user_id)→import_jobs(id,user_id)`; `mediator_name` snapshot; `updated_at` trigger; `deleted_at`; `client_updated_at` | `(user_id,payment_status)`, `(user_id,review_deadline) WHERE review pending`, `(user_id,refund_form_deadline) WHERE form pending`, `(user_id,date_taken DESC)`, unique `(user_id,client_id) WHERE client_id NOT NULL`, `(user_id,updated_at)`, `(user_id,import_job_id)`, mediator_id |
| sync_ops | ENABLE+FORCE | pk `(user_id, op_id)`, `record_id` — applied push ops (idempotency); old rows are opportunistically removed, up to 500 per push, after 30 days | pk |
| import_jobs | ENABLE+FORCE | `import_id` unique per user; status, row counts, totals, options, errors, created/undone timestamps; composite unique `(id,user_id)` for deal ownership FK | `(user_id,created_at DESC)` |

## Environment variables
| Var | Required | Used by | Value |
|---|---|---|---|
| `ENV` | yes | app | `dev` / `prod` |
| `DATABASE_URL` | yes | app | app_user, **pooled**, `postgresql+psycopg://…?sslmode=require` |
| `MIGRATION_DATABASE_URL` | yes | alembic, create-role | owner, **direct** |
| `TEST_DATABASE_URL` | tests | pytest | app_user, DB name contains `test` |
| `TEST_MIGRATION_DATABASE_URL` | optional | pytest, migrate-test | owner, direct, test DB |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | yes | app | Google OAuth web client |
| `SESSION_SECRET` | yes | app | ≥ 32 random chars |
| `FRONTEND_URL` | yes | app | browser origin, OAuth redirect base |
| `ADMIN_EMAILS` | no | Phase 4 | comma list |
| `RATE_LIMIT_ENABLED` | no | app | default true |
| `APP_USER_PASSWORD` | no | create-role only | else prompted |
| `VITE_API_PROXY_TARGET` | no | Vite dev/preview | default `http://localhost:8000` |
| `E2E_DATABASE_URL`, `E2E_BASE_URL` | e2e | Playwright | test DB (app_user) / default `http://localhost:4173` |

## Recipes
**Add a per-user table:** migration with `user_id … ON DELETE CASCADE`, ENABLE+FORCE RLS, the standard policy, `GRANT … TO app_user` DO-block (copy `0002`); model in `models.py`; repo in `app/repos/` filtering `CURRENT_USER_ID`; isolation tests (other user / no context / cross insert / cross update-delete); update schema table here.
**Add an endpoint:** schema in `schemas.py` (`Strict` base) → service in `app/services/` → route using `Me` and `UserDB`; add a row to the API table (CI checks); tests incl. isolation.
**Add a migration:** `alembic revision -m "…"`, rename to `000N_name.py`, set `revision="000N"`, raw SQL + downgrade; mention the file here; `dt migrate` + `dt migrate-test`.
**Rename the app:** edit `APP_NAME`/`APP_SLUG` (and `COOKIE_PREFIX` if wanted) in `backend/app/config.py` and `frontend/src/config/app.ts`; keep `CSRF_HEADER_VALUE` equal on both sides; update `SESSION_COOKIE` in `frontend/e2e/helpers.ts`; manifest and `<title>` follow automatically. Changing the slug changes the local DB name (users re-sync once) and cookie names (users log in again).
**Add a screen:** page in `src/pages/`, route in `App.tsx`, read via `data/hooks.ts`, write via `data/mutations.ts`, `data-testid` on every control, empty/loading states.

## Testing
- `dt test` → pytest (refuses unless `TEST_DATABASE_URL` DB name contains `test`; asserts `current_user = app_user`; deletes its `test-%` users before/after) + typecheck + Vitest.
- Phase 3 verification: 194 backend tests on native PostgreSQL 16 as `app_user`, 26 Vitest tests, TypeScript typecheck, production build, Ruff, ESLint, and `backend/scripts/check_docs.py` passed. No Playwright tests were added or run in Phase 3.
- Suites: `test_isolation` (RLS at SQL level), `test_deals_api` (endpoints, filters, cursor, summary fixture, isolation, tz boundary), `test_sync` (push/pull, op_id, LWW, isolation), `test_auth` (mocked Google), `test_route_auth` (every private route needs a session), `test_data_access_scan`, `test_rules`, `test_api`.
- E2E: API running with `DATABASE_URL` = test DB, `yarn build && yarn preview`, `E2E_DATABASE_URL=… yarn e2e`. Sessions are inserted into the DB; there is no login bypass route.
- PWA installation cannot be fully verified locally: real installation can only be verified on a deployed HTTPS URL on a real phone. The manifest includes the 390×844 light and dark Home screenshots, and Workbox precaches the app shell plus install screenshots.

## Known issues / tech debt
- Rate limits are in-memory per instance and trust forwarded headers (TODO in `app/security.py`).
- LWW uses device clocks (offset-corrected by server time on each pull); concurrent edits on two devices: last writer wins per record.
- `sync_ops` cleanup is opportunistic: pushes remove at most 500 rows older than 30 days, so quiet accounts can retain older entries. Sync pulls are paginated at 500 rows.
- Settings changes need a connection (not queued offline). Logout needs a connection (keeps local data otherwise).
- Ruff and ESLint run in CI and through `dt lint`. Lighthouse no longer has a PWA category; installability is checked manually.
