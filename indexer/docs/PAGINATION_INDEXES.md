# Pagination Index Strategy

This document outlines the database index optimization strategy for stable and efficient pagination across high-churn list endpoints.

## Problem Statement

Offset pagination over growing tables degrades on deep pages, and concurrent inserts during pagination can produce duplicates or skipped entries. This is mitigated through:

1. **Cursor-based (keyset) pagination** - O(1) seek time regardless of page depth
2. **Proper indexing** - Supporting sort columns and filter columns
3. **Query timeouts** - Preventing resource exhaustion on pathological queries
4. **Deterministic tie-breaking** - Ensuring stable ordering across pagination boundaries

## Index Requirements by Endpoint

### 1. Raffles List (`GET /raffles`)

**Pagination Strategy**: Cursor-based (createdAt DESC, id ASC)

**Query Pattern**:
```sql
SELECT * FROM raffles
WHERE (
  status = :status (optional filter)
  AND creator = :creator (optional filter)
  AND asset = :asset (optional filter)
)
AND (
  -- Keyset condition for cursor pagination
  created_at < :cursor_timestamp
  OR (created_at = :cursor_timestamp AND id > :cursor_id)
)
ORDER BY created_at DESC, id ASC
LIMIT :limit
```

**Indexes Required**:
- ✅ `idx_raffles_created_at_id` - Primary pagination sort (created_at DESC, id ASC)
- ✅ `idx_raffles_status_created_at_id` - For filtered list queries
- ✅ `idx_raffles_status_created_at` - Existing (covers status filter + created_at sort)
- ✅ `idx_raffles_creator` - For creator filter
- ✅ `idx_raffles_status` - For status filter

**Migration**: [1785000000000-AddPaginationIndexes.ts](./migrations/1785000000000-AddPaginationIndexes.ts)

**Performance Impact**:
- **Before**: Deep offset queries scan O(n) rows; index scans O(log n)
- **After**: Cursor queries scan O(limit) rows; index seek O(log n)
- **Concurrent insert stability**: Keyset WHERE clause prevents duplicates/skips

### 2. Leaderboard (`GET /leaderboard`)

**Pagination Strategy**: Cursor-based (deterministic 6-level tie-breaking)

**Sort Cascade** (by sort mode):
```
Wins Mode:
1. totalRafflesWon DESC
2. totalPrizeXlm DESC (tie-breaker 1)
3. totalTicketsBought DESC (tie-breaker 2)
4. totalRafflesWon DESC (tie-breaker 3)
5. firstSeenLedger ASC (tie-breaker 4)
6. address ASC (tie-breaker 5)

Volume Mode: (totalPrizeXlm DESC as primary, rest same)
Tickets Mode: (totalTicketsBought DESC as primary, rest same)
```

**Indexes Required**:
- ✅ `IDX_USERS_TOTAL_RAFFLES_WON_ADDRESS` - For wins mode
- ✅ `IDX_USERS_TOTAL_PRIZE_XLM_NUMERIC_ADDRESS` - For volume mode
- ✅ `IDX_USERS_TOTAL_TICKETS_BOUGHT_ADDRESS` - For tickets mode

**Migration**: [1770000000000-AuditHotPathIndexes.ts](./migrations/1770000000000-AuditHotPathIndexes.ts)

**Index Optimization Notes**:
- All indexes include address ASC as final tie-breaker (lexicographic ordering)
- CAST to NUMERIC for volume mode ensures numeric comparison (not string)
- Covers all three sort modes with single primary+secondary index each

### 3. Raffle Participants (`GET /raffles/:id/participants`)

**Pagination Strategy**: Offset-based (with cursor option for future)

**Query Pattern**:
```sql
SELECT owner, COUNT(*), MIN(purchased_at_ledger) as first_purchase
FROM tickets
WHERE raffle_id = :raffle_id
GROUP BY owner
ORDER BY first_purchase ASC
LIMIT :limit
OFFSET :offset
```

**Indexes Required**:
- ✅ `idx_tickets_raffle_id_purchased_at_ledger` - Covers raffle filter + sort order
- ✅ `idx_tickets_owner_raffle_id` - For owner lookups

**Migration**: [1785000000000-AddPaginationIndexes.ts](./migrations/1785000000000-AddPaginationIndexes.ts)

**Performance Impact**:
- Reduces full table scan to index scan
- Supports GROUP BY + ORDER BY efficiently

## Index Creation Rationale

### Composite Index Ordering Rules

1. **Filter columns first** (WHERE clauses)
   - Reduces rows examined before sorting
   - Order doesn't matter among filters (optimizer handles)

2. **Sort columns second** (ORDER BY)
   - Must match sort order exactly (DESC/ASC)
   - Enables index-only scan for pagination

3. **Tie-breaker columns last** (final sort column for stability)
   - Deterministic ordering across pagination boundaries
   - Enables keyset pagination seek predicates

**Example**: `idx_raffles_status_created_at_id`
```
Filter:     status ASC (narrower set)
Sort:       created_at DESC (primary order)
Tie-break:  id ASC (deterministic, enables keyset)
```

### Why DESC vs ASC

- **Primary sort DESC**: Newest/highest values first (user expectation)
- **Tie-breaker ASC**: Stable ordering; lexicographic for addresses, numeric for IDs
- **Cursor predicates**: Designed for DESC primary with ASC tie-breaker
  ```sql
  -- For DESC sort: next rows are those < cursor value
  WHERE created_at < :cursor_timestamp
  OR (created_at = :cursor_timestamp AND id > :cursor_id)
  ```

## Query Execution Plan Examples

### Raffle List with Cursor (idx_raffles_created_at_id)

```
EXPLAIN ANALYZE
SELECT * FROM raffles
WHERE (created_at < '2024-01-01 12:30:00' OR (created_at = '2024-01-01 12:30:00' AND id > 100))
ORDER BY created_at DESC, id ASC
LIMIT 20;

Index Scan using idx_raffles_created_at_id on raffles
  Filter: (created_at < '2024-01-01 12:30:00') OR ...
  Rows: ~20
  Estimated Cost: ~50 (vs. 100000+ for sequential scan)
```

### Leaderboard Query (IDX_USERS_TOTAL_RAFFLES_WON_ADDRESS)

```
EXPLAIN ANALYZE
SELECT * FROM users
WHERE (total_raffles_won < 5 OR (total_raffles_won = 5 AND address > 'GAAA...'))
ORDER BY total_raffles_won DESC, address ASC
LIMIT 20;

Index Scan using IDX_USERS_TOTAL_RAFFLES_WON_ADDRESS on users
  Filter: (total_raffles_won < 5) OR ...
  Rows: ~20
  Estimated Cost: ~100 (vs. full table scan)
```

## Monitoring and Maintenance

### Index Size Monitoring

```sql
-- Check index sizes (useful for storage planning)
SELECT
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) as size
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC;
```

### Index Utilization

```sql
-- Find unused indexes (candidates for removal)
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC;
```

### Slow Query Analysis

```sql
-- Enable slow query logging (see DATABASE configuration)
-- Queries slower than SLOW_QUERY_THRESHOLD_MS are logged

-- Check for full table scans in slow queries
EXPLAIN ANALYZE SELECT ...  -- Your slow query here
```

### Reindex Strategy

```sql
-- Periodic reindex (optional, PostgreSQL auto-manages in most cases)
-- REINDEX INDEX CONCURRENTLY idx_raffles_created_at_id;
-- REINDEX TABLE CONCURRENTLY raffles;
```

## Known Limitations and Future Improvements

### Current Limitations

1. **Participants pagination**: Currently uses offset; could migrate to cursor for consistency
2. **User history**: Uses offset; could benefit from cursor for deep pages
3. **Search results**: Uses in-memory sort; not indexed (metadata query then merge)

### Future Index Additions

1. **Raffle end time**: If pagination by `endTime` is needed
   ```sql
   CREATE INDEX idx_raffles_end_time ON raffles (end_time DESC);
   ```

2. **Raffle finalization**: If tracking finalized raffles efficiency
   ```sql
   CREATE INDEX idx_raffles_finalized_ledger ON raffles (finalized_ledger DESC)
   WHERE finalized_ledger IS NOT NULL;
   ```

3. **Composite ticket index**: If ticket search becomes a bottleneck
   ```sql
   CREATE INDEX idx_tickets_owner_purchased_at ON tickets (owner, purchased_at_ledger DESC);
   ```

## Testing Index Performance

### Test Script

```typescript
// Measure pagination performance
const startTime = performance.now();

for (let page = 1; page <= 100; page += 10) {
  const offset = (page - 1) * pageSize;
  const result = await controller.list({ limit: pageSize, offset });
  console.log(`Page ${page}: ${performance.now() - startTime}ms`);
}

// Expected: Linear time growth with offset (bad) vs. constant with cursor (good)
```

## References

- [PostgreSQL Index Types](https://www.postgresql.org/docs/current/indexes-types.html)
- [Keyset Pagination (Use the Index, Luke)](https://use-the-index-luke.com/sql/partial-results/keyset-pagination)
- [Performance Tips](https://www.postgresql.org/docs/current/performance-tips.html)
- Issue: #1584 - Add pagination limits and cursor stability to list endpoints
