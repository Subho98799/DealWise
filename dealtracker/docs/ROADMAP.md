# ROADMAP

**TL;DR**
- Phases 1–2 are done. Phases 3–6 below are short specs, not built.
- Each phase lists prerequisites from the current code so work can start without re-reading everything.
- All phases must keep the invariants in [AGENTS.md](../AGENTS.md) (RLS on every per-user table, repos only, money as strings).
- Status per feature: [IMPLEMENTATION.md](IMPLEMENTATION.md#status).

## Phase 3 — Excel import with column mapping and dedupe
- Upload `.xlsx`/`.csv` on the device; parse in the browser (e.g. SheetJS) so files never leave the phone unless confirmed.
- Mapping screen: detect headers, suggest a mapping to deal fields (product, platform, mediator, dates, amounts, statuses), remember the last mapping per user.
- Preview with per-row validation (same rules as `app/rules.py`/`lib/rules.ts`), INR parsing ("₹1,23,456.00", "1.2k" rejected), date formats (DD/MM/YYYY first).
- Dedupe: deterministic `client_id` = UUIDv5(user_id, normalized product + date_taken + amount_paid + mediator) so re-imports are idempotent; show "already imported".
- Write through the existing outbox in batches of 100 (`/api/sync/push`), so import works offline and reuses idempotency.
- Prerequisites: `client_id` unique per user (exists), `mediator_name` find-or-create (exists), batch limit 100 (exists).

## Phase 4 — admin, self-test, support access, audit log
- Admin dashboard (`role='admin'`, seeded from `ADMIN_EMAILS` at login): **aggregates only** (user count, deals per day, sync errors) via SECURITY DEFINER SQL functions that return counts, never rows.
- Isolation self-test endpoint for admins: runs the `check_setup` RLS smoke test inside a rolled-back transaction and reports PASS/FAIL.
- Support access: a user grants time-limited access (e.g. 24 h) from Settings → `support_grants(user_id, grantee_id, expires_at)` under RLS; RLS policies gain an `OR EXISTS (active grant)` clause, read-only.
- Audit log: append-only `audit_log` (actor, action, target, at) for logins, deletions, grants and admin views; RLS for owners, insert-only for app_user.
- Prerequisites: `users.role` (exists), `ADMIN_EMAILS` (exists), RLS policy pattern (exists; update all policies in one migration).

## Phase 5 — distinctive UI polish
- Redesign via the tokens in `frontend/src/index.css` and `tailwind.config.js` (colors, radius, spacing, fonts) — no component logic changes needed.
- Motion for one-tap actions, better empty states/illustrations, swipe actions on cards, haptics where supported.
- Prerequisites: all screens use tokens and `data-testid`s (exists); Playwright e2e guards behavior.

## Phase 6 — optional web push
- VAPID keys (env), `push_subscriptions` per-user table with RLS, a scheduled job (Render cron or GitHub Actions) that computes urgent/overdue in SQL per user timezone and sends notifications.
- iOS requires the PWA to be installed (16.4+); keep the in-app banner and `setAppBadge` as the fallback.
- Prerequisites: urgency SQL twins in `app/repos/deals.py` (exist), `users.timezone` + `alert_days` (exist), service worker (exists; add a `push` handler).
