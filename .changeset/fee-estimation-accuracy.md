---
'@tikka/sdk': minor
---

Measure fee estimates against the fees the network actually charges.

Adds an opt-in testnet suite (`sdk/src/test/integration/fee-estimate-accuracy.spec.ts`)
that quotes a fee with `FeeEstimatorService`, submits that same call with the
quoted fee, reads the fee charged back out of the confirmed transaction, and
fails when the two drift outside a tolerance band. Run it with:

```
pnpm run test:fee-accuracy
```

The comparison is shared with the oracle cost estimator through the new
`@tikka/fee-accuracy` workspace package, so the SDK and the oracle are held to
the same tolerance, the same surge classification and the same report format:

- normal tolerance ±15% (min 2,000 stroops), surge tolerance ±100% (min 10,000)
- a run counts as surged when the ledger's typical Soroban inclusion fee
  reaches the threshold (default 1,000 stroops)
- a missing or zero charge is reported as `invalid`, never as a pass
- JSON and Markdown reports, gated in CI by `@tikka/fee-accuracy gate`

Also adds `sdk/src/fee-estimator/fee-accuracy.spec.ts`, which pins the
estimator's behaviour under calm and surged network conditions — including
that the static fallback estimate is flagged as under-quoting once fees surge.
