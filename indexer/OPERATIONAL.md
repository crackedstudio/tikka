# Indexer OPERATIONAL stub

Owner: @indexer-team

Required links:
- Dashboards:
  - Index backlog & lag: <link>
  - Error counts: <link>

Alerts:
- Backlog growth or offset lag (Pager: @indexer-team)
- Repeated processing failures

Runbook:
- Reindex procedure, partial replay steps, snapshot restore.

Rollback instructions:
- How to revert to previous index snapshot and verify consistency.

Verification:
- Reindex smoke run on staging.

Current gaps:
- Reindex test harness missing
