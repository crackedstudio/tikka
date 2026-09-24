---
'@tikka/sdk': minor
---

Make retry and backoff a first-class `RpcService` option.

Adds a `RetryConfig` to `sdk/src/network/network.config.ts` (max attempts, base
delay, max delay, jitter strategy, and a `classifyError` predicate) with sane
defaults, and has both the full (`network`) and light `RpcService` consume it
via `buildRetryConfig` so they behave identically.

`classifySorobanRpcError` classifies failures as:
- `TRY_AGAIN_LATER` and 5xx → retryable
- `TX_BAD_SEQ` → retryable, requiring an account-sequence refresh
- malformed XDR / contract failures / other 4xx → fatal (not retried)

`withRetry` now attaches the `RetryDecision` to the final thrown error
(via `getRetryDecision`) so callers can refresh the sequence number on
`TX_BAD_SEQ`. Closes the loop with the open issue about `RpcService` retry
logic (#1325).
