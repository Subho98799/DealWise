# SETUP_CREDENTIALS — every value you need, step by step

**TL;DR**
- You need: a free Neon database (app + test), a Google OAuth client, and a random session secret.
- Runtime values go in `backend/.env` locally (created blank by `dt install`) and in Render's environment settings. The owner URL is local-only and must never be put in Render. Vercel needs **no** secrets.
- **Never commit real values and never paste them into any chat or AI tool.** `.env` is git-ignored and CI fails if one is tracked.
- After filling `.env`, run `scripts/check_setup.sh` (bash) or `.\scripts\check_setup.ps1` (PowerShell) — it prints PASS/FAIL and no secrets.
- Shell differences are shown as **bash** / **PowerShell**.

## 0. Open the env file
- bash: `scripts/dt.sh install` then edit `backend/.env`
- PowerShell: `.\scripts\dt.ps1 install` then `notepad backend\.env`

## 1. Neon database (DATABASE_URL, MIGRATION_DATABASE_URL)
1. Sign up at <https://neon.tech> → **New project** → region *AWS Asia Pacific (Singapore)* → Postgres 16.
2. Dashboard → **Connect**. Pick database `neondb`, role `neondb_owner`.
   - Turn **Connection pooling OFF** → copy the URL → this is the **owner direct** URL.
3. Keep this owner direct URL in your local `backend/.env` only as `MIGRATION_DATABASE_URL`, changing the start to `postgresql+psycopg://`. Never add it to Render:
   `MIGRATION_DATABASE_URL=postgresql+psycopg://neondb_owner:FAKEpass123@ep-cool-name-123456.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`
4. Create the restricted role with **your own strong password** (≥ 16 chars; generate one with `python -c "import secrets; print(secrets.token_urlsafe(24))"`):
   - bash: `scripts/dt.sh create-role` · PowerShell: `.\scripts\dt.ps1 create-role` (asks for the password, input hidden).
   - Alternative: Neon **SQL Editor** as the owner → paste `scripts/create_app_role.sql`, replace `__APP_USER_PASSWORD__` in the editor only → Run.
5. Back in **Connect**, choose role `app_user`, **Connection pooling ON** → copy → this is `DATABASE_URL` (host contains `-pooler`):
   `DATABASE_URL=postgresql+psycopg://app_user:FAKEappPass456@ep-cool-name-123456-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`
   (If `app_user` is not listed, take the pooled owner URL and replace user and password with `app_user` and your password.)
6. Before deploying a release that includes database changes, run migrations from your computer: bash `scripts/dt.sh migrate` · PowerShell `.\scripts\dt.ps1 migrate`. Render does not run migrations at startup.

| Variable | Goes to |
|---|---|
| `DATABASE_URL` | local `backend/.env`, Render |
| `MIGRATION_DATABASE_URL` | local `backend/.env` and migration tooling only; never Render |

## 2. Test database (TEST_DATABASE_URL, TEST_MIGRATION_DATABASE_URL)
Tests refuse any database whose name does not contain `test`. `TEST_MIGRATION_DATABASE_URL` is required: pytest uses it for migrations and migration-revision checks, while the application tests continue to connect as `app_user`.
1. Neon → **Databases** → **New database** → name `dealbook_test`, owner `neondb_owner`. (Or create a **branch** named `test` and a database `dealbook_test` in it.)
2. **Connect** → database `dealbook_test`, owner, pooling OFF → `TEST_MIGRATION_DATABASE_URL=postgresql+psycopg://neondb_owner:FAKEpass123@ep-cool-name-123456.ap-southeast-1.aws.neon.tech/dealbook_test?sslmode=require`
3. Grant `app_user` on it: bash `scripts/dt.sh create-role-test` · PowerShell `.\scripts\dt.ps1 create-role-test` (same app_user password).
4. Migrate it: `dt migrate-test`.
5. `TEST_DATABASE_URL=postgresql+psycopg://app_user:FAKEappPass456@ep-cool-name-123456-pooler.ap-southeast-1.aws.neon.tech/dealbook_test?sslmode=require`

| Variable | Goes to |
|---|---|
| `TEST_DATABASE_URL`, `TEST_MIGRATION_DATABASE_URL` | local `backend/.env` only (GitHub CI uses its own throwaway Postgres) |

## 3. Google OAuth (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)
1. <https://console.cloud.google.com/> → create project "DealBook".
2. **APIs & Services → OAuth consent screen** → External → app name, support email → scopes `openid`, `email`, `profile` → add your two Google accounts as **Test users** (needed for the two-account check).
3. **Credentials → Create credentials → OAuth client ID → Web application**.
4. **Authorized JavaScript origins:** `http://localhost:5173` and later `https://<your-app>.vercel.app`.
5. **Authorized redirect URIs:** `http://localhost:5173/api/auth/google/callback` and later `https://<your-app>.vercel.app/api/auth/google/callback`. (`check_setup` prints the exact URI for your `FRONTEND_URL`.)
6. Copy: `GOOGLE_CLIENT_ID=1234567890-abcdefFAKE.apps.googleusercontent.com`, `GOOGLE_CLIENT_SECRET=GOCSPX-FAKEFAKEFAKE`.

| Variable | Goes to |
|---|---|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | local `backend/.env`, Render |

## 4. SESSION_SECRET
- bash: `python3 -c "import secrets; print(secrets.token_urlsafe(48))"`
- PowerShell: `py -c "import secrets; print(secrets.token_urlsafe(48))"`
- Example: `SESSION_SECRET=Zx8FAKE…(64 chars)`. Use a **different** value for Render than for local. Goes to: local `.env`, Render.

## 5. Other values
| Variable | Local value | Render value |
|---|---|---|
| `ENV` | `dev` | `prod` |
| `FRONTEND_URL` | `http://localhost:5173` | `https://<your-app>.vercel.app` |
| `ADMIN_EMAILS` | optional, e.g. `you@gmail.com` | same (used from Phase 4) |
| `RATE_LIMIT_ENABLED` | empty (= true) | `true` |
| `APP_USER_PASSWORD` | leave empty (you will be prompted) | not needed |
| Vercel | — | no environment variables; only edit `frontend/vercel.json` (Render URL) |
| `frontend/.env` | `VITE_API_PROXY_TARGET` empty; `E2E_DATABASE_URL` = TEST_DATABASE_URL with `postgresql://` | — |

## 6. Check
bash `scripts/check_setup.sh` · PowerShell `.\scripts\check_setup.ps1` → all lines should say PASS. Then follow [VERIFY_ON_MY_MACHINE.md](VERIFY_ON_MY_MACHINE.md).
