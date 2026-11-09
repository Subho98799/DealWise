# ROADMAP

**TL;DR**
- Phases 1–3 are done; Phase 5 polish is in progress. Phase 4 admin and Phase 6 web push are not started.
- Each phase lists prerequisites from the current code so work can start without re-reading everything.
- All phases must keep the invariants in [AGENTS.md](../AGENTS.md) (RLS on every per-user table, repos only, money as strings).
- Status per feature: [IMPLEMENTATION.md](IMPLEMENTATION.md#status).
- Product roadmap phases describe feature work; Alembic revision numbers are independent.

## Phase 3 — Excel/CSV import with mapping and undo (done)
- `.xlsx`, `.xls`, and `.csv` files up to 5 MB are parsed in a browser Web Worker with SheetJS CE 0.20.3 from its official tarball; the file itself stays on the device.
- Users choose a sheet/header, map columns, correct date order/status values, preview validation and duplicate policy, then send mapped cell values to the server for authoritative normalization and validation.
- Imports commit online in batches of 500, with per-user idempotency, deterministic deal client IDs, reconciliation totals, error reports, history, and a 30-day undo that soft-deletes imported deals and orphaned created mediators.
- Sync changes are paginated at 500 rows; the client finishes pulling all pages before marking itself synced and shows a linked notice when a newer server edit replaces a local edit.
- Covered by backend PostgreSQL tests as `app_user`, Vitest fixture/parser/wizard tests, Ruff, ESLint, typecheck, and production build. Hosted Neon/Google/Render/Vercel checks remain **NOT VERIFIED HERE**.

## Phase 4 — admin, self-test, support access, audit log
- Admin dashboard (`role='admin'`, seeded from `ADMIN_EMAILS` at login): **aggregates only** (user count, deals per day, sync errors) via SECURITY DEFINER SQL functions that return counts, never rows.
- Isolation self-test endpoint for admins: runs the `check_setup` RLS smoke test inside a rolled-back transaction and reports PASS/FAIL.
- Support access: a user grants time-limited access (e.g. 24 h) from Settings → `support_grants(user_id, grantee_id, expires_at)` under RLS; RLS policies gain an `OR EXISTS (active grant)` clause, read-only.
- Audit log: append-only `audit_log` (actor, action, target, at) for logins, deletions, grants and admin views; RLS for owners, insert-only for app_user.
- Prerequisites: `users.role` (exists), `ADMIN_EMAILS` (exists), RLS policy pattern (exists; update all policies in one migration).

## Phase 5 — distinctive UI polish (in progress)
- Delivered: token-based design system, light/dark and selectable themes, install experience, responsive 480px shell, shared UI primitives, and screen refinements; see [CHANGELOG](../CHANGELOG.md).
- Remaining: additional motion for one-tap actions, empty-state illustrations, swipe actions on cards, and haptics where supported.
- Prerequisites: all screens use tokens and `data-testid`s (exists); Playwright e2e guards behavior.

## Phase 6 — optional web push (not started)
- VAPID keys (env), `push_subscriptions` per-user table with RLS, a scheduled job (Render cron or GitHub Actions) that computes urgent/overdue in SQL per user timezone and sends notifications.
- iOS requires the PWA to be installed (16.4+); keep the in-app banner and `setAppBadge` as the fallback.
- Prerequisites: urgency SQL twins in `app/repos/deals.py` (exist), `users.timezone` + `alert_days` (exist), service worker (exists; add a `push` handler).
