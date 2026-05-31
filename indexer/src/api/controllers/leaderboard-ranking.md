# Leaderboard Ranking

`GET /leaderboard` accepts `by=wins`, `by=volume`, or `by=tickets`.

All modes use deterministic tie-breakers so repeated requests and paginated
requests return stable ordering:

1. Mode primary metric descending.
2. `totalPrizeXlm` as a numeric value descending.
3. `totalTicketsBought` descending.
4. `totalRafflesWon` descending.
5. `firstSeenLedger` ascending.
6. `address` ascending.

The response includes `rank`, `limit`, `offset`, and the ordered ranking
semantics used for the request.
