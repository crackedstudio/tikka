# Leaderboard Ranking

`GET /leaderboard` accepts `by=wins`, `by=volume`, or `by=tickets`.

All modes use deterministic tie-breakers so repeated requests and paginated
requests return stable ordering:

1. Mode primary metric descending.
2. `totalPrizeXlm` as a numeric value descending.
3. `totalTicketsBought` descending.
4. `totalRafflesWon` descending.
5. `firstSeenLedger` ascending (earlier participants rank higher).
6. `address` ascending (lexicographic final tie-breaker).

## Stability guarantee

Users with identical metrics on the primary sort column will always appear in
the same relative order. This ordering is stable across:

- Repeated requests for the same page.
- Cursor-based pagination: the cursor encodes all tie-breaker values, so the
  next page begins exactly where the previous page ended with no duplicates or
  gaps.
- Offset-based pagination: `ORDER BY` is deterministic so `OFFSET N` always
  skips the same rows.

The backend (`backend/src/api/rest/leaderboard`) proxies responses from the
indexer and preserves this ordering as-is; it does not re-sort entries.

## Cursor encoding

The cursor is a base64-encoded JSON object containing:

- `v` — array of stringified sort values in tie-breaker order.
- `a` — the `address` of the last entry on the current page.

The cursor `WHERE` clause skips past all rows that sort equal-to-or-before the
cursor by comparing each tie-breaker column with `OR` conditions.

## Response fields

The response includes `rank`, `limit`, `offset`, and the ordered ranking
semantics used for the request.

- Cursor-paginated responses return `rank: null` (rank depends on prior pages).
- Offset-paginated responses return `rank: offset + index + 1`.
