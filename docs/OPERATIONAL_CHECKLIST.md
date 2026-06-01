# Operational Checklist

This single checklist centralizes operational requirements for releases and incident response across the project.

How to use
- Keep this file as the canonical checklist for release planning and on-call readiness.
- Where a package needs package-specific details, add `OPERATIONAL.md` beside that package and link it here.

Owners notation: @team/name — replace with actual owner or pager.

---

**Scope**: client, backend, indexer, oracle, SDK, databases, Redis, storage, secrets

## 1. Global requirements
- Slack/Pager duty roster: Owner: @platform-ops — Location: `docs/oncall.md` (create if missing)
- Deploy pipeline health: Owner: @ci — Location: CI dashboard (link in package OPERATIONAL.md)
- Backup & restore runbook: Owner: @db-team — Location: `docs/backups.md`
- Secrets inventory + rotation schedule: Owner: @security — Location: `docs/secrets.md`

Gaps: centralized oncall doc missing, per-package CI dashboards inconsistent.

## 2. Client
- Checklist:
  - Crash/error reporting enabled (Sentry/Equivalent).
  - Release tagging and package signing.
  - Build reproducibility and artifact retention (7/30/90 days as appropriate).
  - Health check endpoints for end-to-end tests.
- Dashboards: error rate, release adoption, crash-free users.
- Alerts: sudden error spike, release regression > X%.
- Runbook: hướng dẫn rollback to previous version (owner: @client-team) — Location: `client/OPERATIONAL.md`.

Gaps: client release rollback steps missing.

## 3. Backend
- Checklist:
  - Observability: request latency, 5xx rate, saturation metrics.
  - Tracing enabled (distributed tracing) and sampled for important flows.
  - Auth and rate-limiting checks.
  - DB connection pool limits documented.
- Dashboards: service health, latency P50/P95/P99, errors by endpoint.
- Alerts: high error rate, high latency, instance restarts, high CPU/memory.
- Runbook: rollback via deployment tag + DB migration rollback instructions — Location: `backend/OPERATIONAL.md`.

Gaps: tracing instrumentation incomplete on some endpoints.

## 4. Indexer
- Checklist:
  - Exactly-once / idempotency guarantees documented.
  - Reindexing path documented and tested.
  - Backpressure handling for upstream feeds.
- Dashboards: index backlog, last processed block/offset, error counts.
- Alerts: backlog growth, repeated processing failures, lagging offsets.
- Runbook: reindex procedure, partial replays, snapshot restore steps — Location: `indexer/OPERATIONAL.md`.

Gaps: no automated reindex test harness in repo.

## 5. Oracle
- Checklist:
  - Data integrity checks and signing keys management.
  - Fallback/error paths for stale or missing data.
- Dashboards: data freshness, validation errors.
- Alerts: data staleness, signature verification failures.
- Runbook: failover to backup oracle, revoke/rotate keys procedure — Location: `oracle/OPERATIONAL.md`.

Gaps: key rotation steps are not documented.

## 6. SDK
- Checklist:
  - Release compatibility matrix with backend.
  - API contract tests and versioning policy.
  - Changelog and migration notes per release.
- Dashboards: N/A (library), but monitor downstream error reports.
- Alerts: breaking API changes detected in CI contract tests.
- Runbook: deprecate/rollback client SDK versions — Location: `sdk/OPERATIONAL.md`.

Gaps: contract tests not present for some features.

## 7. Databases
- Checklist:
  - Backups: schedule, retention, test restore frequency.
  - Monitoring: replication lag, slow queries, connection count.
  - Migration policy: who approves, staging tests, rollback plan.
- Dashboards: replication lag, disk usage, slow query top N.
- Alerts: backup failures, replication lag > threshold, slow queries above threshold.
- Runbook: restore from backup, point-in-time recovery steps — Location: `docs/backups.md` and `db/OPERATIONAL.md`.

Gaps: test restores not run monthly (documented), migration rollback scripts incomplete.

## 8. Redis
- Checklist:
  - Persistence settings (RDB/AOF) documented and tested.
  - Eviction policy and memory alerts configured.
  - Backup and restore for critical keys.
- Dashboards: memory usage, eviction rate, hits/misses.
- Alerts: memory > 80%, eviction spikes, persistence failures.
- Runbook: failover to replica, data warmup procedure — Location: `redis/OPERATIONAL.md`.

Gaps: backup/restore playbook for critical keyspaces missing.

## 9. Storage (S3/Blob)
- Checklist:
  - Lifecycle policies and retention defined.
  - Bucket permissions audited and least-privilege enforced.
  - Cross-region replication for critical data (if required).
- Dashboards: object counts, 4xx/5xx errors, ingress/egress costs.
- Alerts: permission errors, sudden spike in 4xx/5xx, bucket deletion events.
- Runbook: recover deleted objects from backups or versioning — Location: `storage/OPERATIONAL.md`.

Gaps: object lifecycle policies need standardization.

## 10. Secrets
- Checklist:
  - Central secrets store (Vault/SSM) used by all services.
  - Access review quarterly; emergency rotation steps documented.
  - CI secrets handling: avoid exposing in logs.
- Dashboards: N/A — but audit logs must be forwarded to SIEM.
- Alerts: suspicious secret access, failed rotations.
- Runbook: emergency key rotation, revocation, and re-deploy steps — Location: `docs/secrets.md`.

Gaps: some local dev scripts still use env files; need migration plan.

## Dashboards, Alerts, and Runbooks (cross-cutting)
- Required cross-cutting dashboards:
  - Global service health (all services up)
  - Cost and usage dashboard
  - Security audit events dashboard
- Alerting policy:
  - Severity P0: page on-call and trigger incident process.
  - Severity P1: notify Slack + email.
  - Alert routing: map alerts to owners in PagerDuty/Slack.
- Runbooks:
  - Provide one-command playbooks where possible (scripts + documented steps).
  - Each runbook must include: symptoms, immediate mitigations, root-cause analysis steps, rollback steps, postmortem owner.

## Rollback strategy
- Keep last-known-good artifact for each service.
- DB migrations must be reversible or run with feature flags; document migration downtime and rollback commands.
- Canary releases for major changes with automated health checks.

Gaps: artifact retention policy and canary orchestration docs need standardization.

## Verification & Release planning
- For a release, ensure each package's `OPERATIONAL.md` exists and is referenced here.
- CI must run the package health checks (build, contract tests, basic integration smoke tests) before cut.

Checklist: for each package add a short `OPERATIONAL.md` with the following required fields:
  - Owner: team/pager
  - Dashboards: links
  - Alerts: list + routing
  - Runbook: link
  - Rollback instructions

---

If you want, I can:
- create per-package `OPERATIONAL.md` stubs for `client`, `backend`, `indexer`, `oracle`, `sdk`, `db`, `redis`, `storage`.
- open a PR with this checklist and the stubs.

Replace owner placeholders and add links to dashboards as you update the repository.
