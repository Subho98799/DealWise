# DealTracker

Track **review deals** on your phone: what you bought, what you paid, which mediator owes you a refund, and which review or refund-form deadline is coming up. Works offline, syncs when you're back online, money in ₹ with Indian grouping. Each account's data is isolated in the database itself (Postgres row-level security).

Status: Phases 1–3 done (login, deals, mediators, offline sync, alerts, import). Roadmap: [docs/ROADMAP.md](docs/ROADMAP.md).

## Quick start (no Docker; free Neon database)
Needs Python 3.12, Node 20 + Yarn (`corepack enable`), Git. Get your values first: [docs/SETUP_CREDENTIALS.md](docs/SETUP_CREDENTIALS.md).

| Step | bash (macOS/Linux) | PowerShell (Windows) |
|---|---|---|
| 1. Install deps + blank `.env` files | `scripts/dt.sh install` | `.\scripts\dt.ps1 install` |
| 2. Fill `backend/.env` | your editor | `notepad backend\.env` |
| 3. Create `app_user` (app + test DB) | `scripts/dt.sh create-role` and `create-role-test` | `.\scripts\dt.ps1 create-role` and `create-role-test` |
| 4. Migrate (app + test DB) | `scripts/dt.sh migrate` and `migrate-test` | `.\scripts\dt.ps1 migrate` and `migrate-test` |
| 5. Check setup | `scripts/check_setup.sh` | `.\scripts\check_setup.ps1` |
| 6. Run tests | `scripts/dt.sh test` | `.\scripts\dt.ps1 test` |
| 7. Start API (terminal 1) | `scripts/dt.sh backend` | `.\scripts\dt.ps1 backend` |
| 8. Start app (terminal 2) | `scripts/dt.sh frontend` | `.\scripts\dt.ps1 frontend` |

Open <http://localhost:5173>.

## Deploy
- **Before deploying:** from your own computer, set the owner direct URL locally and run `scripts/dt.sh migrate` (bash/macOS/Linux) or `.\scripts\dt.ps1 migrate` (Windows PowerShell). Run migrations before each deployment that includes a new migration. Never put the owner URL or `MIGRATION_DATABASE_URL` in Render; it is only for local migration tooling.
- **API → Render (free):** New → Blueprint → this repo (`render.yaml`). Set only the API runtime values listed in [SETUP_CREDENTIALS](docs/SETUP_CREDENTIALS.md), including `ENV=prod` and `FRONTEND_URL=https://<app>.vercel.app`. Render does not run migrations at startup. It sleeps after 15 min idle; optionally ping `/api/health` every 10–14 min.
- **App → Vercel (free):** put your Render host into `frontend/vercel.json` (`REPLACE-WITH-RENDER-URL`), import the repo with **Root Directory `frontend`**, framework Vite. No env vars.
- **Google OAuth client:** Web application; origins `http://localhost:5173` and your Vercel URL; redirect URIs `<origin>/api/auth/google/callback`. Steps: [SETUP_CREDENTIALS §3](docs/SETUP_CREDENTIALS.md#3-google-oauth-google_client_id-google_client_secret).

## Docs
- [AGENTS.md](AGENTS.md) — rules and commands for contributors and AI tools
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how it works and why
- [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md) — status, files, API, schema, recipes, testing
- [docs/VERIFY_ON_MY_MACHINE.md](docs/VERIFY_ON_MY_MACHINE.md) — manual checks with real accounts
- [CHANGELOG.md](CHANGELOG.md)
