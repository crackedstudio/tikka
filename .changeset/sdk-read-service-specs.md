---
'@tikka/sdk': patch
---

Test the read-only SDK surface and fix the anonymous-account fallback.

`ReadOnlyRaffleService`, `ReadOnlyUserService` and `HorizonService` had no
specs, so the code path most consumers hit first — and the one the `./read`
entry point is built around — was unverified. The new specs cover the found
entity, the not-found result, a malformed contract response and an RPC failure,
and assert the `ContractRaffleData` decode field by field against real XDR
encoded with `nativeToScVal`.

Two small production fixes fall out of that coverage:

- the anonymous-account fallback in both read services now builds a real
  `Account` instead of a duck-typed object, so `TransactionBuilder` can bump
  the sequence number instead of throwing a raw `TypeError` whenever the
  unfunded key cannot be loaded from the network;
- `mapContractStatus` moves from `RaffleService` into `contract/bindings` so
  the read path maps the contract's numeric `u32` status with exactly the same
  code as the write path.
