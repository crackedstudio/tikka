# docs/archive — Index

> **This directory is read-only history.** All files here are superseded.
> Do not add new documents here; open a living doc under `docs/` instead.
> See the [Active documentation index](../README.md) for current references.

Working notes, status summaries, implementation write-ups, and completed-task
reports that accumulated during development and were moved here during the
docs consolidation (issue #1514). Files with surviving information were folded
into the active `docs/` tree before archiving; the canonical locations are
noted per file below.

22 pure-noise files (build logs, one-liner stubs, Windows push scripts,
git-workflow helpers) were **deleted** during this consolidation pass.

---

## Subdirectory

| Path | Contents | Superseded by |
|------|----------|---------------|
| [`backend-validation/`](./backend-validation/README.md) | 7 backend validation docs consolidated in #1346 | [`docs/backend/validation.md`](../backend/validation.md) |

---

## Files by topic

### Backend

| File | Date | Summary | Superseded by |
|------|------|---------|---------------|
| [2026-08-28-backend-IMPLEMENTATION_REPORT.md](./2026-08-28-backend-IMPLEMENTATION_REPORT.md) | 2026-03-30 | Zod validation rollout across all backend controllers and DTOs | [`docs/backend/validation.md`](../backend/validation.md) |
| [2026-08-28-backend-NOTIFICATION_IMPLEMENTATION.md](./2026-08-28-backend-NOTIFICATION_IMPLEMENTATION.md) | 2026-08-28 | Backend notification service: DB schema, SSE endpoint, delivery worker | [`docs/testing/notifications-testing-guide.md`](../testing/notifications-testing-guide.md) |
| [2026-08-28-backend-NOTIFICATION_PREFERENCES_IMPLEMENTATION.md](./2026-08-28-backend-NOTIFICATION_PREFERENCES_IMPLEMENTATION.md) | 2026-08-28 | Notification preferences endpoint (`/notifications/preferences`) | [`docs/testing/notifications-testing-guide.md`](../testing/notifications-testing-guide.md) |
| [FIXES_APPLIED.md](./FIXES_APPLIED.md) | — | Zod vs class-validator fix for notification SubscribeDto | [`docs/backend/validation.md`](../backend/validation.md) |

### Backups

| File | Date | Summary | Superseded by |
|------|------|---------|---------------|
| [2026-08-28-backups-IMPLEMENTATION_SUMMARY.md](./2026-08-28-backups-IMPLEMENTATION_SUMMARY.md) | 2026-08-28 | Backup system design: pg_dump schedule, S3 rotation, restore scripts (issue #632) | [`docs/backups/README.md`](../backups/README.md) |
| [2026-08-28-backups-VALIDATION_CHECKLIST.md](./2026-08-28-backups-VALIDATION_CHECKLIST.md) | 2026-08-28 | Post-restore validation checklist | [`docs/backups/RESTORE_PROCEDURES.md`](../backups/RESTORE_PROCEDURES.md) |

### Client

| File | Date | Summary | Superseded by |
|------|------|---------|---------------|
| [2026-08-28-client-CurrentState.md](./2026-08-28-client-CurrentState.md) | 2026-08-28 | Client codebase state snapshot — components, hooks, pages inventory | Current source tree |
| [2026-08-28-client-ISSUES.md](./2026-08-28-client-ISSUES.md) | 2026-08-28 | Open client issues and bugs captured at sprint boundary | GitHub Issues |
| [2026-08-28-client-NOTIFICATION_IMPLEMENTATION.md](./2026-08-28-client-NOTIFICATION_IMPLEMENTATION.md) | 2026-08-28 | Client-side notification bell, subscription modal, preference toggles | [`docs/testing/notifications-testing-guide.md`](../testing/notifications-testing-guide.md) |

### Indexer

| File | Date | Summary | Superseded by |
|------|------|---------|---------------|
| [2026-08-28-indexer-ARCHIVE_IMPLEMENTATION_SUMMARY.md](./2026-08-28-indexer-ARCHIVE_IMPLEMENTATION_SUMMARY.md) | 2026-08-28 | Raffle-events archiver: partition strategy, batch job, CLI | [`docs/runbooks/archive-raffle-events.md`](../runbooks/archive-raffle-events.md) |
| [2026-08-28-indexer-ARCHIVE_VERIFICATION_CHECKLIST.md](./2026-08-28-indexer-ARCHIVE_VERIFICATION_CHECKLIST.md) | 2026-08-28 | Checklist verifying archiver job against acceptance criteria | [`docs/runbooks/archive-raffle-events.md`](../runbooks/archive-raffle-events.md) |
| [2026-08-28-indexer-DATABASE_SCHEMA_VERIFICATION.md](./2026-08-28-indexer-DATABASE_SCHEMA_VERIFICATION.md) | 2026-08-28 | Verification that indexer DB schema matches contract event types | [`docs/database/indexer-schema.md`](../database/indexer-schema.md) |
| [2026-08-28-indexer-DLQ_HTTP_API_IMPLEMENTATION.md](./2026-08-28-indexer-DLQ_HTTP_API_IMPLEMENTATION.md) | 2026-08-28 | Dead-letter queue HTTP API: list, replay, clear endpoints | [`docs/runbooks/dlq-growth.md`](../runbooks/dlq-growth.md) |
| [2026-08-28-indexer-DLQ_METRICS_IMPLEMENTATION.md](./2026-08-28-indexer-DLQ_METRICS_IMPLEMENTATION.md) | 2026-08-28 | DLQ Prometheus metrics (`indexer_dlq_depth`, `indexer_dlq_events_total`) | [`docs/observability/METRICS_MAP.md`](../observability/METRICS_MAP.md) |
| [2026-08-28-indexer-ENTITY_DOCS_CHECKLIST.md](./2026-08-28-indexer-ENTITY_DOCS_CHECKLIST.md) | 2026-08-28 | Checklist for indexer entity JSDoc coverage | [`docs/database/indexer-schema.md`](../database/indexer-schema.md) |
| [2026-08-28-indexer-ENTITY_DOCUMENTATION_SUMMARY.md](./2026-08-28-indexer-ENTITY_DOCUMENTATION_SUMMARY.md) | 2026-08-28 | Summary of all TypeORM entity fields documented in this pass | [`docs/database/indexer-schema.md`](../database/indexer-schema.md) |
| [2026-08-28-indexer-IMPLEMENTATION_SUMMARY.md](./2026-08-28-indexer-IMPLEMENTATION_SUMMARY.md) | 2026-08-28 | Indexer sprint summary: event ingestor, ticket processor, DLQ | [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) |
| [2026-08-28-indexer-TEST_RESULTS.md](./2026-08-28-indexer-TEST_RESULTS.md) | 2026-08-28 | Indexer unit + integration test run results at 2026-08-28 | Superseded by CI history |
| [2026-08-28-indexer-TICKET_PROCESSOR_VERIFICATION.md](./2026-08-28-indexer-TICKET_PROCESSOR_VERIFICATION.md) | 2026-08-28 | Verification checklist for ticket processor idempotency and ordering | Superseded by CI |
| [2026-08-28-indexer-VERIFICATION_REPORT.md](./2026-08-28-indexer-VERIFICATION_REPORT.md) | 2026-08-28 | Full indexer verification report: event counts, lag, error rates | Superseded by Grafana dashboards |

### Oracle

| File | Date | Summary | Superseded by |
|------|------|---------|---------------|
| [2026-08-28-oracle-COMPONENT_HEALTH_IMPLEMENTATION.md](./2026-08-28-oracle-COMPONENT_HEALTH_IMPLEMENTATION.md) | 2026-08-28 | Oracle component health check endpoints (issue #589) | [`docs/observability/METRICS_MAP.md`](../observability/METRICS_MAP.md) |
| [2026-08-28-oracle-CONFIG_IMPLEMENTATION_SUMMARY.md](./2026-08-28-oracle-CONFIG_IMPLEMENTATION_SUMMARY.md) | 2026-08-28 | Oracle config module: env validation, hot-reload | [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) |
| [2026-08-28-oracle-CONFIG_VERIFICATION_CHECKLIST.md](./2026-08-28-oracle-CONFIG_VERIFICATION_CHECKLIST.md) | 2026-08-28 | Checklist verifying oracle config acceptance criteria | Superseded |
| [2026-08-28-oracle-COST_ESTIMATOR_IMPLEMENTATION.md](./2026-08-28-oracle-COST_ESTIMATOR_IMPLEMENTATION.md) | 2026-08-28 | Fee/cost estimator utility for oracle tx submission | [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) |
| [2026-08-28-oracle-E2E_IMPLEMENTATION_SUMMARY.md](./2026-08-28-oracle-E2E_IMPLEMENTATION_SUMMARY.md) | 2026-08-28 | Oracle E2E test harness: contract stubs, scenario scripts | Superseded by CI |
| [2026-08-28-oracle-E2E_TESTS_COMPLETE.md](./2026-08-28-oracle-E2E_TESTS_COMPLETE.md) | 2026-08-28 | Oracle E2E test pass report | Superseded by CI |
| [2026-08-28-oracle-ORACLE_CONSENSUS_CHECKLIST.md](./2026-08-28-oracle-ORACLE_CONSENSUS_CHECKLIST.md) | 2026-08-28 | Checklist for oracle consensus threshold feature | [`docs/RANDOMNESS_SCHEME.md`](../RANDOMNESS_SCHEME.md) |
| [2026-08-28-oracle-ORACLE_CONSENSUS_IMPLEMENTATION.md](./2026-08-28-oracle-ORACLE_CONSENSUS_IMPLEMENTATION.md) | 2026-08-28 | Multi-oracle consensus: quorum validation, threshold config | [`docs/RANDOMNESS_SCHEME.md`](../RANDOMNESS_SCHEME.md) |
| [2026-08-28-oracle-PRIORITY_QUEUE_IMPLEMENTATION.md](./2026-08-28-oracle-PRIORITY_QUEUE_IMPLEMENTATION.md) | 2026-08-28 | Priority queue for draw requests: deadline-aware scheduling | [`docs/design/oracle-priority-queue/design.md`](../design/oracle-priority-queue/design.md) |
| [2026-08-28-oracle-PRIORITY_QUEUE_SUMMARY.md](./2026-08-28-oracle-PRIORITY_QUEUE_SUMMARY.md) | 2026-08-28 | Summary of priority queue feature | [`docs/design/oracle-priority-queue/design.md`](../design/oracle-priority-queue/design.md) |
| [2026-08-28-oracle-QUEUE_STATE_MACHINE_CHECKLIST.md](./2026-08-28-oracle-QUEUE_STATE_MACHINE_CHECKLIST.md) | 2026-08-28 | State machine acceptance checklist | [`docs/design/oracle-priority-queue/design.md`](../design/oracle-priority-queue/design.md) |
| [2026-08-28-oracle-QUEUE_STATE_MACHINE_IMPLEMENTATION.md](./2026-08-28-oracle-QUEUE_STATE_MACHINE_IMPLEMENTATION.md) | 2026-08-28 | Draw-request state machine: PENDING→PROCESSING→DONE/FAILED | [`docs/design/oracle-priority-queue/design.md`](../design/oracle-priority-queue/design.md) |
| [2026-08-28-oracle-QUEUE_STATE_MACHINE_SUMMARY.md](./2026-08-28-oracle-QUEUE_STATE_MACHINE_SUMMARY.md) | 2026-08-28 | Summary of state machine design | [`docs/design/oracle-priority-queue/design.md`](../design/oracle-priority-queue/design.md) |
| [2026-08-28-oracle-TEST_REPORT.md](./2026-08-28-oracle-TEST_REPORT.md) | 2026-08-28 | Oracle unit test report at 2026-08-28 | Superseded by CI |
| [2026-08-28-oracle-TEST_VERIFICATION_REPORT.md](./2026-08-28-oracle-TEST_VERIFICATION_REPORT.md) | 2026-08-28 | Full oracle test verification: suite count, coverage | Superseded by CI |
| [2026-08-28-oracle-TX_SUBMITTER_IMPLEMENTATION_SUMMARY.md](./2026-08-28-oracle-TX_SUBMITTER_IMPLEMENTATION_SUMMARY.md) | 2026-08-28 | Oracle tx submitter: retry policy, fee bump, sequence management | [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) |
| [2026-08-28-oracle-TX_SUBMITTER_VERIFICATION_CHECKLIST.md](./2026-08-28-oracle-TX_SUBMITTER_VERIFICATION_CHECKLIST.md) | 2026-08-28 | Acceptance checklist for tx submitter | Superseded |
| [2026-08-28-oracle-VERIFICATION_CHECKLIST.md](./2026-08-28-oracle-VERIFICATION_CHECKLIST.md) | 2026-08-28 | Oracle overall verification checklist | Superseded |
| [ORACLE_CONSENSUS_SUMMARY.md](./ORACLE_CONSENSUS_SUMMARY.md) | — | Earlier oracle consensus summary (predates 2026-08-28 batch) | [`docs/RANDOMNESS_SCHEME.md`](../RANDOMNESS_SCHEME.md) |
| [AUDIT_LOGGING_IMPLEMENTATION.md](./AUDIT_LOGGING_IMPLEMENTATION.md) | — | Oracle audit-log table, tx_hash column (migration 009) | [`docs/database/oracle-schema.md`](../database/oracle-schema.md) |
| [AUDIT_LOGGING_CHECKLIST.md](./AUDIT_LOGGING_CHECKLIST.md) | — | Checklist for audit logging | [`docs/database/oracle-schema.md`](../database/oracle-schema.md) |
| [TASK_COMPLETE.md](./TASK_COMPLETE.md) | 2026-04-23 | Oracle rescue tool — feature sign-off summary | [`docs/runbooks/oracle-rescue.md`](../runbooks/oracle-rescue.md) |
| [TESTING_COMPLETE.md](./TESTING_COMPLETE.md) | 2026-04-23 | Oracle rescue tool — all tests passed sign-off | [`docs/runbooks/oracle-rescue.md`](../runbooks/oracle-rescue.md) |
| [TEST_REPORT.md](./TEST_REPORT.md) | 2026-04-23 | HSM key management implementation test report | [`docs/runbooks/oracle-key-rotation.md`](../runbooks/oracle-key-rotation.md) |

### SDK / Wallet Adapters

| File | Date | Summary | Superseded by |
|------|------|---------|---------------|
| [2026-08-28-sdk-ALBEDO_IMPLEMENTATION.md](./2026-08-28-sdk-ALBEDO_IMPLEMENTATION.md) | 2026-08-28 | Albedo wallet adapter implementation | [`docs/WALLET_ADAPTERS.md`](../WALLET_ADAPTERS.md) |
| [2026-08-28-sdk-RABET_IMPLEMENTATION.md](./2026-08-28-sdk-RABET_IMPLEMENTATION.md) | 2026-08-28 | Rabet wallet adapter implementation | [`docs/WALLET_ADAPTERS.md`](../WALLET_ADAPTERS.md) |
| [2026-08-28-sdk-BATCH_PURCHASE_IMPLEMENTATION.md](./2026-08-28-sdk-BATCH_PURCHASE_IMPLEMENTATION.md) | 2026-08-28 | SDK batch ticket purchase: multi-op transaction builder | [`docs/RAFFLE_LIFECYCLE.md`](../RAFFLE_LIFECYCLE.md) |
| [2026-08-28-sdk-CONTRACT_BINDINGS_VERIFICATION.md](./2026-08-28-sdk-CONTRACT_BINDINGS_VERIFICATION.md) | 2026-08-28 | Verification of generated contract bindings vs ABI | [`docs/contracts/INTEGRATION_BOUNDARY.md`](../contracts/INTEGRATION_BOUNDARY.md) |
| [FREIGHTER_AUTO_RECONNECT.md](./FREIGHTER_AUTO_RECONNECT.md) | — | Freighter auto-reconnect on page reload via `isConnected()` | [`docs/WALLET_ADAPTERS.md`](../WALLET_ADAPTERS.md) |
| [FREIGHTER_AUTO_RECONNECT_CHECKLIST.md](./FREIGHTER_AUTO_RECONNECT_CHECKLIST.md) | — | Acceptance checklist for Freighter auto-reconnect | [`docs/WALLET_ADAPTERS.md`](../WALLET_ADAPTERS.md) |
| [IMPLEMENTATION_SUMMARY_CLI.md](./IMPLEMENTATION_SUMMARY_CLI.md) | — | SDK CLI improvements — issue #606 (command structure, error output) | SDK changelog |
| [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) | — | Freighter auto-reconnect implementation summary | [`docs/WALLET_ADAPTERS.md`](../WALLET_ADAPTERS.md) |
| [BATCH_PURCHASE_SUMMARY.md](./BATCH_PURCHASE_SUMMARY.md) | — | Batch ticket purchase feature summary | [`docs/RAFFLE_LIFECYCLE.md`](../RAFFLE_LIFECYCLE.md) |

### Notifications feature (issue #27)

| File | Date | Summary | Superseded by |
|------|------|---------|---------------|
| [NOTIFICATION_FEATURE.md](./NOTIFICATION_FEATURE.md) | — | End-to-end notification subscription — full spec + implementation | [`docs/testing/notifications-testing-guide.md`](../testing/notifications-testing-guide.md) |
| [NOTIFICATION_FEATURE_COMPLETE.md](./NOTIFICATION_FEATURE_COMPLETE.md) | — | Notification feature sign-off | [`docs/testing/notifications-testing-guide.md`](../testing/notifications-testing-guide.md) |
| [IMPLEMENTATION_CHECKLIST.md](./IMPLEMENTATION_CHECKLIST.md) | — | Notification feature implementation checklist (#27) | Superseded |
| [FINAL_SUMMARY.md](./FINAL_SUMMARY.md) | — | Notification feature final summary (#27) | [`docs/testing/notifications-quick-start.md`](../testing/notifications-quick-start.md) |
| [README_PR.md](./README_PR.md) | — | Notification feature PR description (#27) | Superseded |
| [PR_CHECKLIST.md](./PR_CHECKLIST.md) | — | PR readiness checklist (#27) | Superseded |
| [PR_READY_CHECKLIST.md](./PR_READY_CHECKLIST.md) | — | PR ready checklist for notification subscription | Superseded |

### Webhook race-condition fix

| File | Date | Summary | Superseded by |
|------|------|---------|---------------|
| [WEBHOOK_RACE_CONDITION_FIX_REPORT.md](./WEBHOOK_RACE_CONDITION_FIX_REPORT.md) | — | Full report: atomic `UPDATE … SET failure_count = failure_count + 1` fix | [`docs/backend/validation.md`](../backend/validation.md) |
| [WEBHOOK_FIX_README.md](./WEBHOOK_FIX_README.md) | — | Implementation details and migration for webhook atomic increment | Superseded |
| [WEBHOOK_FIX_COMPLETE.md](./WEBHOOK_FIX_COMPLETE.md) | — | Webhook fix sign-off summary | Superseded |
| [WEBHOOK_FIX_VERIFICATION.md](./WEBHOOK_FIX_VERIFICATION.md) | — | Webhook fix verification steps | Superseded |
| [WEBHOOK_ALL_CHANGES.md](./WEBHOOK_ALL_CHANGES.md) | — | All file changes in the webhook fix PR | Superseded |
| [WEBHOOK_BEFORE_AFTER_COMPARISON.md](./WEBHOOK_BEFORE_AFTER_COMPARISON.md) | — | Side-by-side code comparison: vulnerable vs fixed webhook code | Superseded |
| [WEBHOOK_FILE_INDEX.md](./WEBHOOK_FILE_INDEX.md) | — | File index for webhook fix workspace changes | Superseded |
| [DELIVERABLES_SUMMARY.md](./DELIVERABLES_SUMMARY.md) | — | Webhook fix deliverables summary | Superseded |

### AddToCalendar feature

| File | Date | Summary | Superseded by |
|------|------|---------|---------------|
| [ADDTOCALENDAR_IMPLEMENTATION.md](./ADDTOCALENDAR_IMPLEMENTATION.md) | 2026-06-27 | AddToCalendar component: 4350+ lines, 59 tests, 4 calendar formats | Current source |
| [ADDTOCALENDAR_INDEX.md](./ADDTOCALENDAR_INDEX.md) | 2026-06-27 | Complete index of AddToCalendar deliverables and files | Superseded |
| [ADDTOCALENDAR_FILES.md](./ADDTOCALENDAR_FILES.md) | 2026-06-27 | File structure for AddToCalendar feature | Superseded |
| [DELIVERABLES_SUMMARY.txt](./DELIVERABLES_SUMMARY.txt) | 2026-06-27 | AddToCalendar deliverables summary (plain text) | Superseded |
| [IMPLEMENTATION_VERIFICATION.md](./IMPLEMENTATION_VERIFICATION.md) | 2026-06-27 | AddToCalendar verification report | Superseded |

### Other features / issues

| File | Date | Summary | Superseded by |
|------|------|---------|---------------|
| [IMPLEMENTATION_LIVE_PARTICIPANTS.md](./IMPLEMENTATION_LIVE_PARTICIPANTS.md) | — | Live participants feed — issue #486 (polling, optimistic updates, animation) | Current source |
| [ISSUE_486_SUMMARY.md](./ISSUE_486_SUMMARY.md) | — | Issue #486 acceptance-criteria sign-off | Superseded |
| [SMOKE_TESTS_IMPLEMENTATION.md](./SMOKE_TESTS_IMPLEMENTATION.md) | — | Playwright E2E smoke tests for client happy paths | `client/tests/e2e/` |
| [MULTI_IMAGE_IMPLEMENTATION.md](./MULTI_IMAGE_IMPLEMENTATION.md) | — | Multi-image support for raffles (gallery, storage schema) | Current source |
| [RELEASE_VERIFICATION.md](./RELEASE_VERIFICATION.md) | — | Release policy verification — issue #627 | [`docs/RELEASE.md`](../RELEASE.md) |
| [VERIFICATION_CHECKLIST.md](./VERIFICATION_CHECKLIST.md) | — | Issue #834 implementation verification checklist | Superseded by CI |
| [issues.md](./issues.md) | — | Scraped issue body for #787 (BaseExceptionFilter) | GitHub issue #787 |
| [SMOKE_TESTS_IMPLEMENTATION.md](./SMOKE_TESTS_IMPLEMENTATION.md) | — | Client E2E smoke tests | `client/tests/e2e/` |

---

## Deleted during #1514 consolidation

The following 22 files were removed as pure noise (no surviving technical information):

| File | Reason for deletion |
|------|---------------------|
| `NOTIFICATION_README.md` | Empty file (0 bytes) |
| `Implement dashboard for indexer lag` | One-line Figma URL stub |
| `build2.txt` | Build error log (TypeScript diagnostic) |
| `build3.txt` | Successful Vite build output log |
| `debug_home.py` | Windows developer debug script |
| `fix_home.py` | Windows developer fix script |
| `TODO.md` | Completed infinite-scroll checklist |
| `2026-08-28-indexer-SNAPSHOT_GUIDE_NOTE.md` | One-line cron note (in runbooks) |
| `QUICK_FIX.md` | Git cherry-pick how-to (no technical content) |
| `FIX_BRANCH_ISSUE.md` | Git branch fix how-to |
| `CHECK_IF_PUSHED.md` | Git push verification how-to |
| `FIND_YOUR_COMMIT.md` | GitHub Desktop navigation guide |
| `GIT_BRANCH_GUIDE.md` | Git branch setup guide (oracle rescue) |
| `PUSH_COMMANDS.md` | Git push command reference |
| `PUSH_GUIDE.md` | Oracle rescue push guide |
| `PUSH_TO_BRANCH.sh` | Oracle rescue push shell script |
| `PUSH_TO_BRANCH.bat` | Oracle rescue push Windows batch script |
| `PUSH_TO_EXISTING_BRANCH.md` | Push-to-branch instructions |
| `PUSH_WITHOUT_DESKTOP.md` | Git push without GitHub Desktop |
| `CREATE_PR_GUIDE.md` | PR creation how-to |
| `PR_DESCRIPTION.md` | Partial PR description stub |
