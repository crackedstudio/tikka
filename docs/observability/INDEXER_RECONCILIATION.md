# Indexer Mainnet Reconciliation

The scheduled GitHub Actions workflow `.github/workflows/indexer-reconciliation.yml`
runs daily at 05:17 UTC. It samples raffle IDs from the mainnet contract, compares
those states with the indexer's `raffles` table, and recomputes daily rollups from
retained `raffle_events` to compare them with `platform_stats`.

The command is read-only. It never modifies indexed rows. A mismatch is emitted
as JSON and as the Prometheus gauge
`tikka_indexer_reconciliation_discrepancies{kind="raffle|aggregate"}`. The
workflow fails on any mismatch, so GitHub Actions reports the failed scheduled
run; the details are in the workflow run summary. Prometheus deployments can
alert on the same gauge with `IndexerReconciliationDiscrepancies`.

## Configuration

The workflow requires these repository Actions secrets:

- `INDEXER_DATABASE_URL`: read-access connection string for the production
  indexer database.
- `TIKKA_CONTRACT_MAINNET`: deployed mainnet raffle contract address.

The public Soroban endpoint defaults to `https://soroban.stellar.org`. For local
runs, provide `DATABASE_URL`, `SOROBAN_RPC_URL`, and either
`TIKKA_CONTRACT_ID` or `TIKKA_CONTRACT_MAINNET`. Set
`RECONCILIATION_SAMPLE_SIZE` to control the number of on-chain raffle IDs
sampled (default 25).

Run with `pnpm --filter @tikka/sdk build` followed by
`pnpm --filter tikka-indexer reconcile` from the repository root.

## Interpretation

- `raffle` discrepancies name a sampled raffle and mismatched field; state is
  compared after normalizing contract status codes and timestamp units.
- `aggregate` discrepancies name the UTC event day and differing
  `platform_stats` field. Rollups are reconstructed from `RaffleCreated`,
  `TicketPurchased`, and `RaffleFinalized` payloads.
- Raffle events may be archived by the separate retention job. Aggregate checks
  cover dates represented in the retained event table; they do not infer values
  for event days with no retained events.
- An RPC/database/configuration failure fails the job too; do not treat an
  incomplete reconciliation as a clean result.

Investigate and correct the underlying decoder, processor, or data issue, then
use the normal replay/recovery procedure. Do not patch the database based only
on this report.
