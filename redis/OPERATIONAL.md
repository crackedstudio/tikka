# Redis OPERATIONAL stub

Owner: @redis-team

Required links:
- Dashboards:
  - Memory usage: <link>
  - Eviction rate: <link>

Alerts:
- Memory > 80% (Pager: @redis-team)
- Eviction spikes or persistence failures

Runbook:
- Failover to replica, warm caches, restore critical keyspaces.

Rollback instructions:
- Steps for reverting config changes and restoring persistence files.

Verification:
- Backup & restore for critical keys tested.

Current gaps:
- Backup playbook for keyspaces missing
