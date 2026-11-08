# DealTracker — PRD

## Original problem statement
Multi-user, mobile-first offline-first PWA for Indian review-deal users (INR). Phase 1: scaffold, Google login, RLS isolation, PWA shell. Phase 2 (+ Phase 1 gap fixes + handoff docs): deals/mediators CRUD, idempotent offline sync (outbox, LWW), summary, alerts, settings; no-Docker setup scripts; AGENTS/ARCHITECTURE/IMPLEMENTATION/ROADMAP/SETUP_CREDENTIALS/VERIFY docs. No credentials provided: verify with local Postgres 16 and mocked Google only.

## User choices
- Standalone repo `/app/dealtracker` (history in `/app/.dealtracker-git` + `/app/dealtracker-history.bundle`)
- Own Google OAuth (Authlib); user declined Emergent-managed sign-in
- No credentials; real Neon/Google/Render/Vercel checks left to the user (docs/VERIFY_ON_MY_MACHINE.md)

## Implemented
- 2026-06 Phase 1: auth, sessions, RLS, PWA shell (9 commits)
- 2026-06 Phase 2: migration 0002, 21 API routes, rules module, Dexie offline store + sync engine, 7 screens, docs, CI (30 commits total)
- Tests: 78 pytest (as app_user, test-DB guard), 18 Vitest, 3 Playwright e2e (+ QA edge specs pass)

## Backlog
- P0 Phase 3 Excel import with mapping + dedupe
- P1 Phase 4 admin aggregates, self-test, support grants, audit log
- P2 Phase 5 UI polish, Phase 6 web push
