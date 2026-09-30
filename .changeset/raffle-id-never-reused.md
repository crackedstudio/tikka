---
'@tikka/sdk': minor
---

Document and assert that raffle IDs are never reused after termination.

The ABI reference (`docs/contracts/INTEGRATION_BOUNDARY.md` → "Raffle ID
Allocation") now states the contract's ID allocation guarantees explicitly:
`create_raffle` draws from a single monotonic `u32` counter
(`storage::next_raffle_id`), and a terminal transition (`FINALIZED` /
`CANCELLED`) _retires_ an ID rather than releasing it. The counter is advanced
only by allocation, so no lifecycle path can hand the same ID to a second
raffle. Integrators may therefore cache against a `raffle_id` — including
cached terminal-state facts — without the entry ever going stale against an
unrelated raffle. The guarantee also holds across contract upgrades, since the
counter lives in persistent instance storage; the upgrade checklist gains a
verification step for it.

Exhaustion of the `u32` ID space (`1 .. u32::MAX`) now has a named error:
`RaffleIdExhausted` (Soroban panic code `6`), surfaced in the SDK as
`RaffleIdExhaustedError` / `TikkaSdkErrorCode.RaffleIdExhausted`
(`RAFFLE_ID_EXHAUSTED`) and `ContractErrorType.RAFFLE_ID_EXHAUSTED`. Allocation
errors rather than wrapping, so the counter never restarts at `1`. Callers can
branch on the error type instead of parsing messages.

Adds an executable model of the allocation rules
(`sdk/src/contract/raffle-id-allocation.ts`) so the documented behaviour can be
asserted without a chain, together with a spec that terminates raffles in both
terminal states and asserts the subsequent allocations follow the documented
rule, that exhaustion raises the named error without wrapping, and that no ID is
reissued across a chain of upgrades. Closes #1700.
