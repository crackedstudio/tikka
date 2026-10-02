---
'@tikka/sdk': patch
---

Make the contract response parser total and fuzz-test it.

`TransactionHistoryParser` no longer emits partially populated events: a
`topics[0]` that does not decode to a non-empty string, or a `topics[1]` that
does not decode to a non-negative integer, now drops the event instead of
producing a non-string `type` or `raffleId: NaN`.

Adds `normalizeContractResponse()` so the legacy `success` and `status`
response conventions normalise into one fully populated `ContractResponse`,
rejecting unexpected shapes with the typed `InvalidResponseError`.

Adds `fast-check` property specs for both surfaces, mirroring the indexer's
`event-parser.service.pbt.spec.ts`.
