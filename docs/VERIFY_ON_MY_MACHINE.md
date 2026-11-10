# VERIFY_ON_MY_MACHINE — checks only you can do (real credentials)

**TL;DR**
- These need your real Neon, Google, Render and Vercel accounts, so they were NOT verified in the build workspace.
- Do them in order; each has steps and the expected result. Stop at the first failure and read the error text.
- Setup values: [SETUP_CREDENTIALS.md](SETUP_CREDENTIALS.md). Commands use `dt` = `scripts/dt.sh` (bash) or `.\scripts\dt.ps1` (PowerShell).

## 1. check_setup
Steps: fill `backend/.env` → `dt migrate` → `dt migrate-test` → bash `scripts/check_setup.sh` / PowerShell `.\scripts\check_setup.ps1`.
Expected: every line PASS (app_user, no BYPASSRLS, latest revision, both RLS smoke checks, test DB name, Google ID format). Then `dt test` → all backend tests and Vitest pass.

## 2. Two Google accounts see only their own data
Steps: `dt backend` and `dt frontend` (two terminals) → open <http://localhost:5173> → Continue with Google (account A) → add deal "A only" → Settings → Log out → log in with account B.
Expected: B sees no deals and no mediators; after logging back in as A, "A only" is there.

## 3. Offline add syncs
Steps (Chrome DevTools → Network → Offline, or phone airplane mode on the deployed app): add a deal.
Expected: it appears instantly, chip shows "Offline" / "1 pending". Go online → chip becomes "Synced" within ~5 s (up to ~1 min on a sleeping Render), and the deal is still there after reload or on another device.

## 4. Logout wipes local data
Steps: logged in with deals → Settings → Log out → DevTools → Application → IndexedDB / Local Storage.
Expected: no `dealbook-local` data with deals and no `dealbook:` keys; going offline and opening the app shows the login page, not the old deals.

## 5. Deploy to Render + Vercel
Steps: Render Blueprint from `render.yaml` with all env vars (`ENV=prod`, `FRONTEND_URL=https://<app>.vercel.app`) → set the Render host in `frontend/vercel.json` → Vercel project with root `frontend` → add the Vercel origin + redirect URI in Google.
Expected: `https://<render-host>/api/health` → `{"status":"ok"}`; `https://<app>.vercel.app/api/health` → same (rewrite works); Google login on the Vercel URL lands on Home; DevTools shows the `__Host-dt_session` cookie on the Vercel domain (HttpOnly, Secure, Path=/, no Domain), with 30-day idle and 90-day absolute session expiry.

## 6. Install the PWA on Android
Steps: open the Vercel URL in Android Chrome → "Install app" banner (or menu → Install app) → open from the home screen → enable airplane mode → reopen.
Expected: opens standalone with the icon; opens offline showing your local deals; iPhone Safari shows the one-time "Share → Add to Home Screen" hint.
