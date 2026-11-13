# IMPLEMENTATION

**TL;DR**
- Phases 1–3 are built; Phase 5 polish is in progress, while Phase 4 admin and Phase 6 web push are not started ([ROADMAP](ROADMAP.md)).
- This file is the reference for: status, file map, API table, schema, env vars, change recipes, testing, tech debt.
- The API table and migration list are machine-checked by `backend/scripts/check_docs.py` (CI) — keep them exact.
- Invariants live in [AGENTS.md](../AGENTS.md); design reasons in [ARCHITECTURE.md](ARCHITECTURE.md).
- Setup values: [SETUP_CREDENTIALS.md](SETUP_CREDENTIALS.md). Manual checks: [VERIFY_ON_MY_MACHINE.md](VERIFY_ON_MY_MACHINE.md).
- Per-user API tests require a configured `TEST_DATABASE_URL` and run as `app_user`; frontend checks are typecheck, Vitest, lint, and production build.
- Real Neon, Google OAuth, Render, and Vercel integrations are **NOT VERIFIED HERE** (no credentials were provided).
- Money = decimal strings; dates = `YYYY-MM-DD`; timestamps ISO-8601 UTC.
- Deal money uses `net refund = amount_paid - less_amount + commission`; `refund_amount` is a generated response/database value, while `net_amount = commission - less_amount`.
- All errors: `{"error": {"code": "...", "message": "..."}}`.
- Every private route needs the local `dt_session` cookie or production `__Host-dt_session`; sessions expire after 30 days idle or 90 days absolute. Mutations need `X-Requested-With: dealbook`.
- Auth limits are IP-keyed; authenticated limits and stricter import/sync-push limits are user-keyed. All limits are in-memory per instance, and forwarded-IP trust through Vercel/Render must be verified after deployment.
- API request bodies are limited to 1 MiB by default, 512 KiB for sync push, and 5 MiB for imports (the global ceiling). Sync operation data is bounded; request transactions also set 15-second statement and 30-second idle-transaction timeouts.
- The API runs without the owner migration URL. Run migrations locally before deploying; migration 0005 applies the runtime grants and role-level timeouts.

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
| P4 admin/audit/support access | not started |
| P5 visual and interaction polish | in progress |
| P6 optional web push | not started |

## File map
| File | Purpose |
|---|---|
| `backend/app/config.py` | Settings (env), naming constants, human-readable startup errors |
| `backend/app/db.py` | engine, `SessionLocal`, `set_user_context`, `get_user_db`, `UserDB` |
| `backend/app/auth/` | `oauth.py` Google client + safe `next`; `routes.py` login/callback/logout; `deps.py` `current_user`/`Me`; `sessions.py` tokens+cookies; `service.py` users table writes |
| `backend/app/repos/` | `deals.py`, `mediators.py`, `sync.py`, `imports.py` — the only access to per-user tables (filter `CURRENT_USER_ID` + RLS) |
| `backend/app/import_normalization.py`, `backend/app/services/imports.py`, `backend/app/repos/imports.py` | pure row normalization and repository-backed import preview/commit/undo |
| `backend/app/services/` | `deals.py` create/update/action/mediator use-cases + `present()`; `sync.py` pull/push/LWW |
| `backend/app/rules.py` | pure rules: urgency, overdue, completed, transitions, validation |
| `backend/app/routes/` | `health`, `me`, `mediators`, `deals`, `sync` (incl. `/api/summary`) |
| `backend/app/clock.py` | single `now()` (tests monkeypatch) |
| `backend/scripts/` | `create_role.py`, `check_setup.py`, `check_docs.py` |
| `frontend/src/config/app.ts` | naming + timeouts |
| `frontend/src/lib/` | `api.ts` fetch wrapper (same-origin, CSRF, 70 s timeout), `money.ts`, `dates.ts`, `rules.ts`, `dealNumbers.ts`, `auth.ts`, `usePwaInstall.tsx` (shared prompt, detection, dismissal, copy link) |
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
| POST | `/api/deals` | session | DealIn (`amount_paid`, `less_amount?`, `commission?`; legacy `refund_amount?` is deprecated; `client_id?`, `mediator_name?` creates mediator) → 201 Deal, or 200 existing for same `client_id` |
| GET | `/api/deals/{deal_id}` | session | → Deal |
| PATCH | `/api/deals/{deal_id}` | session | partial DealIn (`amount_paid`, `less_amount?`, `commission?`; deprecated legacy `refund_amount?` supported) → Deal |
| DELETE | `/api/deals/{deal_id}` | session | soft delete → 204 |
| POST | `/api/deals/{deal_id}/action` | session | `{action, payment_received_on?}` → Deal (409 `invalid_transition`) |
| GET | `/api/sync/changes` | session | `?since=ISO&cursor=…&limit=1..500` → `{server_time, deals, mediators, deleted:{deals,mediators}, next_cursor}`; follow pages before advancing the saved sync time |
| POST | `/api/sync/push` | session | `{ops:[≤100 {op_id,type,op,id,client_id?,data,client_updated_at}]}`; request ≤512 KiB and stricter 30/minute per user; each data object ≤50 total keys, depth ≤4, arrays ≤100, keys ≤128 chars, strings ≤2,000 chars; legacy queued `refund_amount` is deprecated but converted → `{results:[{op_id,status,reason?,id?}]}` |
| POST | `/api/import/preview` | session | ≤5 MiB and 30/hour per user; mapped rows and import options → normalized rows, duplicate matches (including matching deal ID for local numbering), errors, and reconciliation totals; does not write |
| POST | `/api/import/commit` | session | ≤5 MiB and 10/hour per user; import id, filename, options, and a batch of up to 500 mapped rows → import job and batch results |
| GET | `/api/import/jobs` | session | → current user's import history |
| GET | `/api/import/jobs/{job_id}` | session | → import job status, counts, totals, and errors |
| GET | `/api/import/jobs/{job_id}/errors.csv` | session | → formula-safe CSV error report |
| POST | `/api/import/jobs/{job_id}/undo` | session | → undo counts and rows that could not be undone because they were edited |
| GET | `/api/summary` | session | → `total_paid, refund_pending_amount, refund_received_amount, gain_loss, open_deals, urgent_count, overdue_count, top_mediators[5]` (money as strings) |

Deal requests use `amount_paid` (P), `less_amount` (L, default 0), and `commission` (C, default 0), with `0 ≤ L ≤ P`, `C ≥ 0`, and net refund `P - L + C`. For compatibility, POST `/api/deals`, PATCH, and `/api/sync/push` still accept the deprecated legacy `refund_amount` (R): convert to `L = max(P - R, 0)` and `C = old C + max(R - P, 0)`. When the new Less field is supplied, it takes precedence over legacy refund conversion. New clients must not send a refund amount as an input.

Deal responses include decimal-string `amount_paid`, `less_amount`, `commission`, and generated `refund_amount` (the net refund); `net_amount` is `commission - less_amount` (gain/loss). Summary Paid sums amount paid; pending and received sum net refunds by payment status; Gain/loss sums commission minus less. Deal responses also include `is_urgent`, `is_overdue`, and `urgency_reason` (`review_overdue|form_overdue|review_due_soon|form_due_soon|null`).
Action order: `review_done` → `form_submitted` (needs review done; keeps a filled date the user already entered, otherwise stamps today) → `payment_received` (needs form submitted; keeps an entered received date, otherwise today in user tz). Reopen in reverse order only on the latest completed step (`reopen_form` clears `refund_form_filled_on`, `reopen_payment` clears `payment_received_on`); the deal detail timeline shows an Undo button for that step.

The refund-form filled date (`refund_form_filled_on`) is free to edit on any deal, not only submitted forms; it must not be before `date_taken` and should not be after `payment_received_on`.

Sync push ops are full snapshots: every deal upsert carries the whole record (minus server-owned columns) plus `client_id`, so the server can create a deal it never received instead of rejecting a partial edit. When a newer op for a deal applies, the client drops older rejected ops for the same deal. A bare patch for a missing record is rejected as `missing: …`.
Status filters: `open` = not completed; `payment_pending` = payment ≠ received; `completed` = review done + form submitted + payment received. `urgent_count` includes overdue.

## Database schema
Migrations: `0001_initial.py` (Phase 1), `0002_phase2_sync.py` (Phase 2), `0003_import_jobs.py` (Phase 3), `0004_deal_less_amount.py` (Less/commission net-refund model), `0005_runtime_privileges_and_timeouts.py` (runtime grants and database timeouts), `0006_deal_types.py` (Only order and Negative review deal types), `0007_refund_form_filled_on.py` (form filled date).

| Table | RLS | Key columns / constraints | Indexes |
|---|---|---|---|
| users | no (auth module only) | `google_sub` unique, `role` ∈ user/admin, `alert_days` 0–14 default 2, `timezone` default Asia/Kolkata | pk, unique google_sub |
| sessions | no (auth module only) | `token_hash` unique (SHA-256), `expires_at`, FK users cascade | user_id, expires_at |
| mediators | ENABLE+FORCE | `name` non-blank, `updated_at` trigger, `deleted_at`, `client_updated_at`, unique `(id,user_id)` | unique `(user_id, lower(name)) WHERE deleted_at IS NULL`; `(user_id, updated_at)` |
| deals | ENABLE+FORCE | `amount_paid`, `less_amount`, `commission` are `numeric(12,2)`; checks `amount_paid ≥ 0`, `0 ≤ less_amount ≤ amount_paid`, `commission ≥ 0`; `refund_amount` is stored generated `amount_paid - less_amount + commission`; CHECKs on deal_type/statuses; `refund_form_filled_on` is free to edit but not before `date_taken` (app rule); FK `(mediator_id,user_id)→mediators(id,user_id) ON DELETE SET NULL (mediator_id)`; optional composite FK `(import_job_id,user_id)→import_jobs(id,user_id)`; `mediator_name` snapshot; `updated_at` trigger; `deleted_at`; `client_updated_at` | `(user_id,payment_status)`, `(user_id,review_deadline) WHERE review pending`, `(user_id,refund_form_deadline) WHERE form pending`, `(user_id,date_taken DESC)`, unique `(user_id,client_id) WHERE client_id NOT NULL`, `(user_id,updated_at)`, `(user_id,import_job_id)`, mediator_id |
| sync_ops | ENABLE+FORCE | pk `(user_id, op_id)`, `record_id` — applied push ops (idempotency); old rows are opportunistically removed, up to 500 per push, after 30 days | pk |
| import_jobs | ENABLE+FORCE | `import_id` unique per user; status, row counts, totals, options, errors, created/undone timestamps; composite unique `(id,user_id)` for deal ownership FK; jobs older than 90 days are pruned at most 100 per new import commit | `(user_id,created_at DESC)` |

Migration 0004 backfills Less as `greatest(amount_paid - old_refund_amount, 0)`; rows with an old refund above amount paid instead add the excess to commission and set Less to zero. This preserves old total money back (`old refund_amount + old commission`). The migration emits counts for both branches as PostgreSQL NOTICEs. Downgrade recreates a normal `refund_amount` with the previous total semantics; the SQL comment documents that the separate Less/commission breakdown is lost.

Migration 0005 revokes table privileges from `app_user` across the public schema, then grants only SELECT/INSERT/UPDATE/DELETE on the six application tables. It also removes broad default table grants for the migration role and sets role-level `statement_timeout=15s` and `idle_in_transaction_session_timeout=30s`. `get_user_db` repeats the timeouts with transaction-local `set_config` for pooled connections. The downgrade restores prior broad DML grants and resets those role settings. `users` and `sessions` remain outside RLS and accessible to the auth module; this is an accepted isolation risk.

Migration 0006 replaces the `deals_deal_type_check` constraint so `deal_type` also accepts `only_order` and `negative_review`. The downgrade maps those rows to `other` before restoring the previous list.

Migration 0007 adds nullable `deals.refund_form_filled_on` (the date the form was actually sent, stamped by the `form_submitted` action and editable afterwards). Downgrade drops the column.

## Money, imports, and deal numbers
- Spreadsheet import accepts Less headers `less`, `deduction`, `discount`, `cut`, and `mediator less` (alongside the `less_amount` target) and keeps Commission. If only legacy Refund is mapped, each row derives Less and Commission by the legacy conversion rule and shows that derivation in preview. If Less is mapped, it wins; a Refund mismatch is a warning. Import reconciliation totals are Paid, Net refund, and Gain/loss.
- Dexie schema version 2 upgrades stored deals and queued upsert payloads from legacy `refund_amount` to `less_amount` and `commission` using the same conversion. This preserves queued offline edits; `op_id` idempotency and sync behavior are unchanged.
- Deal number N is computed locally over the complete non-deleted deal list ordered by `date_taken`, then `created_at`, then `id`. Filters never renumber results; `12` and `#12` search for deal 12. The number can shift when a deal is deleted or its date changes.

## Environment variables
| Var | Required | Used by | Value |
|---|---|---|---|
| `ENV` | yes | app | `dev` / `prod` |
| `DATABASE_URL` | yes | app | app_user, **pooled**, `postgresql+psycopg://…?sslmode=require` |
| `MIGRATION_DATABASE_URL` | yes (local tooling only) | alembic, create-role | owner, **direct**; never Render |
| `TEST_DATABASE_URL` | tests | pytest | app_user; DB name contains `test`, or the DB lives on a separate host (Neon branch) |
| `TEST_MIGRATION_DATABASE_URL` | pytest + migrations | pytest, migrate-test | owner, direct, same test DB as `TEST_DATABASE_URL`; used for migrations and revision checks |
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
**Rename the app:** edit `APP_NAME`/`APP_SLUG` (and `COOKIE_PREFIX` if wanted) in `backend/app/config.py` and `frontend/src/config/app.ts`; keep `CSRF_HEADER_VALUE` equal on both sides; update `frontend/public/theme-init.js` and `SESSION_COOKIE` in `frontend/e2e/helpers.ts`; manifest and `<title>` follow automatically. Changing the slug changes the local DB name and storage keys (users re-sync once); changing `COOKIE_PREFIX` also logs users out.
**Add a screen:** page in `src/pages/`, route in `App.tsx`, read via `data/hooks.ts`, write via `data/mutations.ts`, `data-testid` on every control, empty/loading states.

## Testing
- `dt test` → pytest (refuses the app database unless `TEST_DATABASE_URL` names a `test` database or a separate host; asserts `current_user = app_user`; deletes its `test-%` users before/after) + typecheck + Vitest.
- Database-backed migration and API verification requires the configured test database: upgrade, downgrade, and re-upgrade; generated-column cases; RLS and composite-FK checks; and API isolation tests. Record database-derived backfill counts when running migration 0004; counts are not available without applying it to the target database.
- The frontend includes unit coverage for money breakdowns, Dexie upgrade conversion, and deal numbering (date/created/id ties, filtered subsets, and deletion renumbering). Run `yarn typecheck`, `yarn test`, `yarn lint`, and `yarn build` from `frontend/`.
- Suites: `test_isolation` (RLS at SQL level), `test_deals_api` (endpoints, filters, cursor, summary fixture, isolation, tz boundary), `test_sync` (push/pull, op_id, LWW, isolation), `test_auth` (mocked Google), `test_route_auth` (every private route needs a session), `test_data_access_scan`, `test_rules`, `test_api`.
- E2E: API running with `DATABASE_URL` = test DB, `yarn build && yarn preview`, `E2E_DATABASE_URL=… yarn e2e`. Sessions are inserted into the DB; there is no login bypass route.
- PWA installation cannot be fully verified locally: real installation can only be verified on a deployed HTTPS URL on a real phone. The manifest includes the 390×844 light and dark Home screenshots, and Workbox precaches the app shell plus install screenshots.
- The import page, parser worker, and XLSX code are lazy chunks and are included in the Workbox precache; parser workers terminate on cancellation, error, timeout, or page exit.

## Known issues / tech debt
- Rate limits are in-memory per instance. Auth endpoints use forwarded-IP limits; authenticated routes, imports, and sync push use per-user limits. Verify forwarded-IP trust from Vercel through Render after deployment.
- `SECURITY.md`, `docs/SECURITY_AUDIT.md`, and `docs/SCALABILITY.md` contain reporting, approved residual risks, and the measurements still needed.
- LWW uses device clocks (offset-corrected by server time on each pull); concurrent edits on two devices: last writer wins per record.
- `sync_ops` cleanup is opportunistic: pushes remove at most 500 rows older than 30 days. `import_jobs` cleanup runs on new imports and removes at most 100 jobs older than 90 days. Quiet accounts can retain older entries until the next applicable operation. Sync pulls are paginated at 500 rows.
- Settings changes need a connection (not queued offline). Logout needs a connection (keeps local data otherwise).
- Ruff and ESLint run in CI and through `dt lint`. Lighthouse no longer has a PWA category; installability is checked manually.
