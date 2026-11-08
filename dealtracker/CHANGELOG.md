# Changelog

## Phase 2 — deals, mediators, offline sync (2026-06)
### Added
- Migration `0002_phase2_sync.py`: `users.alert_days`, `users.timezone`; `deals.mediator_name` snapshot, `deals.client_updated_at`, index `(user_id, updated_at)`; `mediators.updated_at` (trigger), `deleted_at`, `client_updated_at`, partial unique name; `sync_ops` (RLS).
- API: mediators CRUD with stats, deals list (filters, sort, cursor) / idempotent create / patch / soft delete / one-tap actions, `/api/sync/changes`, `/api/sync/push` (op_id idempotent, last-write-wins), `/api/summary`, `/api/me/settings`.
- `app/rules.py` pure business rules (urgency, overdue, transitions, validation) + frontend mirror.
- Offline-first frontend: Dexie replica, outbox, sync engine (backoff, 70 s cold-start timeout, status chip), account wipe on logout/switch/delete.
- Screens: Home summary + alerts, Deals (chips/search/sort/one-tap + Undo), quick-add, detail/edit, Mediators, Settings; Deals badge + `setAppBadge`.
- Tests: endpoint + sync isolation, idempotency, LWW, rules, summary fixture, route-auth coverage; Vitest; Playwright e2e.
- No-Docker setup scripts (`dt.sh`/`dt.ps1`), `check_setup`, `create_role` from template, doc-freshness check, CI `.env` guard, handoff docs.
### Changed
- Tests run only against `TEST_DATABASE_URL` (name must contain "test") as `app_user`, and clean up their own rows.
- App name, cookie prefix and CSRF value are single constants. `create_app_role.sql` is a template (no password in the repo).

## Phase 1 — foundation (2026-06)
- Scaffold, Docker Compose Postgres 16, fail-fast settings.
- Migration `0001_initial.py`: users, sessions, mediators, deals; RLS (ENABLE + FORCE) on mediators/deals; composite FK deal→mediator of the same user.
- Google OAuth (Authlib, state + nonce, verified email), opaque hashed sessions, sliding 30-day cookie, CSRF header, security headers, rate limits.
- `/api/health`, `/api/health/db`, `/api/me` (GET/DELETE), logout.
- React PWA shell (login, home, settings, install prompts), Render/Vercel config, CI.
