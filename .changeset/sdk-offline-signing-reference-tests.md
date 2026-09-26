---
'@tikka/sdk': patch
---

Verify offline signing against the reference implementation.

`verifyOfflineSignature` now returns `false` instead of throwing for malformed
input, rejects transactions whose time bound has expired, and checks every
signature on the envelope rather than only the first. A new module-level
`inspectOfflineSignature` reports a typed reason (`malformed-xdr`,
`invalid-public-key`, `expired`, `no-signature`, `signature-mismatch`).

Adds deterministic known-good signed-XDR fixtures with expected envelope hashes
and cross-checks both directions against `@stellar/stellar-sdk`, including
cross-network replay rejection. The public API surface is unchanged.
