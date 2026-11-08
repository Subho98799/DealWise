# DealTracker

A mobile-first PWA for people who take **review deals** (buy a product, post a review, a mediator refunds you later). Users sign in with Google and track deals, amounts (INR), refunds, mediators and deadlines.

**Phase 1 (this repo state):** scaffold, Google login, an isolated per-user data layer with Postgres row-level security, and the PWA shell. Deal screens arrive in Phase 2.

Everything here is standard open tech: FastAPI + SQLAlchemy + Alembic + PostgreSQL, React + Vite. It runs on a laptop with Docker Compose and deploys to any host (the docs below use Neon, Render and Vercel free tiers).

```
dealtracker/
  backend/     FastAPI app (app/), Alembic migrations, pytest suite, Dockerfile
  frontend/    Vite + React + TS PWA, vercel.json
  scripts/     create_app_role.sql (+ docker-init.sh used by docker compose)
  docker-compose.yml   local Postgres 16
  render.yaml          free Render web service for the API
  .github/workflows/ci.yml
```

---

## 1. Local setup (under 10 commands)

Needs Docker, Python 3.12, Node 20 (with `corepack enable` for yarn).

```bash
docker compose up -d                                   # 1. Postgres 16 (+ app_user role, dealtracker & dealtracker_test DBs)
cd backend && python3.12 -m venv .venv && . .venv/bin/activate   # 2.
pip install -r requirements-dev.txt                    # 3.
cp .env.example .env                                   # 4. then fill GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / SESSION_SECRET
alembic upgrade head                                   # 5. migrations as the owner role
pytest -q                                              # 6. full suite incl. isolation tests (uses dealtracker_test)
uvicorn app.main:app --reload --port 8000              # 7. API on :8000
cd ../frontend && yarn install && yarn dev             # 8. (new terminal) app on http://localhost:5173
```

Generate `SESSION_SECRET` with `python -c "import secrets; print(secrets.token_urlsafe(48))"`.

Open **http://localhost:5173** (not :8000). The Vite dev server proxies `/api/*` to the backend, so the browser only ever talks to one origin and cookies stay first-party.

Useful extras: `yarn build && yarn preview` (production build + service worker on :4173, also proxied), `yarn icons` (regenerate placeholder icons), `docker compose down -v` (wipe the local database).

> The docker init script runs only on the **first** start of an empty volume. If you change it, run `docker compose down -v` first.

---

## 2. Google OAuth client

1. Go to <https://console.cloud.google.com/> → create (or pick) a project.
2. **APIs & Services → OAuth consent screen**: User type *External*, app name "DealTracker", add your support email. Scopes: `openid`, `email`, `profile` (all non-sensitive). While in *Testing* mode add the Google accounts that may log in as test users; click *Publish app* when you want anyone to sign in.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application.**
4. **Authorized JavaScript origins**
   - `http://localhost:5173`
   - `https://<your-app>.vercel.app` (and your custom domain, if any)
5. **Authorized redirect URIs** (always `FRONTEND_URL + /api/auth/google/callback`)
   - `http://localhost:5173/api/auth/google/callback`
   - `https://<your-app>.vercel.app/api/auth/google/callback`
6. Copy the client ID and secret into `backend/.env` (locally) and the Render dashboard (production).

The redirect URI points at the **frontend** origin on purpose: the request goes through the Vite proxy / Vercel rewrite to the backend, so the session cookie is set on the frontend domain (first-party — required by Safari's tracking prevention).

---

## 3. Neon database

1. Create a project at <https://neon.tech> (choose region *Asia Pacific (Singapore)* for Indian users). You get a database (default `neondb`) and an owner role (e.g. `neondb_owner`).
2. Open the **SQL editor** connected as the owner role. Edit `scripts/create_app_role.sql` locally, **replace the placeholder password `app_user_local_dev` with a long random one** (Neon rejects weak passwords), paste the file and run it. Do not commit the real password.
3. Build the two connection strings from *Connection details*:

| Variable | Role | Endpoint | Used by |
|---|---|---|---|
| `DATABASE_URL` | `app_user` | **pooled** (host contains `-pooler`) | the running app |
| `MIGRATION_DATABASE_URL` | owner (`neondb_owner`) | **direct** (no `-pooler`) | Alembic only, at container start |

Example: `DATABASE_URL=postgresql://app_user:<pw>@ep-xxx-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`. `postgres://` / `postgresql://` URLs are accepted and switched to the psycopg 3 driver automatically.

**Why two roles:** on Neon the default owner role has `BYPASSRLS` (it is a member of `neon_superuser`), so row-level security would silently not apply to it. **The app MUST connect as `app_user` at runtime.** Only migrations use the owner. Run `create_app_role.sql` as the same owner role that runs migrations, so its `ALTER DEFAULT PRIVILEGES` covers future tables (migration 0001 also grants explicitly).

The app disables server-side prepared statements (`prepare_threshold=None`) so it works through Neon's PgBouncer pooler, and sets the user context with a transaction-local `set_config(..., true)` so it can never leak across pooled connections.

---

## 4. Deploy

### Backend on Render (free)
1. Push this repo to GitHub.
2. Render → **New → Blueprint** → pick the repo. It reads `render.yaml` (Docker runtime, root `backend/`, health check `/api/health`, free plan).
3. Fill in every environment variable when prompted:
   `ENV=prod`, `DATABASE_URL`, `MIGRATION_DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `FRONTEND_URL=https://<your-app>.vercel.app`, `ADMIN_EMAILS` (optional, Phase 4), `RATE_LIMIT_ENABLED=true`.
4. Deploy. The container runs `alembic upgrade head` and then uvicorn as a non-root user. Note the service URL, e.g. `https://dealtracker-api.onrender.com`.

### Frontend on Vercel (free)
1. In `frontend/vercel.json` replace `REPLACE-WITH-RENDER-URL` with your Render host (e.g. `dealtracker-api.onrender.com`) and commit.
2. Vercel → **Add New → Project** → import the repo, **Root Directory `frontend`**, framework *Vite* (build `yarn build`, output `dist`). No environment variables are needed.
3. Deploy, then make sure the Vercel URL is in the Google OAuth origins/redirect URIs and in Render's `FRONTEND_URL`.

`vercel.json` rewrites `/api/*` to Render and every other path to `/index.html` (SPA fallback). It also sends the CSP and security headers for the SPA.

### Cold starts and keep-alive
Render's free plan sleeps a service after **15 minutes** without traffic; the next request waits ~30–60 s while it boots (the app shows "Waking up the server…"). To avoid that, point a free uptime pinger (e.g. UptimeRobot or cron-job.org) at `https://<render-host>/api/health` every 10–14 minutes. `/api/health` never touches the database, so pings don't wake Neon (whose free compute also auto-suspends); `/api/health/db` is there when you want a real DB check. Be aware that a 24/7 pinger uses most of Render's monthly free instance hours.

---

## 5. Isolation design (read before adding tables)

The top requirement is that one user can never see or change another user's data. It is enforced in **three layers**:

1. **Postgres row-level security** on every per-user table (`mediators`, `deals`): `ENABLE` + `FORCE ROW LEVEL SECURITY` and one policy `FOR ALL` with
   `USING` and `WITH CHECK` = `user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid`.
   If the setting is missing or empty the comparison is `NULL` → zero rows visible and every write rejected. There is no admin bypass in Phase 1.
2. **Restricted runtime role** `app_user` (`NOSUPERUSER NOBYPASSRLS`, only DML grants), so RLS actually applies to the app.
3. **A single data-access layer.** `get_user_db` (in `app/db.py`) opens one transaction per request and runs `SELECT set_config('app.current_user_id', :uid, true)` with the id from the server-side session. `DealRepo` / `MediatorRepo` (`app/repos/`) only use that session and fill `user_id` from the same setting, never from input. Route handlers never touch a raw session or the tables; `tests/test_data_access_scan.py` fails the build if they do. Request schemas use `extra="forbid"`, so a `user_id` field in a body is rejected.

Also: deals reference mediators through a **composite foreign key** `(mediator_id, user_id) → mediators(id, user_id)`, so a deal can never point at someone else's mediator (FK checks bypass RLS, so this has to be a constraint).

**Design decision — `users` and `sessions` are not under RLS in Phase 1.** They must be readable before a user context exists (to resolve the session cookie and to upsert at login). They are touched only by the auth module `app/auth/` (`deps.py`, `service.py`, `sessions.py`). Nothing else may query them.

### Rule: every future per-user table needs RLS
When you add a table that holds user data (Phase 2+), the same migration must:
- have `user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE`;
- `ENABLE` and `FORCE ROW LEVEL SECURITY`;
- create the same `FOR ALL` policy with identical `USING` and `WITH CHECK`;
- be accessed only through a repo in `app/repos/`;
- get isolation tests like those in `tests/test_isolation.py` (other user sees nothing, no-context sees nothing, cross-user insert fails, cross-user update/delete affects 0 rows).

---

## 6. Security notes
- Session: random 32-byte token in an `HttpOnly`, `SameSite=Lax`, `Path=/` cookie `dt_session` (`Secure` in prod); only its SHA-256 is stored. 30-day sliding expiry, `last_seen_at` updated at most every 10 minutes.
- OAuth: server-side authorization-code flow (Authlib), `state` + `nonce` validated, ID token verified, `email_verified` required. A short-lived signed cookie `dt_oauth` (path `/api/auth`, 10 minutes) holds only the handshake state.
- `next` must be a relative path starting with a single `/`.
- CSRF: every POST/PUT/PATCH/DELETE needs `X-Requested-With: dealtracker` (a cross-site page cannot add it without a CORS preflight, and no CORS is enabled).
- Rate limits: 20/min/IP on `/api/auth/*`, 120/min/IP elsewhere (in-memory, per instance).
- Logs contain method, path (no query string), status and timing only — never tokens, cookies or emails.
- Errors are always `{"error": {"code": "...", "message": "..."}}`.

## 7. Environment variables
See `backend/.env.example` (all backend variables) and `frontend/.env.example` (only the local proxy target). Never commit `.env`.

| Variable | Required | Notes |
|---|---|---|
| `ENV` | yes | `dev` or `prod` (prod = Secure cookies, HSTS, no `/api/docs`) |
| `DATABASE_URL` | yes | app_user, pooled |
| `MIGRATION_DATABASE_URL` | yes | owner, direct; used by Alembic |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | yes | from Google Cloud |
| `SESSION_SECRET` | yes | ≥ 32 chars, signs the OAuth handshake cookie |
| `FRONTEND_URL` | yes | e.g. `http://localhost:5173`; OAuth redirect base |
| `ADMIN_EMAILS` | no | comma separated, used from Phase 4 |
| `RATE_LIMIT_ENABLED` | no | default `true` (tests turn it off) |

The app refuses to start and names every missing variable.
