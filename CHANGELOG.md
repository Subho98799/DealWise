# Changelog

## Indigo landing redesign and install name (2026-11)
### Changed
- The landing page is now a shorter indigo-first layout: hero with sign-in, four compact feature cards, and one privacy band. The duplicated problem, how-it-works, FAQ and final-CTA sections are gone, so the page is about a third of its old length.
- Indigo is now the default color theme on new devices in light and dark mode; Sky, Forest and Saffron remain selectable in Settings.
### Fixed
- The installed app and iOS home-screen label now read DealBook instead of Deals.

## Stuck "Changes needing attention" fixed (2026-11)
### Fixed
- A deal whose first sync was rejected could never be saved again: every later edit sent only the changed fields, and the server answered `product: Field required`. Every deal upsert now carries the full record (plus `client_id`), so saving a deal recreates it on the server, and a successful push clears older rejected changes for that deal. A bare patch for a missing record now says `missing: the server has no copy of this deal; open it and save again`.
- Existing rejected deal edits repair themselves: on startup the app replaces every stuck rejected edit with one fresh full-snapshot op per deal, so the attention list clears without tapping Fix or Discard on each entry.

## Platform picker fixes (2026-11)
### Fixed
- The add-deal platform list now shows proper 24 px platform logos instead of stretched, unreadable badges, wraps long platform names instead of cutting them mid-word, and flips above the field with a height that fits the screen so every option stays reachable.

## New app icon and logo mark (2026-11)
### Changed
- Installed the new DealBook icon set (192, 512, maskable 512, apple-touch 180, favicon) behind one `LogoMark` component that renders the bundled SVG mark in the top bar, on the login page, on the splash screen, and in the centre of the Home refund ring.

## Clearer deal cards, undo and progress (2026-11)
### Changed
- Deal cards are now a compact summary: product, three-step progress bars, the next step, a due countdown, the net refund, and the one-tap action. The tall expanded card is gone — the chevron, the product name, or a swipe opens the deal detail page for everything else.
- The deal detail timeline marks each step as completed, next, or locked, highlights the next step, and adds Undo on the latest completed step, so a mistaken Done can be reverted without hunting through menus. The refund hero also shows Complete or Next: step.
- Payment actions use the rupee icon; the dollar sign is gone.
- The form-filled date is free to edit on every deal, and marking the form submitted keeps a date you already typed instead of always overwriting it with today.

## Dates, labels and visual polish (2026-11)
### Added
- Editable record dates: the deal form exposes **Payment date** (`payment_received_on`, enabled once payment status is Received) and **Form filled** (`refund_form_filled_on`, free to edit). The `form_submitted` action keeps an entered filled date (otherwise today), `reopen_form` clears it, and validation rejects a filled date before the purchase date or after the payment date. Migration `0007` adds the nullable column; import mapping accepts `Form filled on` headers; sync, Dexie defaults, and the deal detail show both dates.
- The test database can be a separate Neon branch even when its database is still named `neondb`: the pytest guard and `dt check` accept a URL whose host differs from `DATABASE_URL`, and docs describe branch setup. `check_setup` also normalises the migration URL to the psycopg 3 driver, fixing a `psycopg2` import error during checks.
- Deal detail lists Form filled and Paid on rows, and the expanded deal card shows Form filled and Paid on.

### Changed
- Platform and filter labels are never cut mid-word: the Deals status and platform filter chips now wrap onto multiple lines, the sort button shows its full label, and the platform combobox sits on its own full-width form row with whole-word option labels.
- Visual polish using existing tokens only: soft brand wash behind the app frame, layered card shadows with a gentle hover lift on pointer devices, hero sheen on the refund cards, brand-tinted focus rings for inputs and the platform field, brand-glow primary buttons and the nav + button, richer progress fill, and a pill toast. Dark mode keeps flat surfaces.

## Theme, platform and mobile pass (2026-11)
### Changed
- Added the Sky (light blue) theme and made it the default on new devices; Indigo, Forest, and Saffron remain selectable in Settings and follow light, dark, and system appearance.
- Bundled real platform logos for Amazon, Flipkart, Myntra, Meesho, Ajio, Blinkit, and Zepto, shown in full colour; Nykaa keeps its token-tinted mark. Tata CLiQ, JioMart, and Snapdeal were removed from the suggestions.
- The Add deal preview now shows `Net Refund = ₹X` instead of the paid − less + commission equation.
- Added the Only order and Negative review deal types to the form, import defaults, import mapping, API schema, and a new database constraint migration.
- The Changes needing attention sheet now renders above the whole page, so opening it from the top bar no longer traps the app behind the header.
- Tightened spacing, typography, theme tiles, stat tiles, and the top bar for 320–390 px phones while keeping 44 px tap targets.

## UI polish pass (2026-11)
### Changed
- Startup no longer waits for `/api/me`: a cached user renders the app immediately, only a real 401 logs out, and the local database opens behind a lightweight shell. The first uncached load shows a neutral “Opening DealBook…” splash, and the sync chip says “Reconnecting…” instead of mentioning a waking server.
- Home now leads with a circular refund ring around the app logo, received/pending legend, Paid/Received/Deals taken tiles, and compact expandable deal cards instead of the urgent carousel. Dollar and gain/loss decorations were removed from Home, cards, and deal detail.
- Deal cards are compact rows with a platform badge, deal number, product, net refund, three-step progress, quick action, and a chevron that reveals chips, meta, edit, and delete.
- Added a platform combobox that merges popular names with platforms already used, plus a Deals platform filter and detail badge. Logos can be dropped into `src/assets/platforms/<slug>.svg`; otherwise a token-coloured lettermark is shown.
- Money fields start empty with a `0` placeholder, accept decimals only, select on focus, format to two decimals on blur, and keep a live net-refund preview.
- The top-bar avatar now opens Settings and closes it again when tapped there. The mediator page replaced the contact-name card with a pencil sheet that edits name and phone.
- Deals sorting is now Needs action (default), Newest, Oldest, Refund high, and Refund low, with stable date/created/id tie-breaks and session memory. The sort button shows the active choice.

## Renamed to DealBook (2026-11)
### Changed
- Renamed the product and internal slug from DealTracker/`dealtracker` to DealBook/`dealbook` across the API, frontend, PWA manifest, package and service names, tests, and docs. Mutations now send `X-Requested-With: dealbook`.
- Updated the local storage prefix and IndexedDB name, so existing browsers re-sync from the server once after this release. Cookies keep the `dt` prefix, so sessions are unaffected.
- Renamed the local Docker/CI databases and example Neon database names to `dealbook` / `dealbook_test`.
- Regenerated the design and install screenshots with the new name.

# Security hardening (2026-11)
### Changed
- Removed owner database credentials and automatic Alembic execution from the API runtime; migrations must be run locally before deployment.
- Added S256 PKCE, stronger session-secret checks, a 90-day absolute session lifetime, bounded cleanup, and a production `__Host-` session cookie.
- Keyed authenticated limits by user, added endpoint/body/sync payload bounds, database timeouts, bounded import-job retention, and per-instance/IP-trust documentation.
- Lazy-loaded import tools, added parser-worker cancellation and timeout, upgraded FastAPI/Starlette/python-dotenv, and added frontend HSTS and Permissions-Policy headers.
- Added read-only CI permissions, non-blocking dependency audits, and Dependabot configuration. Recorded deferred risks and unmeasured capacity limits in the security and scalability documentation.
- Added append-only migration 0005 for restricted `app_user` table grants and database timeouts; users/sessions redesign remains deferred. Apply migrations locally before deploying and never configure the owner URL in Render.

## Generated refund column CI fixes (2026-11)
### Fixed
- Updated the isolation test's direct repository seed to provide `less_amount` and `commission`, leaving generated `refund_amount` to PostgreSQL. Updated deal API fixtures and summary inputs to express the same intended net refunds using the new model.
- Added real-schema regression coverage for import commit, sync push with both component-based and legacy inputs, and legacy API conversion.
- Updated the offline E2E flow to enter Paid, Less, and Commission, verify the live refund breakdown and saved net refund, and check persisted generated values after sync. Updated dev screenshot seed deals to use Less/Commission instead of a refund input.

## Public landing page and legal pages (2026-11)
### Added
- Replaced the logged-out login screen with a mobile-first landing page: a refund/deadline hero, Google sign-in and install actions, a CSS and inline-SVG Home preview with clearly labelled sample deals, problem, feature, how-it-works, trust, FAQ, final sign-in and footer sections.
- Added public `/privacy` and `/terms` plain-English templates for OAuth verification, with a legal-review comment at the top of each file and links from the landing footer. No claim goes beyond the current app: no export, testimonials, user counts or ratings.
- Added SEO basics (title, description, Open Graph, Twitter, canonical, theme colour) and a per-page meta helper.
- Added Vitest coverage for logged-out landing rendering, logged-in redirects, install-link states, footer links and legal page headings.
- Added 390 × 844 light and dark landing screenshots to `docs/screenshots`.

### Changed
- The dev-only screenshot helper now captures the landing page in a second context with a mocked `401`, so no authentication bypass route exists. It also checks the landing layout at 360px and 1280px and waits on `data-mode` when switching light/dark.

### Notes
- `CONTACT_EMAIL` in `frontend/src/config/app.ts` is a placeholder (`support@example.com`). Replace it before launch.
- The privacy and terms text is a template and **needs legal review before public launch**.

## Net refund model and deal numbering (2026-11)
### Changed
- Added migration `0004_deal_less_amount.py`: `refund_amount` is now generated from Paid − Less + Commission. Backfill preserves the previous total (`old refund + old commission`), including refunds above Paid by moving the excess into Commission. Migration NOTICEs report counts for the above-Paid and at-or-below-Paid rules. **Actual row counts are unavailable here because the migration was not applied to a configured database.**
- Deal requests use Paid, Less, and Commission; deprecated legacy `refund_amount` input remains accepted on create, patch, and sync push for old clients/queued operations. Responses retain generated `refund_amount` and expose gain/loss as `net_amount`. Summary totals and import reconciliation now use net refunds and Commission − Less.
- Import supports Less header synonyms and legacy-refund derivation/mismatch warnings. Dexie v2 upgrades stored deals and pending outbox operations without dropping offline edits.
- Updated forms, cards, detail, Home summaries, mediator reminders, and import previews to display the net-refund model. Deal numbers come from the full local active list and are searchable with `12` or `#12`; numbers may shift after deletion or a date change.
- Added migration conversion fixtures, money/import tests, IndexedDB upgrade coverage, and client-side numbering tests. Database-backed migration upgrade/downgrade/re-upgrade, RLS/FK checks, and backend API tests require `TEST_DATABASE_URL`.

## PWA install experience (2026-11)
### Added
- Added one shared install hook and native prompt flow across Home, Settings, and Login, with installed detection, 14-day dismissal, iPhone Share instructions, browser-menu steps, and in-app browser link copying.
- Added app identity and narrow light/dark Home screenshots to the manifest; precached the install assets with the offline app shell.
- Added hook coverage for prompt outcomes, installed detection, platform/browser detection, and dismissal expiry. Real installation still requires a deployed HTTPS URL and a real phone.

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

## Phase 5 — visual design and interaction polish (2026-11; ongoing)
### Delivered
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
