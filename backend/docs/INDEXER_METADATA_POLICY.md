# Indexer & Metadata Conflict Resolution Policy

## Overview

Backend responses that combine Supabase metadata with indexer raffle state must follow a clear precedence and freshness policy to prevent conflicts and provide clients with sufficient context for decision-making.

## Data Sources

| Source | Authority | Latency | Use Case |
|--------|-----------|---------|----------|
| **Supabase (metadata)** | Off-chain | Real-time | Title, description, images, category, tags |
| **Indexer** | On-chain (via ledger) | ~2 blocks (~10s) | Raffle status, ticket counts, winner, prize distribution |

## Precedence Rules

### 1. Status & Tickets (Indexer Authority)
**Indexer is the source of truth for on-chain state:**
- `status` (open/closed/finalized)
- `tickets_sold`, `max_tickets`
- `winner`, `prize_amount`
- `created_ledger`, `finalized_ledger`

If metadata exists but indexer row is missing → raffle has NOT been indexed yet (treat as pending).

### 2. Metadata Fields (Supabase Authority)
**Supabase is authoritative for off-chain content:**
- `title`, `description`, `category`, `tags`
- `image_url`, `image_urls`
- `creator` (cross-reference with indexer if available)

If metadata is missing but indexer row exists → display placeholder content ("Untitled Raffle", generic description).

### 3. Timestamps & Ledger Heights
**Use indexer ledger heights as the source of truth:**
- `created_ledger` = the ledger in which raffle was created
- `finalized_ledger` = the ledger in which raffle ended (null = ongoing)
- `ledger_close_time` (from Stellar ledger) = actual block time

**Do NOT use Supabase timestamps for determining raffle state**, only for audit/logging.

## Freshness & Conflict Handling

### Pattern: Metadata-Only (No Indexer Row)
```
Scenario: Raffle created in Supabase but not yet indexed
Response:
{
  "id": null,  // No contract ID yet
  "title": "Raffle Title",
  "status": "pending_indexing",
  "indexedAt": null,
  "sourceUpdatedAt": "2024-06-15T14:30:00Z",  // Metadata created_at
  "warning": "Raffle pending blockchain indexing"
}
```

### Pattern: Indexer-Only (No Metadata Row)
```
Scenario: Raffle exists on-chain but metadata not synced
Response:
{
  "id": 42,
  "title": "Untitled Raffle",
  "status": "open",
  "indexedAt": "2024-06-15T14:35:00Z",
  "sourceUpdatedAt": "2024-06-15T14:35:00Z",  // Indexer ledger close time
  "warning": "Metadata not available; displaying indexed data only"
}
```

### Pattern: Stale Indexer (Metadata Newer Than Indexed State)
```
Scenario: Metadata updated after indexer last sync
Response:
{
  "id": 42,
  "title": "Updated Raffle Title",  // From metadata
  "status": "open",  // From indexer
  "indexedAt": "2024-06-15T14:00:00Z",
  "sourceUpdatedAt": "2024-06-15T14:30:00Z",  // Metadata updated_at
  "staleness": {
    "metadataNewer": true,
    "minutesOld": 30
  }
}
```

### Pattern: Conflicting Status Data
```
Scenario: Metadata says "closed" but indexer says "open"
Resolution: Trust indexer (on-chain is authoritative)
Response:
{
  "id": 42,
  "title": "Raffle Title",
  "status": "open",  // Indexer authority
  "indexedAt": "2024-06-15T14:30:00Z",
  "sourceUpdatedAt": "2024-06-15T14:35:00Z",
  "conflict": {
    "field": "status",
    "metadataValue": "closed",
    "indexerValue": "open",
    "resolution": "indexer_authoritative"
  }
}
```

## Response Schema

### Freshness Fields (Added to All Raffle Responses)
```typescript
export interface RaffleFreshness {
  /** ISO timestamp when raffle was last indexed from blockchain */
  indexedAt: string | null;
  
  /** ISO timestamp when data source was last updated */
  sourceUpdatedAt: string;
  
  /** Ledger height at which raffle state was confirmed */
  ledger?: number;
  
  /** If metadata is newer than indexed state, flag for client */
  staleness?: {
    metadataNewer: boolean;
    minutesOld: number;
  };
  
  /** Conflict resolution log (only if conflicts detected) */
  conflict?: {
    field: string;
    metadataValue: any;
    indexerValue: any;
    resolution: 'indexer_authoritative' | 'metadata_authoritative' | 'merged';
  };
  
  /** Warning message for clients */
  warning?: string;
}

export interface RaffleResponse {
  id: number;
  title: string;
  description: string;
  status: string;
  ticketPrice: string;
  ticketsSold: number;
  maxTickets: number;
  createdAt: string;
  endTime: string;
  winner: string | null;
  prizeAmount: string | null;
  
  // Freshness context
  freshness: RaffleFreshness;
}
```

## Implementation in indexer.service.ts

### 1. Handle Missing Indexer Rows
```typescript
async getRaffle(id: number) {
  const [metadata, indexerData] = await Promise.all([
    this.supabaseClient
      .from('raffle_metadata')
      .select('*')
      .eq('raffle_id', id)
      .single()
      .catch(() => null),
    this.fetchIndexerRaffle(id),
  ]);

  if (!indexerData && !metadata) {
    throw new NotFoundException('Raffle not found');
  }

  return this.mergeRaffleData(metadata, indexerData);
}

private mergeRaffleData(metadata, indexerData) {
  if (!indexerData) {
    // Metadata-only case
    return {
      title: metadata.title,
      status: 'pending_indexing',
      indexedAt: null,
      sourceUpdatedAt: metadata.created_at,
      warning: 'Raffle pending blockchain indexing',
    };
  }

  if (!metadata) {
    // Indexer-only case
    return {
      title: 'Untitled Raffle',
      status: indexerData.status,
      indexedAt: indexerData.indexed_at,
      sourceUpdatedAt: indexerData.ledger_close_time,
      warning: 'Metadata not available',
    };
  }

  // Both exist: apply precedence rules
  const conflict = this.detectConflicts(metadata, indexerData);
  return {
    ...metadata,
    ...this.applyIndexerAuthority(indexerData),
    freshness: {
      indexedAt: indexerData.indexed_at,
      sourceUpdatedAt: metadata.updated_at,
      staleness: this.calculateStaleness(metadata, indexerData),
      conflict: conflict || undefined,
    },
  };
}
```

### 2. Expose Freshness in Controller Responses
```typescript
@Get(':id')
async getRaffle(@Param('id') id: number) {
  const raffle = await this.indexerService.getRaffle(id);
  return {
    data: raffle,
    freshness: {
      indexedAt: raffle.indexedAt,
      ledger: raffle.ledger,
      sourceUpdatedAt: raffle.sourceUpdatedAt,
    },
  };
}
```

### 3. Tests for All Conflict Scenarios
See `indexer.service.spec.ts` for comprehensive coverage:
- ✅ Metadata-only, indexer-only
- ✅ Stale indexer (metadata newer)
- ✅ Conflicting status data
- ✅ Missing rows without crashing
- ✅ Freshness field population

## Client Usage

### Recommended Client-Side Handling
```typescript
// In client/src/services/raffleService.ts
export function handleRaffleFreshness(response: RaffleResponse) {
  if (response.freshness.warning) {
    console.warn(response.freshness.warning);
  }

  if (response.freshness.staleness?.metadataNewer) {
    // Suggest refresh for fresh metadata
    return { ...response, shouldRefresh: true };
  }

  if (response.freshness.conflict) {
    // Log conflict for debugging
    analyticsService.log('raffle_conflict', response.freshness.conflict);
  }

  return response;
}
```

## Maintenance

### When Indexer Lags Behind
Monitor the difference between `sourceUpdatedAt` (metadata) and `indexedAt` (indexer):
- < 30 seconds: Normal (expected network latency)
- 30 seconds - 5 minutes: Acceptable (temporary indexer lag)
- > 5 minutes: Investigate indexer health

### When Conflicts Are Detected
Log all conflicts to Sentry with the full conflict record for audit. Example:
```
captureException(
  new ConflictDetected(conflict),
  { tags: { raffleId: raffle.id, field: conflict.field } }
);
```

## References
- Stellar Ledger Docs: https://developers.stellar.org/learn/concepts/ledger
- Indexer Architecture: See ARCHITECTURE.md §3
