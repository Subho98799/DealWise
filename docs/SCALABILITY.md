# Scalability and capacity

## What has not been measured

No local PostgreSQL benchmark or load test has been run for this hardening work. There are no seeded 50,000-deal/500-user results, `EXPLAIN (ANALYZE, BUFFERS)` plans, endpoint p50/p95 latencies, throughput numbers, or measured error rates. Therefore this document makes no user-capacity estimate.

No production or hosted service was load-tested. Limits below describe the deployment configuration and provider documentation reviewed for the security audit; the actual account plans, quotas, usage, and deployed topology were not verified.

## Current constraints

- The SQLAlchemy pool is configured for 5 connections plus 5 overflow connections per process. Uvicorn runs one worker by default, so that is up to 10 pooled database connections per process. Multiple instances multiply the total.
- Rate limits are in-memory and per instance. Auth endpoints use forwarded-client-IP keys; authenticated routes and stricter import/sync-push limits use the resolved user ID. Forwarded-IP trust through Vercel to Render must be verified after deployment.
- Import duplicate detection loads a user's active deals into application memory. The mediator list is not paginated. These are candidates for measurement, not proof of a performance failure.
- There is no background job runner. Import-job and sync-op retention is bounded and opportunistic, not scheduled.
- The Render configuration selects one free web service. Audit-time provider documentation listed free services sleeping after 15 minutes idle, roughly one-minute wake-up, a 750 free instance-hours/workspace/month pool, and one free instance.
- Audit-time Neon Free documentation listed 100 CU-hours/project, 1 GB storage/project, 5 GB public network transfer/project, and compute scale-to-zero after five minutes idle.
- Vercel account plan and quotas were not verified. Do not assume a hard spend cap is available on a free plan.

Provider plans and quotas change; verify current limits in the owning accounts before planning capacity.

## Measure first

Start with the active-deal query used by import preview/commit duplicate detection in [`backend/app/repos/imports.py`](../backend/app/repos/imports.py). Measure representative user sizes with `EXPLAIN (ANALYZE, BUFFERS)` and record memory and response payload size. Next measure filtered deal lists, summary aggregates, sync pulls, and mediator totals.

Use a disposable local/test database with representative data. Record endpoint p50/p95 latency, error rate, database connection usage, and payload sizes under a bounded local load test. Do not run these tests against production or hosted services.

## Upgrade path

1. Establish a reproducible local baseline and retain query plans and load-test results.
2. Optimize duplicate matching, pagination, and indexes only where the measured plans identify a bottleneck; add regression tests.
3. If imports materially affect request latency, move parsing/commit work into a bounded background worker and queue.
4. If multiple instances are needed, move rate limiting to a shared store and budget database connections across every worker and instance.
5. Upgrade Render/Neon tiers based on measured cold starts, compute, storage, egress, and connection limits. Recheck backups, quotas, and alerting after each change.

The security audit's findings, provider sources, and unverified assumptions are recorded in [SECURITY_AUDIT.md](SECURITY_AUDIT.md).
