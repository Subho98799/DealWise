# Changelog

## Color themes (2026-11)
### Added
- Added persistent Indigo (default), Forest, and Saffron themes with Light, Dark, and System mode support, Settings swatches, and pre-render theme initialization compatible with the same-origin CSP and offline app shell.
- The PWA theme-color meta tag now follows palette and mode changes. Added preference persistence and invalid-storage Vitest coverage.
- Added the three theme palettes and extension guidance to the design system. Adjusted only tokens that missed WCAG AA for required text and chip pairs.

## Polish pass 2 — UI detail refinement (2026-11)
### Changed
- Deal detail timelines enable only the next forward transition allowed by backend rules; later steps display lock reasons without controls.
- Deal cards use a three-step progress indicator, concise next-step text, conditional net/deadline chips, and 280px Needs Action cards with wrapped titles.
- Appearance guidance now follows the selected mode, Settings rows use distinct icons, and bottom-dock clearance is 24px plus safe-area spacing.
- Hero count-up always settles on its exact value and skips animation under reduced motion. Negative net-return heroes use a muted danger surface.
- Recaptured the 390 × 844 light/dark screens after hero animation completion. The only demo seeding and capture helper is dev-only and refuses production environments; no login bypass route was added.

## Phase 5 — visual design and interaction polish (2026-11)
### Added
- A token-based light/dark design system with bundled Inter and Plus Jakarta Sans fonts, shared accessible UI primitives, Lucide icons, and a persistent System/Light/Dark appearance choice.
- A 480px centered desktop shell, mobile bottom navigation, dashboard summaries, deal cards and filters, quick-add sheet, deal progress timeline, mediator overview, WhatsApp reminder drafts for phone contacts, and a visually guided import wizard.
- PWA icons generated from the design palette, a source check preventing raw hex colors outside the token file, and twelve 390 × 844 light/dark screenshots in `docs/screenshots/`.
- Responsive layout capture checks at 360px, 390px, 768px, and 1280px. Frontend typecheck, 27 Vitest tests, lint, and production build passed for each numbered Phase 5 step.

## Phase 3 — import, sync pagination, and linting (2026-11)
### Added
- Migration `0003_import_jobs.py` adds RLS-protected import history and a composite deal-to-import foreign key; sync push opportunistically removes up to 500 applied operations older than 30 days.
- Server-side import normalization, preview, duplicate detection, idempotent commit, reconciliation totals, formula-safe error CSV, history, and 30-day undo.
- Mobile-friendly spreadsheet wizard for `.xlsx`, `.xls`, and `.csv`, parsed in a browser worker with SheetJS CE 0.20.3 from the official distribution. Added mapping memory, generated templates, server validation, history, and undo.
- Paginated sync pull and a linked notice for offline edits replaced by newer server versions.
- Ruff and ESLint checks in CI, with `dt lint` documented in AGENTS.md.
- Generated fake messy spreadsheet fixtures and backend/API plus Vitest coverage. Verified locally against PostgreSQL 16 as `app_user`; real Neon, Google OAuth, Render, and Vercel integrations are **NOT VERIFIED HERE**.

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
