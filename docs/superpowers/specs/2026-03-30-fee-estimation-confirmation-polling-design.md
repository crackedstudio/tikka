# Fee Estimation & Confirmation Polling — Design Spec
**Issue:** #58
**Branch:** `fee_estimation`
**Date:** 2026-03-30

---

## Context

The SDK already has two well-implemented pieces on this branch:

- `FeeEstimatorService.estimateFee()` — runs `simulateTransaction`, parses `minResourceFee` and resource metrics, returns `{ xlm, stroops, resources }`. Fully tested and exported.
- `TransactionLifecycle.poll()` — exponential-backoff polling loop intended to own all `getTransaction` retry logic. Fully tested.

However, there is a **design bug** that makes `lifecycle.poll()`'s backoff dead code at runtime: `RpcService.getTransaction()` has its own internal `while` loop that polls until a non-`NOT_FOUND` status — so `lifecycle.poll()` never sees a `NOT_FOUND` response and its outer retry loop never runs more than once. The unit tests already mock `rpc.getTransaction()` as single-shot (returning `NOT_FOUND` directly), which reveals the intended design was always for `rpc.getTransaction()` to be single-shot.

Additionally:
- `lifecycle.poll()` default timeout is **30 s**; issue asks for **60 s**.
- `ContractService.invoke()` and `submitSigned()` call `this.rpc.getTransaction(hash)` directly, with no outer polling loop. Once `rpc.getTransaction()` becomes single-shot, these paths break.

---

## Goals

1. Make `rpc.getTransaction()` single-shot so `lifecycle.poll()`'s backoff actually works.
2. Raise `lifecycle.poll()` default timeout to 60 s.
3. Fix `ContractService` — route its write paths through `TransactionLifecycle` phases.
4. Document polling config and fee estimation in `ARCHITECTURE.md`.

---

## Out of Scope

- Changes to `FeeEstimatorService` (already complete).
- Changes to module services (`TicketService`, `RaffleService`, etc.) — `ContractService`'s public interface is preserved.
- Adding polling to `simulateReadOnly` (it has no submission step).

---

## Design

### 1. `RpcService.getTransaction()` — Remove Internal Polling Loop

**File:** `sdk/src/network/rpc.service.ts`

Remove the `while` loop. The method makes one JSON-RPC `getTransaction` call and returns whatever the node responds — including `NOT_FOUND`. Transient network errors (429, 500–504) are already handled by `executeRequest()`'s retry logic and are unaffected.

```ts
// Before (loops internally — backoff in lifecycle.poll() is dead code)
async getTransaction(hash, timeoutMs = 30_000, intervalMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const resp = await this.request('getTransaction', [hash]);
    if (resp.status !== NOT_FOUND) return resp;
    await sleep(intervalMs);
  }
  throw new TikkaSdkError(Timeout, ...);
}

// After (single-shot — caller owns the retry loop)
async getTransaction(hash: string): Promise<rpc.Api.GetTransactionResponse> {
  return this.request('getTransaction', [hash]);
}
```

**Impact on existing tests:** `rpc.service.spec.ts` — any tests for the polling loop must be removed or rewritten; single-request behaviour is trivially tested. `lifecycle.spec.ts` — no changes needed; mocks already reflect single-shot semantics.

---

### 2. `TransactionLifecycle.poll()` — Default Timeout 60 s

**File:** `sdk/src/contract/lifecycle.ts`

Change the `timeoutMs` default from `30_000` to `60_000` in `PollConfig` and the `poll()` implementation. Remove the `timeoutMs` and `intervalMs` arguments passed to `rpc.getTransaction()` (now single-shot, takes no args).

```ts
// Before
const timeoutMs = config.timeoutMs ?? 30_000;
...
const resp = await this.rpc.getTransaction(txHash, timeoutMs, currentInterval);

// After
const timeoutMs = config.timeoutMs ?? 60_000;
...
const resp = await this.rpc.getTransaction(txHash);
```

`PollConfig.timeoutMs` JSDoc comment updated to reflect 60 s default.

---

### 3. `ContractService` — Route Write Paths Through `TransactionLifecycle`

**File:** `sdk/src/contract/contract.service.ts`

`ContractService` is a NestJS `@Injectable()` that receives dependencies via DI. `TransactionLifecycle` is a plain class. `ContractService` creates a `TransactionLifecycle` instance in its constructor and delegates write operations to it.

#### 3a. Constructor

```ts
constructor(...) {
  this.contractId = getRaffleContractId(networkConfig.network);
  this.lifecycle = new TransactionLifecycle(rpc, horizon, networkConfig, wallet, this.contractId);
}
```

`setWallet()` and `setContractId()` must propagate to `this.lifecycle`. Add `setWallet(adapter)` and `setContractId(id)` setters to `TransactionLifecycle` so `ContractService` can delegate these mutations rather than re-instantiating.

#### 3b. `invoke()` — Use Lifecycle Phases Directly

`ContractService.invoke()` has two features `TransactionLifecycle.invoke()` doesn't have:
- `memo` — attached to the transaction envelope
- `simulateOnly` — returns simulated result without signing/submitting

**Strategy:** Call the lifecycle phases individually, injecting memo before simulation and short-circuiting for `simulateOnly`.

```
simulate()          ← lifecycle.simulate() with sourcePublicKey + fee options
  ↓ [simulateOnly?] → return { result: returnValue, txHash: '', ledger: 0 }
  ↓
[apply memo to XDR] ← if options.memo: parse assembledXdr, add memo, re-serialise
  ↓
sign(assembledXdr)  ← lifecycle.sign()
  ↓
submit(signedXdr)   ← lifecycle.submit()
  ↓
poll(txHash)        ← lifecycle.poll() with options.poll config
  ↓
return InvokeResult
```

Memo injection detail: after `lifecycle.simulate()` returns `assembledXdr`, parse it with `TransactionBuilder.fromXDR()`, add the memo via `Memo.*`, re-serialise to XDR, then pass to `lifecycle.sign()`. The assembled fee/auth data is in the envelope and survives re-serialisation.

#### 3c. `buildUnsigned()` — Use `lifecycle.simulate()`

`lifecycle.simulate()` already assembles the full fee-bumped, auth-populated XDR (`assembledXdr`) and returns `minResourceFee`. Map its output to `UnsignedTxResult`:

```ts
const sim = await this.lifecycle.simulate(method, params, { sourcePublicKey, fee });
return {
  unsignedXdr:      sim.assembledXdr,
  simulatedResult:  sim.returnValue,
  fee:              sim.minResourceFee,
  networkPassphrase: sim.networkPassphrase,
};
```

#### 3d. `submitSigned()` — Use `lifecycle.submit()` + `lifecycle.poll()`

```ts
const txHash = await this.lifecycle.submit(signedXdr);
const polled = await this.lifecycle.poll(txHash);
return { result: polled.returnValue, txHash: polled.txHash, ledger: polled.ledger };
```

#### 3e. `simulateReadOnly()` — Unchanged

No submission step; no polling needed.

---

### 4. `ARCHITECTURE.md` — Document Polling & Fee Estimation

Add to the SDK section, after the "Transaction Lifecycle" line:

```markdown
### Fee Estimation

Call `FeeEstimatorService.estimateFee({ method, params })` before asking the user to sign.
Returns `{ xlm, stroops, resources }` — no wallet needed (falls back to an anonymous source key).
Re-call whenever inputs change; each call runs a fresh `simulateTransaction`.

### Confirmation Polling

After submit, `lifecycle.poll()` polls `getTransaction` with exponential backoff until the
transaction reaches `SUCCESS` or `FAILED`:

| Parameter     | Default | Configurable via       |
|---------------|---------|------------------------|
| Timeout       | 60 s    | `PollConfig.timeoutMs` |
| Initial interval | 2 s  | `PollConfig.intervalMs` |
| Backoff factor | 1.5×   | `PollConfig.backoffFactor` |
| Max interval  | 10 s    | `PollConfig.maxIntervalMs` |

Pass `poll` inside `InvokeLifecycleOptions` to override per-call.
RPC-level transient errors (429, 500–504) are retried separately by `RpcService` and do not
consume the poll timeout.
```

---

## File Change Summary

| File | Change |
|------|--------|
| `sdk/src/network/rpc.service.ts` | Remove `while` loop from `getTransaction()`; drop `timeoutMs`/`intervalMs` params |
| `sdk/src/network/rpc.service.spec.ts` | Remove/rewrite polling loop tests; add single-request test |
| `sdk/src/contract/lifecycle.ts` | Default `timeoutMs` 30 s → 60 s; remove args from `rpc.getTransaction()` call; add `setWallet()`/`setContractId()` setters |
| `sdk/src/contract/contract.service.ts` | Add `lifecycle` field; delegate `invoke`, `buildUnsigned`, `submitSigned` to phases; propagate `setWallet`/`setContractId` to lifecycle |
| `sdk/src/contract/contract.service.spec.ts` | Update mocks to reflect lifecycle delegation |
| `docs/ARCHITECTURE.md` | Add fee estimation + polling config sections |

---

## Testing Notes

- All existing `lifecycle.spec.ts` tests pass unchanged — they already mock `rpc.getTransaction()` as single-shot.
- All existing `fee-estimator.service.spec.ts` tests pass unchanged.
- `contract.service.spec.ts` will need mocks updated to reflect that `invoke/buildUnsigned/submitSigned` now delegate to lifecycle phases.
- `rpc.service.spec.ts` polling tests replaced with single-request assertion.
- No changes to `TicketService`, `RaffleService`, `AdminService`, or `UserService`.
