# Security and performance audit — implementation status

**Status:** Approved hardening implemented in part; see the disposition table below. Migration 0005 has not been applied.
**Reviewed:** 2026-11-09
**Implementation branch:** `security/hardening`
**Scope:** repository source, configuration, migrations, tests, CI files, and public provider/dependency advisories. No production or remote application endpoint was contacted.

## Executive summary

| Severity | Original audit findings |
|---|---:|
| Critical | 0 |
| High | 2 |
| Medium | 7 |
| Low | 7 |
| Info | 0 |

The original high-priority findings—owner-credential exposure in the API runtime and an outdated Authlib release—have been addressed in code. Residual concerns include per-instance rate limits and unverified forwarded-IP trust, the approved users/sessions privilege and RLS risk, spreadsheet decompression limits, full-list import duplicate detection, React Router advisories, and owner/legal actions. Migration 0005 is prepared but intentionally unapplied.

No confirmed SQL injection, stored/reflected XSS, exploitable cross-user route access, CSV formula injection through the current error-export data, or secret in the scanned source/history was found. This is static review, not proof that the deployed configuration or database grants match the repository.

## Findings

Effort is a rough implementation estimate, not a schedule commitment. Confidence refers to the code-level evidence; exploitability may still depend on deployment/provider behavior. The finding descriptions below record the audit-time issue; the status table records the current disposition.

### Current disposition

| ID | Severity | Status | Current disposition and residual risk |
|---|---|---|---|
| SEC-01 | High | fixed | The API no longer loads or receives the owner migration URL at runtime; migrations are run locally before deploy. |
| SEC-02 | High | fixed | Authlib is 1.9.5; S256 PKCE was added while state, nonce, and verified-email checks remain. |
| SEC-03 | Medium | partial | Authenticated limits use user IDs; auth limits remain IP-keyed. All limits are per-instance, and Vercel-to-Render forwarded-IP trust still needs deployment verification. |
| SEC-04 | Medium | partial | Migration 0005 revokes broad table grants and re-grants DML only, but users/sessions remain outside RLS and accessible to `app_user` by approval. Effective live grants are unverified; migration is unapplied. |
| SEC-05 | Medium | fixed | A 90-day absolute session lifetime, bounded login cleanup, and production `__Host-` cookie naming are implemented. |
| SEC-06 | Medium | fixed | Body/payload bounds and transaction-local timeouts are implemented; migration 0005 also sets role timeouts but has not been applied. |
| SEC-07 | Medium | partial | Parser workers now time out/cancel and the import page is lazy-loaded; 5 MiB and row limits remain. XLSX decompression expansion is not separately bounded. |
| SEC-08 | Medium | partial | Bounded 90-day import-job cleanup is implemented; 30-day sync-op cleanup remains bounded. The duplicate-detection rewrite is deferred and no query benchmark was run. |
| SEC-09 | Medium | partial | Internal return destinations are validated and tested. React Router was not upgraded as directed; the latest Yarn audit still reports two moderate advisories. |
| SEC-10 | Low | fixed | FastAPI 0.162.2 and compatible Starlette 1.10.0 are pinned; framework smoke test and dependency checks passed. |
| SEC-11 | Low | fixed | python-dotenv 1.2.4 is pinned; the post-upgrade runtime requirements audit found no known vulnerabilities. |
| SEC-12 | Low | partial | Vercel adds HSTS and Permissions-Policy. COOP/CORP were intentionally not added; deployed headers remain unverified. |
| SEC-13 | Low | deferred | No local-data encryption or offline-logout policy change was made. Shared-device data exposure and unsynced-operation handling need an explicit product decision. |
| SEC-14 | Low | partial | CI has `contents: read`, non-blocking pip/Yarn audits, and Dependabot for pip, Yarn, and Actions. Hashed backend locks, immutable action SHA pins, and account-level security settings are deferred. |
| SEC-15 | Low | fixed | OAuth uses S256 PKCE; state, nonce, callback validation, email verification, and stronger session-secret validation remain enforced. |
| SEC-16 | Low | owner action | Replace the `CONTACT_EMAIL` placeholder and obtain professional review of privacy notices, retention, breach handling, and DPDP applicability. |

Approved deferrals: SEC-04's users/sessions isolation redesign, SEC-08's duplicate-detection rewrite, SEC-13, SEC-14's hashed locks and immutable action pins, and SEC-16 legal/owner work. These are not represented as completed.

| ID | Severity | Evidence | Impact | Proposed fix | Effort / confidence |
|---|---|---|---|---|---|
| SEC-01 | High | [Dockerfile:20-22](../backend/Dockerfile#L20); [config.py:55-64](../backend/app/config.py#L55); [render.yaml:17](../render.yaml#L17) | The container runs Alembic with `MIGRATION_DATABASE_URL`, then `exec`s Uvicorn in the same environment. The API settings loader also requires and loads that URL. It is documented as the direct owner URL, so compromise of the API process can expose credentials with a much larger database blast radius than `app_user` and bypass RLS. This is not a finding that normal API queries connect as the owner; it is credential co-residency in the runtime. | Move migrations to a separate deploy/release step or isolated job and remove the owner URL from the API service. Make the migration URL unavailable to application settings/runtime. Verify the app process only receives `DATABASE_URL` for `app_user`. | M / 9 |
| SEC-02 | High | [requirements.txt:6](../backend/requirements.txt#L6); [oauth.py:8-15](../backend/app/auth/oauth.py#L8); [routes.py:40-51](../backend/app/auth/routes.py#L40) | Authlib is pinned at 1.3.2. `pip-audit` found 18 unique Authlib advisory records for this version. At least one upstream high-severity issue, CVE-2026-114617, concerns an ID token disabling its own nonce validation and is patched in Authlib 1.9.0; the application uses Authlib's OpenID Connect token path. Other findings include JWS verification/header issues and denial-of-service conditions. Not every advisory necessarily applies to Google's particular token claims or this client-only use, and no exploit was demonstrated. | Upgrade Authlib to a currently patched release (the audit database lists 1.9.1 or later for the latest findings), then test state, nonce, issuer/audience/signature checks, email verification, and failure handling against the existing OAuth flow. | M / 8 |
| SEC-03 | Medium | [Dockerfile:22](../backend/Dockerfile#L22); [security.py:17-36](../backend/app/security.py#L17) | Uvicorn trusts forwarded headers from `*`; SlowAPI derives its key from the resulting client address. Limits are in-memory and per process: auth 20/minute and default 120/minute. Import limits are also process-local. A spoofable or shared forwarded address can let callers evade limits or cause unrelated users to share a bucket; limits reset on restart and do not coordinate across instances. Vercel documents `X-Forwarded-For` as the client public IP and says it overwrites the header when Vercel itself is behind another proxy. Whether this exact Vercel rewrite → public Render origin chain and Render edge preserve/replace a direct caller's header was not verified. | Trust only a verified proxy chain; prevent bypassing the intended gateway where feasible. Key authenticated limits by session/user and auth limits by a correctly derived client IP. Use a shared limiter store for multiple workers/instances and per-operation limits for expensive endpoints. Verify forwarded-header behavior in a staging environment before relying on IP-based controls. | M / 9 |
| SEC-04 | Medium | [0001_initial.py:42-52](../backend/alembic/versions/0001_initial.py#L42); [0001_initial.py:120](../backend/alembic/versions/0001_initial.py#L120); [create_app_role.sql:15-22](../scripts/create_app_role.sql#L15) | `sessions` has `user_id` but is not enabled for RLS; `users` is also globally readable/writable by the runtime role. The app role is granted SELECT/INSERT/UPDATE/DELETE on both, which auth code needs for token lookup and account/session management. Thus database-level tenant isolation is not a boundary for these tables. The role script sets important restrictive role flags but does not revoke unexpected existing grants or memberships. No live database was available to inspect effective privileges or memberships. | Keep identity/session access behind a narrowly scoped auth database interface (for example, constrained functions or a separate role/connection) and remove broad table access from general application queries where practical. Add an explicit grant/membership audit and revoke excess privileges; verify all effective grants on the test database. | L / 8 |
| SEC-05 | Medium | [sessions.py:13-14](../backend/app/auth/sessions.py#L13); [deps.py:57-67](../backend/app/auth/deps.py#L57); [service.py:11-32](../backend/app/auth/service.py#L11) | Sessions use strong random opaque tokens hashed with SHA-256, secure/HttpOnly/SameSite=Lax cookies in production, and a 30-day sliding idle expiry. There is no absolute lifetime; active sessions can be extended indefinitely. Login creates a new session without revoking other sessions, and logout revokes only the presented session. Expired rows are deleted only if that expired token is later presented, so abandoned sessions can accumulate. No session fixation issue was confirmed: login creates a fresh random token. | Add a separately enforced absolute expiry, offer/review session revocation semantics, and remove expired sessions on a scheduled or bounded cleanup path. Consider a `__Host-` cookie name while preserving Secure, Path=/, and no Domain. Add tests for absolute expiry, rotation/revocation policy, and cleanup. | M / 9 |
| SEC-06 | Medium | [security.py:71-103](../backend/app/security.py#L71); [schemas.py:162-173](../backend/app/schemas.py#L162); [db.py:10-18](../backend/app/db.py#L10) | The 5 MiB streaming body cap applies only to `/api/import`. Sync caps a push at 100 operations, but each `SyncOp.data` is an unconstrained `dict[str, Any]`; other JSON endpoints have no common byte cap. Many domain fields are bounded, but not every nested payload/key. There is no configured PostgreSQL `statement_timeout` or `idle_in_transaction_session_timeout`. A large or deeply nested request can consume parsing memory/CPU before field validation; slow database statements can retain connections. | Apply a global request-body limit (with endpoint-specific lower limits), bound sync object keys/depth/string lengths, and configure database statement and idle-transaction timeouts through an append-only migration. Preserve the existing import and sync business limits. | M / 9 |
| SEC-07 | Medium | [workbook.ts:3-6](../frontend/src/imports/workbook.ts#L3); [workbook.ts:16-31](../frontend/src/imports/workbook.ts#L16); [ImportPage.tsx:270-316](../frontend/src/pages/ImportPage.tsx#L270) | The UI caps the compressed file at 5 MiB and checks worksheet dimensions, but `XLSX.read()` fully opens/parses the workbook before the dimension checks. A small compressed archive can expand substantially before the row/column guards execute. The Web Worker protects UI responsiveness, not browser memory/CPU. `yarn audit` does not report the SheetJS tarball because it is pinned from a custom URL. No malicious spreadsheet was opened. | Use a parser/format path with defensible decompression and resource limits, or validate archive expansion before full parse. Terminate workers on timeout/cancel and add safe regression tests for oversized expansion and pathological workbook metadata. Verify SheetJS advisory/provenance information independently of npm audit. | M / 8 |
| SEC-08 | Medium | [imports.py:101-106](../backend/app/services/imports.py#L101); [repos/imports.py:55-64](../backend/app/repos/imports.py#L55); [deals.py:149-160](../backend/app/repos/deals.py#L149); [mediators.py:44-57](../backend/app/repos/mediators.py#L44); [sync.py:28-37](../backend/app/repos/sync.py#L28) | Every import preview/commit loads all active deals for that user into Python for duplicate detection. Summary and mediator totals aggregate user data; the mediator list is not paginated. Import-job history is capped to 100 rows, but stored jobs have no retention policy. Old idempotency records are pruned only during pushes and at most 500 at a time; a quiet user can retain them indefinitely. Some list/sort/search paths may require sorting/scanning a user's full data set. No N+1 pattern was evident in the reviewed paths, but no query plans or latency measurements were available. | Benchmark before adding indexes. Use query-side duplicate matching or bounded staging, paginate mediator lists if growth requires it, and define retention/quotas for import jobs and idempotency records. Optimize from measured plans rather than speculative indexes. | L / 9 |
| SEC-09 | Medium | [package.json:29](../frontend/package.json#L29); [yarn.lock:3662-3674](../frontend/yarn.lock#L3662); [Login.tsx:47-49](../frontend/src/pages/Login.tsx#L47) | `yarn audit` reports two moderate advisories for locked React Router 6.30.6. The open-redirect advisory covers backslash handling in `<Link>`/`useNavigate` paths before 7.18.0. The app uses `Navigate` with a `next` path in router state; OAuth's server-side `next` is separately validated, and no exploitable attacker-controlled navigation was demonstrated. The second advisory is for SSR hydration; this app uses `createRoot`/`BrowserRouter` declarative routing and does not SSR, so that advisory is not applicable to the observed deployment mode. | Validate client-side return destinations as same-origin internal routes before navigation, and plan a compatible router upgrade or major-version migration. Add backslash/protocol-relative redirect tests. | S / 6 |
| SEC-10 | Low | [requirements.txt:1-13](../backend/requirements.txt#L1) | `pip-audit -r requirements.txt` reports seven unique Starlette advisory records at the resolved 0.41.3 version (including issues in multipart parsing, Range handling, host/path handling, and related code). The application is JSON API-only in the reviewed routes; no form parser, `FileResponse`, or `StaticFiles` endpoint was found, so several advisory paths appear unused. Reachability of all Starlette internals was not dynamically tested. | Upgrade FastAPI and its compatible Starlette dependency together, then rerun the full suite and review the resulting advisory set. | M / 8 |
| SEC-11 | Low | [requirements.txt:11](../backend/requirements.txt#L11) | `pip-audit` flags python-dotenv 1.0.1 for CVE-2026-28684, concerning `set_key()`/`unset_key()` following symlinks. The repository uses settings loading and `dotenv_values`; no application call to those file-mutating functions was found, so this is not an identified remote attack path. | Upgrade to a patched release and keep any `.env` mutation utility out of untrusted paths. | S / 9 |
| SEC-12 | Low | [vercel.json:8-18](../frontend/vercel.json#L8); [security.py:120-129](../backend/app/security.py#L120) | CSP, nosniff, Referrer-Policy, and frame protections are configured. CSP permits inline styles but not inline scripts or `unsafe-eval`. The API sets HSTS in production, while the repository's static Vercel header rules do not explicitly set HSTS. COOP, CORP, and Permissions-Policy are not explicitly configured. The hosting platform may add headers independently; that was not verified. | Explicitly configure and test HSTS for the frontend domain, plus suitable Permissions-Policy and cross-origin isolation/resource policies if compatible with OAuth, PWA, and font/image use. | S / 8 |
| SEC-13 | Low | [db.ts:97-113](../frontend/src/data/db.ts#L97); [auth.ts:36-45](../frontend/src/lib/auth.ts#L36); [auth.ts:58-61](../frontend/src/lib/auth.ts#L58) | Deal and mediator data are stored unencrypted in IndexedDB/local storage for offline operation. Explicit logout clears local data only after the server logout succeeds; a 401 clears cached `me` but does not wipe the local database. A person with access to an unlocked browser profile or same-origin script execution can read local data. | Document shared-device risk, provide a safe local lock/sign-out policy, and decide explicitly how to handle unsynced offline operations before wiping on network failure. Use device/browser profile protections; client-side encryption with a key stored in the same profile would not protect against a compromised profile. | M / 8 |
| SEC-14 | Low | [ci.yml:1-65](../.github/workflows/ci.yml#L1); [package.json:30](../frontend/package.json#L30); [yarn.lock:4746-4749](../frontend/yarn.lock#L4746) | Python direct dependencies are pinned, but transitive Python dependencies are not locked with hashes. Frontend registry packages use `yarn.lock`, while the custom SheetJS tarball lock entry has only its URL/SHA-1 fragment and no SRI integrity field. CI uses major action tags (`@v4`, `@v5`) and does not set an explicit least-privilege `permissions` block. CI currently has no dependency/secret scanning job. No third-party runtime script was found. | Add explicit read-only CI token permissions, pin actions to reviewed immutable SHAs (with update automation), add Python lock/constraints with hashes, and add non-blocking dependency/secret scans before making them gates. Track the custom tarball checksum/provenance. | M / 8 |
| SEC-15 | Low | [oauth.py:8-15](../backend/app/auth/oauth.py#L8); [routes.py:24-61](../backend/app/auth/routes.py#L24) | OAuth state and nonce are used in a signed, short-lived, HttpOnly/SameSite=Lax handshake cookie; callback token exchange and email verification are checked, redirect URI comes from configured `FRONTEND_URL`, and `next` is restricted to relative paths. No PKCE configuration was found. The session token itself has 32 random bytes and is hashed at rest. The configured signing secret is checked for length, not entropy. | Add PKCE if supported by the selected Authlib/provider flow; retain state/nonce checks. Validate production secret generation and rotate it if its provenance is uncertain. | S / 8 |
| SEC-16 | Low | [Privacy.tsx:1-4](../frontend/src/pages/Privacy.tsx#L1); [Privacy.tsx:15-49](../frontend/src/pages/Privacy.tsx#L15); [app.ts:7](../frontend/src/config/app.ts#L7) | A privacy page describes Google identity data, deal/mediator data, providers, local storage, deletion, and lack of export. Both legal pages explicitly require professional review, and the contact address is still `support@example.com`. The page does not specify a breach process, detailed retention for host logs/backups, or a consent/notice versioning flow. The code cascades account deletion through user-owned database rows, but provider logs/backups and legal retention were not inspected. DPDP Act applicability and notices are legal questions, not established by this code review. | Before public launch, have qualified Indian privacy counsel review notice, consent, purpose limitation, data-subject requests, grievance/contact details, processor terms/transfers, deletion/backup retention, breach handling, and any child-user requirements. Replace the placeholder support address. | M / 8 |

## Coverage and reassuring evidence

### A. Secrets, data leaks, and unauthenticated information

- `.gitignore` ignores `.env` and `.env.*` and permits `.env.example`; CI also rejects tracked non-example environment files.
- A manual pattern scan examined tracked text in the current tree and Git history while excluding all `.env` and `.env.*` paths at the Git pathspec level. It did not print matched values. The only matches were credential-shaped local test/CI URL examples and an old documentation example; none was identified as a live secret. This is heuristic, not a substitute for Gitleaks.
- Access logs omit query strings and headers/cookies; the error handler returns generic 500 responses and logs exception type/path only. OAuth logs only the error code. No full email, token, or cookie logging was found.
- `/api/docs` and `/api/openapi.json` are disabled when `ENV=prod`; ReDoc is disabled. Production `ENV` was not verified. `/api/health` is public and does not query the database. `/api/health/db` is public and performs `SELECT 1`; it reveals only database readiness, and is subject to the default rate limit (with the proxy caveat in SEC-03).
- API responses default to `Cache-Control: no-store`; static asset caching is limited to versioned assets. No-store behavior is covered by an existing backend test, but tests were not run for this audit.
- No apparent account enumeration path was found: Google sign-in auto-provisions by Google subject, and the callback does not reveal whether a prior account existed. Timing behavior was not measured.

### B. Authentication and sessions

State/nonce, S256 PKCE, callback verification, verified-email checking, configured redirect URI, safe `next` validation, token entropy/hash-at-rest, cookie flags, logout, and account deletion were reviewed. `SESSION_SECRET` now requires at least 32 characters and rejects obvious placeholders. Sessions expire after 30 days idle or 90 days absolute; production uses a `__Host-` cookie. See SEC-02, SEC-05, SEC-15. `ADMIN_EMAILS` is parsed by config but is not referenced by authorization or login code; setting it currently does not grant an admin role. No admin route was found, consistent with the planned later admin phase.

### C. Authorization and database isolation

All private API routes are wired through `current_user` directly or through `UserDB`; the route-auth test checks this mechanically. Per-user deals, mediators, `import_jobs`, and `sync_ops` have FORCE RLS policies using transaction-local `app.current_user_id`. Composite foreign keys protect deal-to-mediator and deal-to-import-job ownership. `set_config` uses a bound parameter and transaction-local setting. Repository queries use owner filters in addition to RLS. Existing tests cover cross-user reads/writes and account-delete cascades, but no test database was used here.

The `sessions` table is a tenant-owned table without RLS and shares `app_user` DML access; `users` also remains accessible to auth code. By approval, migration 0005 does not redesign access to those tables. It revokes broad table grants and re-grants only DML on the six required tables; it also sets role-level statement and idle-transaction timeouts. Per-request transactions apply the timeouts with transaction-local `set_config`. The migration has not been applied here, so effective grants and settings on a live database are unverified.

### D. Injection and parser review

- Raw SQL found in application code is static or parameterized; query filters use SQLAlchemy expressions and selected sort modes are fixed literals. No SQL injection path was found.
- React renders user strings as text; no `dangerouslySetInnerHTML`, `innerHTML`, `eval`, or `new Function` use was found. Deal and mediator links are constructed from IDs; WhatsApp links use a digit-only phone value and URL-encoded message text with `noopener noreferrer`.
- Error CSV export passes cells through `safe_csv_cell`; its current fields are server-generated row/field/reason diagnostics, not raw imported cells. The filename is reduced to safe characters before use in `Content-Disposition`. No exploitable formula/header injection path was found in the reviewed flow.
- Import money/date regexes are anchored and do not contain nested ambiguous quantifiers. A local-only synthetic check passed 100,000- and 1,000,000-character invalid values: at 1,000,000 characters, `parse_money` and `parse_date` each took about 137–140 ms in this environment. This is not a proof for all inputs; request/body limits and cell-length bounds remain important (SEC-06/07).
- The SheetJS worker reads `.xlsx`, `.xls`, and `.csv`; the compressed-file and post-parse dimension checks do not cap decompressed archive expansion (SEC-07). No prototype-pollution sink was found in application mapping code; no malicious workbook was run.
- No LLM/AI SDK, model call, or user-prompt processing feature was found. Prompt-injection risk is **not applicable today**. If an AI feature is added, treat imported/user content as untrusted, do not place secrets in model context, avoid granting model-originated tool access, validate structured output server-side, and require human approval for consequential writes.

### E. Abuse, resource bounds, and scalability

Current limits include: auth 20/minute per forwarded client IP; authenticated requests 120/minute per user; import preview 30/hour and commit 10/hour per user; sync push 30/minute per user; a 5 MiB global maximum, 1 MiB default endpoint cap, 512 KiB sync push cap, and 5 MiB import cap; 5,000 import rows; 100 sync push operations; 500 sync rows per pull page; and 200 deals per API list page. Sync data is bounded by key count, nesting, array length, key length, and string length. Rate limits remain in-memory and per instance; forwarded-IP trust still needs deployment verification. Remaining scale concerns include the unpaginated mediator list and full-deal import duplicate scan (SEC-03, SEC-08).

The SQLAlchemy pool is configured for 5 connections plus 5 overflow connections per process. Uvicorn uses one default worker, up to 10 pooled DB connections per process; deployed instance count and Neon connection limits were not inspected. There is no background job runner. `sync_ops` cleanup is opportunistic (at most 500 records older than 30 days per push); import-job cleanup is opportunistic (at most 100 records older than 90 days per new commit).

**Measurements requested but not run:** no local PostgreSQL/`psql` or Docker executable was available, and no test database was available. No 50,000-deal/500-user seed, `EXPLAIN (ANALYZE)`, or load test was run. No p50/p95/error-rate measurements exist, so I will not invent a user-capacity estimate. No obvious N+1 query loop was identified by static review; this is not a measured result.

### F. Headers, browser, and offline data

The API and SPA define CSP, frame protections, nosniff, and Referrer-Policy; production API HSTS remains enabled. Vercel now adds HSTS (`max-age=31536000`) and a Permissions-Policy disabling unused device capabilities. COOP/CORP were intentionally not added. No permissive CORS middleware/configuration was found. The PWA precaches lazy chunks, including the import page, parser worker, and XLSX module, denies `/api/` from SPA fallback, and has no API runtime caching. Logout/account deletion wipe the local database after successful server operations; offline retention and unencrypted browser storage remain deferred in SEC-13. Deployed headers were not checked.

### G. Supply chain and repository hygiene

The frontend has a Yarn lockfile; direct backend requirements are pinned, but no hashed Python lockfile exists. CI now has `contents: read`, non-blocking `pip-audit` and Yarn audit steps, and Dependabot updates for pip, Yarn, and GitHub Actions. Immutable action SHA pins and a hashed backend lock were deferred. No third-party runtime script was found. GitHub account-level secret scanning with push protection, CodeQL, branch protection, required reviews/status checks, and 2FA are **not visible in the repository and were not verified**.

### H. Privacy and data lifecycle

The public privacy/terms pages disclose Google profile data, deal/mediator data, provider names, offline storage, account deletion, and no export. User deletion cascades through user-owned relational rows; browser data is wiped on successful deletion. Application retention is bounded opportunistically for `sync_ops` and import jobs; provider logs, backups, and external infrastructure are not controlled by the app code. Legal review is still needed before launch (SEC-16). DPDP Act compliance is not determined here; obtain professional advice.

### I. Capacity and upgrade path

No local test database or load test was run, and no remote/production system was tested. Consequently there are no query plans, seeded measurements, latency percentiles, or defensible user-count estimate. Measure first the active-deal query used for import duplicate detection, which loads all of a user's active deals into Python per preview/commit. Then measure filtered deal lists, summary aggregates, sync pulls, and mediator totals.

Next measurement and scaling steps:

1. Use a disposable local Postgres test database to seed representative users and deals; capture `EXPLAIN (ANALYZE, BUFFERS)` for import duplicate detection first, then list/summary/sync/mediator queries.
2. Record endpoint p50/p95 latency, error rate, DB connection usage, and payload sizes with a local-only load test. Do not infer capacity from code review.
3. Optimize duplicate matching, pagination, and indexes only from those plans and measurements; add regression tests.
4. If measurements justify it, move long imports to a bounded worker/queue and adopt a shared rate-limit store. Budget pooled DB connections across every worker and instance before scaling.
5. Upgrade Render/Neon tiers only when measured cold starts, compute, storage, egress, or connection caps become constraints.

Current repository deployment config selects one Render free web service. Current Render documentation says free web services sleep after 15 minutes idle, take about a minute to wake, share 750 free instance hours per workspace/month, are limited to one instance, and can be suspended on quota/high-traffic conditions. The current Neon Free plan lists 100 CU-hours/project, 1 GB storage/project (20 GB/account total), 5 GB public network transfer/project, and compute scale-to-zero after five minutes idle. The actual Vercel/Neon account plans and usage were not inspected; Vercel spend management is documented for Pro/eligible Enterprise plans, not as an assumed Hobby/free hard cap. These hosted limits are not benchmarks of this application. Upgrade the Render service and Neon plan only after measurements show the bottleneck; use connection pooling and budget aggregate connections across every worker/instance.

### J. DDoS reality check

Application rate limits can limit ordinary per-client request rates; they cannot absorb or stop volumetric network saturation before traffic reaches the provider. Vercel documents automatic DDoS mitigation on all plans and a temporary Attack Mode challenge. Render documents automatic DDoS protection. These controls do not replace endpoint quotas, do not prevent authenticated application-level abuse, and do not guarantee availability under every attack. The public Render origin also creates a possible path around Vercel-specific firewall rules unless deployment access is constrained.

Recommended owner actions: enable/monitor provider firewall and bot controls; enable Vercel Attack Mode during a targeted attack; set uptime and provider-usage alerts; monitor Neon compute, storage, egress, and connection usage; and configure spend controls where the plan supports them. Vercel's current Spend Management documentation limits spend budgets to Pro/eligible Enterprise plans, so a Hobby/free account should not assume it has a hard spend cap. On free tiers, abusive traffic may exhaust quotas or suspend service even when provider DDoS filtering works.

## Tool and verification results

| Check | Result |
|---|---|
| Ruff (`ruff check backend\app backend\tests backend\scripts`) | PASS after each implementation group |
| Bandit (`bandit -r app`) | 0 high/medium findings; 2 low-severity, medium-confidence matches in config hint strings (Google client-secret prefix example and secret-generation command), not embedded credentials |
| Initial `pip-audit` baseline | 26 unique runtime advisory records before dependency upgrades, primarily Authlib, Starlette, and python-dotenv. |
| Current `pip-audit -r backend\requirements.txt` | PASS — no known vulnerabilities in the pinned runtime requirements after upgrades. |
| Current `yarn audit --groups dependencies` | 2 Moderate React Router advisories remain; no High/Critical report. The SSR hydration advisory is not applicable to the observed CSR app; the router was not upgraded by instruction. SheetJS custom URL dependency is not covered by this registry result. |
| Manual secret scan | No confirmed live secret. Heuristic scan of current tracked text and Git history excluded all `.env`/`.env.*` paths and printed no matched values. Gitleaks unavailable. |
| Parser pathological-input check | Local-only test of 100k and 1M invalid characters completed; observed roughly linear cost, up to 140 ms per parser at 1M characters. Not a complete ReDoS proof. |
| Semgrep / OSV scanner | NOT RUN — executables unavailable. |
| Full backend tests / RLS / migration / grant verification | NOT RUN — the backend test fixture reads `backend/.env`, which was not read; no test database was authorized. Migration 0005 was intentionally not applied. |
| Playwright | NOT RUN — requires a configured local/test database and test stack; no `.env` was read. |
| EXPLAIN / seeded 50k-deal benchmark / load test | NOT RUN — no local test database or measurements were used; no remote or production testing permitted. |
| Vercel/Render/Neon/GitHub account configuration | NOT VERIFIED — account-level controls, deployed headers, and forwarded-IP behavior are not available from repository inspection. |

The initial pip audit results were dependency advisories, not proven application exploits. The current pinned runtime requirements passed `pip-audit`; frontend React Router advisories remain.

## Account-level actions only the owner can verify/configure

- GitHub: enable/verify secret scanning and push protection, Dependabot alerts, CodeQL for Python/TypeScript, 2FA, branch protection, and required reviews/status checks. The repository now contains Dependabot update configuration and CI has read-only token permissions.
- Vercel: inspect production headers and rewrite behavior; configure firewall/custom rules and Attack Mode response; configure spend management if on an eligible plan, otherwise monitor included usage and set alerts available to the account.
- Render: confirm API-origin access restrictions, free/paid plan and suspension/traffic alerts, uptime checks, and deployment/migration environment separation.
- Neon: verify the actual `app_user` role attributes, memberships, table/schema/database privileges, RLS flags/policies, pooled endpoint, connection limits, backups, and quota alerts. Never paste connection strings into CI logs or audit output.
- Google OAuth: confirm exact production redirect URI, consent screen, verified publishing status, and secret rotation/contact ownership.
- Privacy/legal: replace the placeholder support email and obtain professional review of India DPDP applicability, notices, consent, retention, grievance, and breach processes.

## Public sources checked

Provider documentation was reviewed on 2026-11-09; plan features can change.

- [Vercel request headers](https://vercel.com/docs/headers/request-headers)
- [Vercel DDoS mitigation](https://vercel.com/docs/vercel-firewall/ddos-mitigation)
- [Vercel Attack Mode](https://vercel.com/docs/vercel-firewall/attack-mode)
- [Vercel Spend Management](https://vercel.com/docs/spend-management)
- [Render DDoS protection](https://render.com/docs/ddos-protection)
- [Render free services and limits](https://render.com/docs/free)
- [Neon pricing and Free-plan quotas](https://neon.com/pricing)
- [Authlib CVE-2026-114617 advisory](https://github.com/advisories/GHSA-c5mf-xmp2-59rc)
- [React Router open-redirect advisory](https://github.com/advisories/GHSA-wrjc-x8rr-h8h6)
- [React Router SSR advisory](https://github.com/advisories/GHSA-337j-9hxr-rhxg)

## Rollout note

The approved code and migration changes are committed on `security/hardening`; no deployment or database migration was performed. Before deploying a release requiring migration 0005, run it from the owner's computer against the intended database using the owner URL. Never configure that URL in Render. Verify effective grants, RLS, proxy/IP behavior, and response headers in staging before relying on them.
