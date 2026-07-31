# Audit Log Retention Policy

This document defines the retention policy for VRF audit log records in the Tikka oracle.

## Overview

The `vrf_audit_log` table stores tamper-evident records of all VRF (Verifiable Random Function) randomness submissions. These records are critical for dispute resolution and transparency.

## Retention Policy

| Record Status | Retention Period | Rationale |
|---------------|-----------------|-----------|
| `revealed` (success) | **Indefinite (7 years minimum)** | Final successful state; needed for dispute resolution and compliance |
| `committed` (pending) | **90 days** | Intermediate state; if no reveal within 90 days, the raffle was abandoned |
| `abandoned` | **90 days** | Failed/abandoned submissions; useful for debugging but not long-term |

### Implementation

Records are retained based on their `committed_at` timestamp:

```sql
-- Delete abandoned/committed records older than 90 days
DELETE FROM vrf_audit_log
WHERE status IN ('committed', 'abandoned')
  AND committed_at < NOW() - INTERVAL '90 days';

-- Revealed records are retained indefinitely
-- (no automatic deletion)
```

## Automated Cleanup

A cleanup job should run weekly to remove expired records:

```sql
-- Run as a scheduled job (e.g., pg_cron or application-level)
WITH deleted AS (
  DELETE FROM vrf_audit_log
  WHERE status IN ('committed', 'abandoned')
    AND committed_at < NOW() - INTERVAL '90 days'
  RETURNING id
)
SELECT COUNT(*) AS deleted_count FROM deleted;
```

## Backup Considerations

- All audit records are included in daily pg_dump backups
- Backup retention: 30 days (Cloudflare R2)
- For compliance, consider exporting `revealed` records to long-term storage (e.g., S3 Glacier) before any cleanup

## Data Classification

| Field | Classification | Notes |
|-------|---------------|-------|
| `raffle_id` | Public | Links to raffle; not sensitive |
| `commitment_hash` | Public | SHA-256 of VRF inputs; for verification |
| `reveal_hash` | Public | SHA-256 of revealed values; for verification |
| `proof` | Public | VRF cryptographic proof; for verification |
| `seed` | Sensitive | Random seed; handle with care |
| `oracle_public_key` | Public | Oracle's Stellar public key |
| `status` | Public | committed/revealed/abandoned |
| `chain_hash` | Public | Tamper-evident chain link |
| `tx_hash` | Public | Stellar transaction hash |

## Querying the Audit Log

### Via API

```bash
# By raffle ID
curl http://localhost:3003/oracle/audit/42

# By time range
curl "http://localhost:3003/oracle/audit?from=2026-01-01T00:00:00Z&to=2026-07-27T00:00:00Z"

# By status
curl "http://localhost:3003/oracle/audit?status=revealed"

# Summary counts
curl http://localhost:3003/oracle/audit/summary
```

### Via CLI

```bash
cd oracle
npm run audit:query -- by-raffle 42
npm run audit:query -- by-time --from 2026-01-01T00:00:00Z --to 2026-07-27T00:00:00Z
npm run audit:query -- by-status revealed --limit 50
npm run audit:query -- summary
npm run audit:query -- verify-chain
```

### Direct SQL

```sql
-- Records for a specific raffle
SELECT * FROM vrf_audit_log WHERE raffle_id = 42;

-- Records in the last 30 days
SELECT * FROM vrf_audit_log
WHERE committed_at > NOW() - INTERVAL '30 days'
ORDER BY committed_at DESC;

-- Summary by status
SELECT status, COUNT(*) as count
FROM vrf_audit_log
GROUP BY status;
```
