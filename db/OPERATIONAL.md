# DB OPERATIONAL stub

Owner: @db-team

Required links:
- Dashboards:
  - Replication lag: <link>
  - Disk usage & slow queries: <link>

Alerts:
- Backup failures (Pager: @db-team)
- Replication lag above threshold

Runbook:
- Restore from backup, point-in-time restore instructions.

Rollback instructions:
- How to revert problematic migrations and validate data integrity.

Verification:
- Test restore cadence and sanity checks.

Current gaps:
- Monthly test restores not automated
