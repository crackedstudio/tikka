# Fee Estimation & Confirmation Polling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the double-polling design bug so `lifecycle.poll()`'s exponential backoff actually executes at runtime, and migrate `ContractService` write paths to use `TransactionLifecycle` phases so polling behaviour is consistent everywhere.

**Architecture:** `RpcService.getTransaction()` becomes single-shot (one request, returns any status including `NOT_FOUND`). `TransactionLifecycle.poll()` owns the outer retry-with-backoff loop. `ContractService` creates a `TransactionLifecycle` in its constructor and delegates `invoke`, `buildUnsigned`, and `submitSigned` to lifecycle phases. `FeeEstimatorService` is already complete and is not touched.

**Tech Stack:** TypeScript · NestJS · `@stellar/stellar-sdk` ^14.5.0 · Jest

---

## File Map

| File | What changes |
|---|---|
| `sdk/src/network/rpc.service.ts` | `getTransaction()` becomes single-shot; remove `timeoutMs`/`intervalMs` params |
| `sdk/src/network/rpc.service.spec.ts` | Add `getTransaction` single-shot test |
| `sdk/src/contract/lifecycle.ts` | 60 s default timeout; remove args from `rpc.getTransaction()` call; add `TxMemo` type; add `memo` to `InvokeLifecycleOptions` + `buildTx()`; add `setWallet()`/`setContractId()` setters; remove `readonly` from `wallet`/`contractId` fields |
| `sdk/src/contract/lifecycle.spec.ts` | Update backoff tests to spy on `sleep()`; update "passes poll config" assertion |
| `sdk/src/contract/contract.service.ts` | Add `lifecycle` field; rewrite `invoke`, `buildUnsigned`, `submitSigned` to delegate; import `TxMemo` from `lifecycle` |
| `sdk/src/contract/contract.service.spec.ts` | Add tests for `invoke`, `buildUnsigned`, `submitSigned`, `setWallet`, `setContractId` |
| `docs/ARCHITECTURE.md` | Add Fee Estimation and Confirmation Polling sub-sections |

---

## Task 1 — Fix `RpcService.getTransaction()` to Single-Shot

**Files:**
- Modify: `sdk/src/network/rpc.service.ts`
- Modify: `sdk/src/network/rpc.service.spec.ts`

- [ ] **Step 1.1: Add a `getTransaction` test that verifies single-shot behaviour**

Open `sdk/src/network/rpc.service.spec.ts`. Add after the `getLedger` test (after line 153, before the final closing `}`):

```ts
it('getTransaction makes a single request and returns the raw response', async () => {
  const mockResp = { status: 'NOT_FOUND' };
  const mockFetch = jest.fn().mockResolvedValue({
    ok: true,
    json: jest.fn().mockResolvedValue({ result: mockResp }),
  });

  service.configure({ fetchClient: mockFetch as any });
  const result = await service.getTransaction('abc123');

  expect(result).toEqual(mockResp);
  expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(mockFetch).toHaveBeenCalledWith(
    mockNetwork.rpcUrl,
    expect.objectContaining({
      body: expect.stringContaining('"method":"getTransaction"'),
    }),
  );
});
```

- [ ] **Step 1.2: Run the new test — it should PASS (existing implementation already satisfies it once we count calls)**

```bash
cd sdk && npx jest --testPathPattern=rpc.service.spec --no-coverage 2>&1 | tail -20
```

Expected: the new test PASSES (current implementation makes one request per loop iteration, but since the mock returns `NOT_FOUND` the loop continues — actually wait, `mockResp` has `status: 'NOT_FOUND'` so the current while loop will spin. The test will FAIL because `mockFetch` will be called more than once before timeout. Good — this confirms the test is meaningful.)

Expected output contains: `● getTransaction makes a single request` with a failure about `mockFetch` being called more than once.

- [ ] **Step 1.3: Replace `getTransaction()` implementation**

In `sdk/src/network/rpc.service.ts`, replace the entire `getTransaction` method (lines 94–119):

```ts
/** Get a single transaction status from the RPC node. Returns NOT_FOUND if the tx is not yet indexed. */
async getTransaction(
  hash: string,
): Promise<rpc.Api.GetTransactionResponse> {
  return this.request('getTransaction', [hash]);
}
```

- [ ] **Step 1.4: Run all RPC tests — all should pass**

```bash
cd sdk && npx jest --testPathPattern=rpc.service.spec --no-coverage 2>&1 | tail -20
```

Expected: `Tests: X passed` with no failures.

- [ ] **Step 1.5: Commit**

```bash
git add sdk/src/network/rpc.service.ts sdk/src/network/rpc.service.spec.ts
git commit -m "fix(sdk): make RpcService.getTransaction single-shot"
```

---

## Task 2 — Fix `lifecycle.poll()` Default Timeout + Remove Stale Args

**Files:**
- Modify: `sdk/src/contract/lifecycle.ts`
- Modify: `sdk/src/contract/lifecycle.spec.ts`

- [ ] **Step 2.1: Update the "passes poll config" test in `lifecycle.spec.ts`**

In `sdk/src/contract/lifecycle.spec.ts`, find and replace the test at ~line 583 (inside `describe('invoke()')`):

Find:
```ts
it('passes poll config through to poll()', async () => {
  setupHappyPath();

  const lc = buildLifecycle();
  await lc.invoke(ContractFn.BUY_TICKET, [1], {
    sourcePublicKey: SOURCE_KEY,
    poll: { timeoutMs: 45_000, intervalMs: 3_000, backoffFactor: 2.0 },
  });

  // getTransaction is called with the custom timeoutMs and intervalMs
  expect(rpcService.getTransaction).toHaveBeenCalledWith(
    TX_HASH,
    45_000,
    3_000,
  );
});
```

Replace with:
```ts
it('passes poll config through to poll()', async () => {
  setupHappyPath();

  const lc = buildLifecycle();
  await lc.invoke(ContractFn.BUY_TICKET, [1], {
    sourcePublicKey: SOURCE_KEY,
    poll: { timeoutMs: 45_000, intervalMs: 3_000, backoffFactor: 2.0 },
  });

  // getTransaction is single-shot — called with hash only
  expect(rpcService.getTransaction).toHaveBeenCalledWith(TX_HASH);
});
```

- [ ] **Step 2.2: Rewrite the exponential backoff tests to spy on `sleep()`**

In `sdk/src/contract/lifecycle.spec.ts`, find and replace the two backoff tests inside `describe('poll()')` (lines ~432–481):

Find:
```ts
it('applies exponential backoff — interval grows with backoffFactor', async () => {
  const intervals: number[] = [];
  let callIndex = 0;

  rpcService.getTransaction.mockImplementation(async (_hash, _timeout, interval) => {
    callIndex++;
    intervals.push(interval as number);
    if (callIndex >= 4) return makeGetSuccess(200) as any;
    return makeGetNotFound() as any;
  });

  const lc = buildLifecycle();
  await lc.poll(TX_HASH, {
    timeoutMs: 60_000,
    intervalMs: 10,       // small to avoid real-timer delays
    backoffFactor: 2.0,
    maxIntervalMs: 10_000,
  });

  // Intervals passed to getTransaction should grow: 10, 20, 40
  expect(intervals[0]).toBe(10);
  expect(intervals[1]).toBe(20);
  expect(intervals[2]).toBe(40);
});

it('caps the backoff interval at maxIntervalMs', async () => {
  const intervals: number[] = [];
  let callIndex = 0;

  rpcService.getTransaction.mockImplementation(async (_hash, _timeout, interval) => {
    callIndex++;
    intervals.push(interval as number);
    if (callIndex >= 5) return makeGetSuccess(200) as any;
    return makeGetNotFound() as any;
  });

  const lc = buildLifecycle();
  await lc.poll(TX_HASH, {
    timeoutMs: 60_000,
    intervalMs: 20,   // small real intervals
    backoffFactor: 3.0,
    maxIntervalMs: 50, // cap
  });

  // 20 → 50 (capped) → 50 (capped) → 50 (capped)
  expect(intervals[0]).toBe(20);
  for (let i = 1; i < intervals.length; i++) {
    expect(intervals[i]).toBeLessThanOrEqual(50);
  }
});
```

Replace with:
```ts
it('applies exponential backoff — sleep interval grows with backoffFactor', async () => {
  let callIndex = 0;
  rpcService.getTransaction.mockImplementation(async () => {
    callIndex++;
    if (callIndex >= 4) return makeGetSuccess(200) as any;
    return makeGetNotFound() as any;
  });

  const lc = buildLifecycle();
  const sleepSpy = jest.spyOn(lc as any, 'sleep').mockResolvedValue(undefined);

  await lc.poll(TX_HASH, {
    timeoutMs: 60_000,
    intervalMs: 10,
    backoffFactor: 2.0,
    maxIntervalMs: 10_000,
  });

  // sleep is called between NOT_FOUND retries; intervals should grow: 10, 20, 40
  expect(sleepSpy).toHaveBeenNthCalledWith(1, 10);
  expect(sleepSpy).toHaveBeenNthCalledWith(2, 20);
  expect(sleepSpy).toHaveBeenNthCalledWith(3, 40);
});

it('caps the backoff interval at maxIntervalMs', async () => {
  let callIndex = 0;
  rpcService.getTransaction.mockImplementation(async () => {
    callIndex++;
    if (callIndex >= 5) return makeGetSuccess(200) as any;
    return makeGetNotFound() as any;
  });

  const lc = buildLifecycle();
  const sleepSpy = jest.spyOn(lc as any, 'sleep').mockResolvedValue(undefined);

  await lc.poll(TX_HASH, {
    timeoutMs: 60_000,
    intervalMs: 20,
    backoffFactor: 3.0,
    maxIntervalMs: 50,
  });

  // 20 → capped at 50 for all subsequent
  expect(sleepSpy).toHaveBeenNthCalledWith(1, 20);
  for (let i = 2; i <= sleepSpy.mock.calls.length; i++) {
    expect(sleepSpy).toHaveBeenNthCalledWith(i, 50);
  }
});
```

- [ ] **Step 2.3: Run the lifecycle tests — expect failures on the modified tests**

```bash
cd sdk && npx jest --testPathPattern=lifecycle.spec --no-coverage 2>&1 | tail -30
```

Expected: failures in the backoff tests and "passes poll config" test — the implementation still passes old args to `rpc.getTransaction()`.

- [ ] **Step 2.4: Update `lifecycle.poll()` in `lifecycle.ts`**

In `sdk/src/contract/lifecycle.ts`, inside `poll()`, make two changes:

Change the default timeout (around line 259):
```ts
// Before
const timeoutMs   = config.timeoutMs   ?? 30_000;

// After
const timeoutMs   = config.timeoutMs   ?? 60_000;
```

Change the `rpc.getTransaction()` call (around line 270):
```ts
// Before
const resp = await this.rpc.getTransaction(txHash, timeoutMs, currentInterval);

// After
const resp = await this.rpc.getTransaction(txHash);
```

Also update the JSDoc on `PollConfig.timeoutMs` (around line 64):
```ts
// Before
/**
 * Maximum time (ms) to wait for the transaction to leave NOT_FOUND status.
 * @default 30_000
 */

// After
/**
 * Maximum time (ms) to wait for the transaction to leave NOT_FOUND status.
 * @default 60_000
 */
```

- [ ] **Step 2.5: Run lifecycle tests — all should pass**

```bash
cd sdk && npx jest --testPathPattern=lifecycle.spec --no-coverage 2>&1 | tail -20
```

Expected: `Tests: X passed` with no failures.

- [ ] **Step 2.6: Commit**

```bash
git add sdk/src/contract/lifecycle.ts sdk/src/contract/lifecycle.spec.ts
git commit -m "fix(sdk): poll default timeout 60s, getTransaction single-shot in lifecycle"
```

---

## Task 3 — Add Memo Support and Mutation Setters to `TransactionLifecycle`

**Files:**
- Modify: `sdk/src/contract/lifecycle.ts`
- Modify: `sdk/src/contract/lifecycle.spec.ts`

- [ ] **Step 3.1: Write failing tests for `setWallet`, `setContractId`, and memo**

In `sdk/src/contract/lifecycle.spec.ts`, add a new top-level `describe` block at the bottom of the file (after the `invoke()` describe block):

```ts
// ─────────────────────────────────────────────────────────────────────────────
// setWallet() / setContractId()
// ─────────────────────────────────────────────────────────────────────────────

describe('setWallet() / setContractId()', () => {
  it('setWallet updates the wallet used for signing', async () => {
    rpcService.simulateTransaction.mockResolvedValue(makeSimSuccess() as any);

    const lc = buildLifecycle(false); // no wallet initially
    await expect(lc.sign('XDR==')).rejects.toMatchObject({
      code: TikkaSdkErrorCode.WalletNotInstalled,
    });

    lc.setWallet(wallet);
    wallet.signTransaction.mockResolvedValue({ signedXdr: 'SIGNED==' });
    const result = await lc.sign('XDR==');
    expect(result).toBe('SIGNED==');
  });

  it('setContractId changes the contract used in buildTx', () => {
    const lc = buildLifecycle();
    lc.setContractId('NEW_CONTRACT_ID');
    expect((lc as any).contractId).toBe('NEW_CONTRACT_ID');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// memo support in simulate()
// ─────────────────────────────────────────────────────────────────────────────

describe('simulate() with memo', () => {
  it('passes a text memo through buildTx without error', async () => {
    rpcService.simulateTransaction.mockResolvedValue(makeSimSuccess() as any);

    const lc = buildLifecycle();
    const result = await lc.simulate(
      ContractFn.BUY_TICKET,
      [1, SOURCE_KEY, 1],
      { sourcePublicKey: SOURCE_KEY, memo: { type: 'text', value: 'test-memo' } },
    );

    expect(rpcService.simulateTransaction).toHaveBeenCalledTimes(1);
    expect(result.assembledXdr).toBeTruthy();
  });

  it('passes an id memo through buildTx without error', async () => {
    rpcService.simulateTransaction.mockResolvedValue(makeSimSuccess() as any);

    const lc = buildLifecycle();
    const result = await lc.simulate(
      ContractFn.BUY_TICKET,
      [1, SOURCE_KEY, 1],
      { sourcePublicKey: SOURCE_KEY, memo: { type: 'id', value: '42' } },
    );

    expect(result.assembledXdr).toBeTruthy();
  });
});
```

- [ ] **Step 3.2: Run these tests — expect failures (methods/field don't exist yet)**

```bash
cd sdk && npx jest --testPathPattern=lifecycle.spec --no-coverage 2>&1 | tail -20
```

Expected: failures on `setWallet is not a function`, `setContractId is not a function`, and memo tests failing with type errors.

- [ ] **Step 3.3: Add `TxMemo` type, `Memo` import, memo to `buildTx`, and setters in `lifecycle.ts`**

**3.3a — Add `Memo` to the stellar-sdk import** at the top of `sdk/src/contract/lifecycle.ts`:

```ts
import {
  TransactionBuilder,
  Contract,
  Address,
  nativeToScVal,
  rpc,
  xdr,
  scValToNative,
  BASE_FEE,
  Memo,
} from '@stellar/stellar-sdk';
```

**3.3b — Add `TxMemo` type** after the imports, before the `// ─── Types ───` section comment:

```ts
/**
 * Transaction memo — attach tracking data or external references.
 * Mirrors the three Stellar memo types the protocol supports.
 */
export type TxMemo =
  | { type: 'text'; value: string }
  | { type: 'id'; value: string }
  | { type: 'hash'; value: Buffer };
```

**3.3c — Add `memo` to `InvokeLifecycleOptions`** (around line 85):

```ts
/** Combined options for a full invoke (simulate + sign + submit + poll). */
export interface InvokeLifecycleOptions {
  /** Override the source public key (defaults to wallet.getPublicKey()). */
  sourcePublicKey?: string;
  /** Override the transaction base fee (in stroops). Default: BASE_FEE. */
  fee?: string;
  /** Optional memo attached to the transaction envelope. */
  memo?: TxMemo;
  /** Polling configuration. */
  poll?: PollConfig;
}
```

**3.3d — Update `simulate()` signature** to include `memo` in the Pick (around line 140):

```ts
async simulate<T = unknown>(
  method: string,
  params: any[],
  options: Pick<InvokeLifecycleOptions, 'sourcePublicKey' | 'fee' | 'memo'> = {},
): Promise<SimulateResult<T>> {
  const sourceKey = options.sourcePublicKey ?? await this.resolveSourceKey();
  const tx = await this.buildTx(method, params, sourceKey, options.fee, options.memo);
  // ... rest of the method is unchanged
```

**3.3e — Change `wallet` and `contractId` constructor parameters from `readonly` to mutable** (around line 121):

```ts
constructor(
  private readonly rpc: RpcService,
  private readonly horizon: HorizonService,
  private readonly networkConfig: NetworkConfig,
  private wallet: WalletAdapter | undefined,
  private contractId: string,
) {}
```

**3.3f — Add `setWallet` and `setContractId` setters** after the constructor:

```ts
setWallet(adapter: WalletAdapter | undefined): void {
  this.wallet = adapter;
}

setContractId(id: string): void {
  this.contractId = id;
}
```

**3.3g — Update `buildTx()` signature and body** to accept and apply memo (around line 345):

```ts
private async buildTx(
  method: string,
  params: any[],
  sourceKey: string,
  fee?: string,
  memo?: TxMemo,
) {
  const account = await this.horizon.loadAccount(sourceKey).catch(() => ({
    accountId: () => sourceKey,
    sequenceNumber: () => '0',
    incrementSequenceNumber: () => {},
  } as any));

  const contract = new Contract(this.contractId);
  const builder = new TransactionBuilder(account, {
    fee: fee ?? BASE_FEE,
    networkPassphrase: this.networkConfig.networkPassphrase,
  }).addOperation(
    contract.call(method, ...params.map((p) => this.toScVal(p))),
  );

  if (memo) {
    builder.addMemo(this.buildMemo(memo));
  }

  return builder.setTimeout(30).build();
}

private buildMemo(memo: TxMemo): Memo {
  switch (memo.type) {
    case 'text': return Memo.text(memo.value);
    case 'id':   return Memo.id(memo.value);
    case 'hash': return Memo.hash(memo.value);
  }
}
```

- [ ] **Step 3.4: Run all lifecycle tests — all should pass**

```bash
cd sdk && npx jest --testPathPattern=lifecycle.spec --no-coverage 2>&1 | tail -20
```

Expected: `Tests: X passed` with no failures.

- [ ] **Step 3.5: Commit**

```bash
git add sdk/src/contract/lifecycle.ts sdk/src/contract/lifecycle.spec.ts
git commit -m "feat(sdk): add memo support and mutation setters to TransactionLifecycle"
```

---

## Task 4 — Migrate `ContractService` to Use `TransactionLifecycle` Phases

**Files:**
- Modify: `sdk/src/contract/contract.service.ts`
- Modify: `sdk/src/contract/contract.service.spec.ts`

- [ ] **Step 4.1: Write new `ContractService` tests**

Replace the entire content of `sdk/src/contract/contract.service.spec.ts` with:

```ts
jest.mock('@stellar/stellar-sdk', () => {
  const actual = jest.requireActual<typeof import('@stellar/stellar-sdk')>('@stellar/stellar-sdk');
  return {
    ...actual,
    rpc: {
      ...actual.rpc,
      assembleTransaction: jest.fn(),
    },
  };
});

import { Networks, rpc } from '@stellar/stellar-sdk';
import { ContractService } from './contract.service';
import { TransactionLifecycle } from './lifecycle';
import { RpcService } from '../network/rpc.service';
import { HorizonService } from '../network/horizon.service';
import { NetworkConfig, TikkaNetwork } from '../network/network.config';
import { TikkaSdkError, TikkaSdkErrorCode } from '../utils/errors';
import { WalletAdapter, WalletName } from '../wallet/wallet.interface';
import { ContractFn } from './bindings';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockConfig: NetworkConfig = {
  network: 'testnet' as TikkaNetwork,
  rpcUrl: 'https://rpc.com',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  networkPassphrase: Networks.TESTNET,
};

const SOURCE_KEY  = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const TX_HASH     = 'deadbeef'.repeat(8);
const SIGNED_XDR  = 'AAAAAA==';
const ASSEMBLED_XDR = 'BBBBBB==';

const mockSimulateResult = {
  returnValue: 42,
  minResourceFee: '5000',
  assembledXdr: ASSEMBLED_XDR,
  networkPassphrase: Networks.TESTNET,
};

const mockSubmitResult = {
  returnValue: 99,
  txHash: TX_HASH,
  ledger: 300,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildService(withWallet = false) {
  const rpcService  = new RpcService(mockConfig);
  const horizonService = new HorizonService(mockConfig);
  let wallet: jest.Mocked<WalletAdapter> | undefined;

  if (withWallet) {
    wallet = {
      name: WalletName.Mock,
      isAvailable: jest.fn().mockReturnValue(true),
      getPublicKey: jest.fn().mockResolvedValue(SOURCE_KEY),
      signTransaction: jest.fn().mockResolvedValue({ signedXdr: SIGNED_XDR }),
      signMessage: jest.fn(),
      getNetwork: jest.fn(),
    } as unknown as jest.Mocked<WalletAdapter>;
  }

  const service = new ContractService(rpcService, horizonService, mockConfig, wallet);
  const lifecycle = (service as any).lifecycle as TransactionLifecycle;

  return { service, lifecycle, wallet };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ContractService.simulateReadOnly()', () => {
  it('calls RpcService.simulateTransaction and decodes the return value', async () => {
    const { service, lifecycle } = buildService();
    const { nativeToScVal, scValToNative } = jest.requireActual('@stellar/stellar-sdk');

    const mockRetVal = 'mock-value';
    const simSpy = jest.spyOn(
      (service as any).rpc,
      'simulateTransaction',
    ).mockResolvedValue({
      minResourceFee: '0',
      result: { retval: nativeToScVal(mockRetVal) },
      transactionData: { build: () => ({ resources: () => ({ instructions: () => 0, diskReadBytes: () => 0, writeBytes: () => 0, footprint: () => ({ readOnly: () => [], readWrite: () => [] }) }) }) },
      stateChanges: [],
      latestLedger: 1,
      _parsed: true,
    } as any);

    jest.spyOn((service as any).horizon, 'loadAccount').mockResolvedValue({
      accountId: () => SOURCE_KEY,
      sequenceNumber: () => '0',
    } as any);

    (rpc.assembleTransaction as jest.Mock).mockReturnValue({
      build: () => ({ toXDR: () => ASSEMBLED_XDR }),
    });

    const result = await service.simulateReadOnly(ContractFn.IS_PAUSED, []);
    expect(simSpy).toHaveBeenCalledTimes(1);
    expect(result).toBe(mockRetVal);
  });
});

describe('ContractService.invoke()', () => {
  it('throws WalletNotInstalled immediately when no wallet and simulateOnly is false', async () => {
    const { service } = buildService(false);
    await expect(
      service.invoke(ContractFn.BUY_TICKET, [1, SOURCE_KEY, 1]),
    ).rejects.toMatchObject({ code: TikkaSdkErrorCode.WalletNotInstalled });
  });

  it('runs simulate → sign → submit → poll and returns InvokeResult', async () => {
    const { service, lifecycle } = buildService(true);

    jest.spyOn(lifecycle, 'simulate').mockResolvedValue(mockSimulateResult as any);
    jest.spyOn(lifecycle, 'sign').mockResolvedValue(SIGNED_XDR);
    jest.spyOn(lifecycle, 'submit').mockResolvedValue(TX_HASH);
    jest.spyOn(lifecycle, 'poll').mockResolvedValue(mockSubmitResult as any);

    const result = await service.invoke<number>(ContractFn.BUY_TICKET, [1, SOURCE_KEY, 1], {
      sourcePublicKey: SOURCE_KEY,
    });

    expect(lifecycle.simulate).toHaveBeenCalledWith(
      ContractFn.BUY_TICKET,
      [1, SOURCE_KEY, 1],
      expect.objectContaining({ sourcePublicKey: SOURCE_KEY }),
    );
    expect(lifecycle.sign).toHaveBeenCalledWith(ASSEMBLED_XDR, Networks.TESTNET);
    expect(lifecycle.submit).toHaveBeenCalledWith(SIGNED_XDR);
    expect(lifecycle.poll).toHaveBeenCalledWith(TX_HASH);
    expect(result).toEqual({ result: 99, txHash: TX_HASH, ledger: 300 });
  });

  it('returns simulated result early when simulateOnly is true', async () => {
    const { service, lifecycle } = buildService(false);

    jest.spyOn(lifecycle, 'simulate').mockResolvedValue(mockSimulateResult as any);
    const signSpy = jest.spyOn(lifecycle, 'sign');

    const result = await service.invoke<number>(ContractFn.BUY_TICKET, [1], {
      simulateOnly: true,
      sourcePublicKey: SOURCE_KEY,
    });

    expect(signSpy).not.toHaveBeenCalled();
    expect(result).toEqual({ result: 42, txHash: '', ledger: 0 });
  });

  it('passes memo through to lifecycle.simulate()', async () => {
    const { service, lifecycle } = buildService(true);

    jest.spyOn(lifecycle, 'simulate').mockResolvedValue(mockSimulateResult as any);
    jest.spyOn(lifecycle, 'sign').mockResolvedValue(SIGNED_XDR);
    jest.spyOn(lifecycle, 'submit').mockResolvedValue(TX_HASH);
    jest.spyOn(lifecycle, 'poll').mockResolvedValue(mockSubmitResult as any);

    await service.invoke(ContractFn.BUY_TICKET, [1], {
      sourcePublicKey: SOURCE_KEY,
      memo: { type: 'text', value: 'raffle-ref' },
    });

    expect(lifecycle.simulate).toHaveBeenCalledWith(
      ContractFn.BUY_TICKET,
      [1],
      expect.objectContaining({ memo: { type: 'text', value: 'raffle-ref' } }),
    );
  });
});

describe('ContractService.buildUnsigned()', () => {
  it('returns UnsignedTxResult mapped from lifecycle.simulate()', async () => {
    const { service, lifecycle } = buildService();

    jest.spyOn(lifecycle, 'simulate').mockResolvedValue(mockSimulateResult as any);

    const result = await service.buildUnsigned(ContractFn.BUY_TICKET, [1, SOURCE_KEY, 1], SOURCE_KEY);

    expect(lifecycle.simulate).toHaveBeenCalledWith(
      ContractFn.BUY_TICKET,
      [1, SOURCE_KEY, 1],
      { sourcePublicKey: SOURCE_KEY, fee: undefined },
    );
    expect(result).toEqual({
      unsignedXdr: ASSEMBLED_XDR,
      simulatedResult: 42,
      fee: '5000',
      networkPassphrase: Networks.TESTNET,
    });
  });

  it('throws InvalidParams when sourcePublicKey is empty', async () => {
    const { service } = buildService();
    await expect(
      service.buildUnsigned(ContractFn.BUY_TICKET, [], ''),
    ).rejects.toMatchObject({ code: TikkaSdkErrorCode.InvalidParams });
  });
});

describe('ContractService.submitSigned()', () => {
  it('delegates to lifecycle.submit() and lifecycle.poll() and returns SubmitSignedResult', async () => {
    const { service, lifecycle } = buildService();

    jest.spyOn(lifecycle, 'submit').mockResolvedValue(TX_HASH);
    jest.spyOn(lifecycle, 'poll').mockResolvedValue(mockSubmitResult as any);

    const result = await service.submitSigned(SIGNED_XDR);

    expect(lifecycle.submit).toHaveBeenCalledWith(SIGNED_XDR);
    expect(lifecycle.poll).toHaveBeenCalledWith(TX_HASH);
    expect(result).toEqual({ result: 99, txHash: TX_HASH, ledger: 300 });
  });

  it('throws InvalidParams when signedXdr is empty', async () => {
    const { service } = buildService();
    await expect(service.submitSigned('')).rejects.toMatchObject({
      code: TikkaSdkErrorCode.InvalidParams,
    });
  });
});

describe('ContractService.setWallet() / setContractId()', () => {
  it('propagates setWallet to lifecycle', () => {
    const { service, lifecycle } = buildService();
    const setWalletSpy = jest.spyOn(lifecycle, 'setWallet');

    const mockWallet = { name: WalletName.Mock } as WalletAdapter;
    service.setWallet(mockWallet);

    expect(setWalletSpy).toHaveBeenCalledWith(mockWallet);
  });

  it('propagates setContractId to lifecycle', () => {
    const { service, lifecycle } = buildService();
    const setIdSpy = jest.spyOn(lifecycle, 'setContractId');

    service.setContractId('NEW_ID');

    expect(setIdSpy).toHaveBeenCalledWith('NEW_ID');
  });
});
```

- [ ] **Step 4.2: Run new tests — expect failures**

```bash
cd sdk && npx jest --testPathPattern=contract.service.spec --no-coverage 2>&1 | tail -30
```

Expected: multiple failures because `ContractService` doesn't yet use `TransactionLifecycle`.

- [ ] **Step 4.3: Rewrite `contract.service.ts`**

Replace the entire content of `sdk/src/contract/contract.service.ts` with:

```ts
import { Injectable, Inject, Optional } from '@nestjs/common';
import {
  TransactionBuilder,
  rpc,
  xdr,
  Address,
  Contract,
  nativeToScVal,
  scValToNative,
  BASE_FEE,
} from '@stellar/stellar-sdk';
import { RpcService } from '../network/rpc.service';
import { HorizonService } from '../network/horizon.service';
import { NetworkConfig } from '../network/network.config';
import { WalletAdapter } from '../wallet/wallet.interface';
import { getRaffleContractId } from './constants';
import { ContractFnName } from './bindings';
import { TikkaSdkError, TikkaSdkErrorCode } from '../utils/errors';
import { TransactionLifecycle } from './lifecycle';
import type { TxMemo } from './lifecycle';
export type { TxMemo } from './lifecycle';

export interface InvokeOptions {
  sourcePublicKey?: string;
  simulateOnly?: boolean;
  fee?: string;
  /** Optional memo attached to the transaction envelope. */
  memo?: TxMemo;
}

export interface InvokeResult<T = any> {
  result: T;
  txHash: string;
  ledger: number;
}

/**
 * Result of buildUnsigned — everything needed for offline / cold-wallet signing.
 *
 * Workflow:
 *   1. Call buildUnsigned() on an online machine → hand `unsignedXdr` to the signer
 *   2. Signer signs offline and returns `signedXdr`
 *   3. Call submitSigned(signedXdr) on the online machine to broadcast
 */
export interface UnsignedTxResult<T = any> {
  /** Base64-encoded unsigned (but fee-bumped & auth-populated) transaction XDR */
  unsignedXdr: string;
  /** Simulated return value — lets the caller review the outcome before signing */
  simulatedResult: T;
  /** Estimated fee in stroops */
  fee: string;
  /** Network passphrase — must be passed to the signer so it signs the right network */
  networkPassphrase: string;
}

export interface SubmitSignedResult<T = any> {
  result: T;
  txHash: string;
  ledger: number;
}

/**
 * Detects if an error message indicates a failure in an external contract
 * (e.g., a SEP-41 token contract rejecting a transfer).
 */
function isExternalContractFailure(errorMsg: string): boolean {
  return /external|token|sep-?41/i.test(errorMsg);
}

@Injectable()
export class ContractService {
  private contractId: string;
  private lifecycle: TransactionLifecycle;

  constructor(
    private readonly rpc: RpcService,
    private readonly horizon: HorizonService,
    @Inject('NETWORK_CONFIG') private readonly networkConfig: NetworkConfig,
    @Optional() @Inject('WALLET_ADAPTER') private wallet?: WalletAdapter,
  ) {
    this.contractId = getRaffleContractId(networkConfig.network);
    this.lifecycle = new TransactionLifecycle(rpc, horizon, networkConfig, wallet, this.contractId);
  }

  setContractId(id: string): void {
    this.contractId = id;
    this.lifecycle.setContractId(id);
  }

  setWallet(adapter: WalletAdapter): void {
    this.wallet = adapter;
    this.lifecycle.setWallet(adapter);
  }

  /* ---------------- READ ONLY ---------------- */

  async simulateReadOnly<T>(method: ContractFnName | string, params: any[]): Promise<T> {
    const sourceKey = this.wallet
      ? await this.wallet.getPublicKey()
      : 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

    const account = await this.horizon.loadAccount(sourceKey).catch(() => {
      return { accountId: () => sourceKey, sequenceNumber: () => '0' } as any;
    });

    const contract = new Contract(this.contractId);
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkConfig.networkPassphrase,
    })
      .addOperation(contract.call(method, ...params.map((p) => this.toScVal(p))))
      .setTimeout(30)
      .build();

    const simResponse = await this.rpc.simulateTransaction(tx);

    if (rpc.Api.isSimulationError(simResponse)) {
      const errMsg = (simResponse as any).error ?? '';
      const code = isExternalContractFailure(errMsg)
        ? TikkaSdkErrorCode.ExternalContractError
        : TikkaSdkErrorCode.SimulationFailed;
      throw new TikkaSdkError(
        code,
        `Read-only simulation of ${method} failed: ${errMsg}`,
      );
    }

    const successResp = simResponse as rpc.Api.SimulateTransactionSuccessResponse;
    const result = successResp.result?.retval;

    if (result === undefined) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.SimulationFailed,
        `Read-only simulation of ${method} returned no data`,
      );
    }

    return scValToNative(result) as T;
  }

  /* ---------------- FULL INVOKE ---------------- */

  async invoke<T = any>(
    method: ContractFnName | string,
    params: any[],
    options: InvokeOptions = {},
  ): Promise<InvokeResult<T>> {
    if (!this.wallet && !options.simulateOnly) {
      throw new TikkaSdkError(TikkaSdkErrorCode.WalletNotInstalled, 'Wallet required');
    }

    const sim = await this.lifecycle.simulate<T>(method, params, {
      sourcePublicKey: options.sourcePublicKey,
      fee: options.fee,
      memo: options.memo,
    });

    if (options.simulateOnly) {
      return { result: sim.returnValue as T, txHash: '', ledger: 0 };
    }

    const signedXdr = await this.lifecycle.sign(sim.assembledXdr, sim.networkPassphrase);
    const txHash    = await this.lifecycle.submit(signedXdr);
    const polled    = await this.lifecycle.poll<T>(txHash);
    return { result: polled.returnValue as T, txHash: polled.txHash, ledger: polled.ledger };
  }

  /* ---------------- OFFLINE / COLD-WALLET SIGNING ---------------- */

  /**
   * Builds a fully-prepared (simulated + auth-populated) unsigned transaction XDR.
   */
  async buildUnsigned<T = any>(
    method: ContractFnName | string,
    params: any[],
    sourcePublicKey: string,
    fee?: string,
  ): Promise<UnsignedTxResult<T>> {
    if (!sourcePublicKey) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.InvalidParams,
        'sourcePublicKey is required for buildUnsigned',
      );
    }

    const sim = await this.lifecycle.simulate<T>(method, params, { sourcePublicKey, fee });
    return {
      unsignedXdr:      sim.assembledXdr,
      simulatedResult:  sim.returnValue as T,
      fee:              sim.minResourceFee,
      networkPassphrase: sim.networkPassphrase,
    };
  }

  /**
   * Submits a signed transaction XDR that was previously built with buildUnsigned().
   */
  async submitSigned<T = any>(signedXdr: string): Promise<SubmitSignedResult<T>> {
    if (!signedXdr) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.InvalidParams,
        'signedXdr is required for submitSigned',
      );
    }

    const txHash = await this.lifecycle.submit(signedXdr);
    const polled = await this.lifecycle.poll<T>(txHash);
    return { result: polled.returnValue as T, txHash: polled.txHash, ledger: polled.ledger };
  }

  /* ---------------- HELPERS ---------------- */

  private toScVal(val: any): xdr.ScVal {
    if (val instanceof xdr.ScVal) return val;
    if (typeof val === 'string' && val.length === 56) {
      return new Address(val).toScVal();
    }
    return nativeToScVal(val);
  }
}
```

- [ ] **Step 4.4: Run all ContractService tests — all should pass**

```bash
cd sdk && npx jest --testPathPattern=contract.service.spec --no-coverage 2>&1 | tail -20
```

Expected: `Tests: X passed` with no failures.

- [ ] **Step 4.5: Run the full SDK test suite to check for regressions**

```bash
cd sdk && npx jest --no-coverage 2>&1 | tail -30
```

Expected: all tests pass. If any fail, check for import of `TxMemo` from `contract.service` — it is now re-exported from `lifecycle` via `contract.service`.

- [ ] **Step 4.6: Commit**

```bash
git add sdk/src/contract/contract.service.ts sdk/src/contract/contract.service.spec.ts
git commit -m "refactor(sdk): ContractService delegates invoke/buildUnsigned/submitSigned to TransactionLifecycle"
```

---

## Task 5 — Update ARCHITECTURE.md

**Files:**
- Modify: `docs/ARCHITECTURE.md`

- [ ] **Step 5.1: Add Fee Estimation and Confirmation Polling sub-sections**

In `docs/ARCHITECTURE.md`, find the existing "Transaction Lifecycle" sub-section (around line 225):

```markdown
### Transaction Lifecycle (internal)

```
simulate tx → estimate fee → build XDR → request wallet signature → submit → poll confirmation
```

### Wallet Adapters
```

Replace with:

```markdown
### Transaction Lifecycle (internal)

```
simulate tx → estimate fee → build XDR → request wallet signature → submit → poll confirmation
```

### Fee Estimation

Call `FeeEstimatorService.estimateFee({ method, params })` before asking the user to sign.
Returns `{ xlm, stroops, resources }` — no wallet needed (falls back to an anonymous source key).
Re-call whenever inputs change; each call runs a fresh `simulateTransaction`.

```ts
const estimate = await feeEstimator.estimateFee({
  method: ContractFn.BUY_TICKET,
  params: [raffleId, buyerPublicKey, quantity],
});
// estimate.xlm        → "0.0051000" (human-readable)
// estimate.stroops    → "51000"
// estimate.resources  → { cpuInstructions, diskReadBytes, … }
```

### Confirmation Polling

After submit, `lifecycle.poll()` polls `getTransaction` with exponential backoff until the
transaction reaches `SUCCESS` or `FAILED`. `RpcService.getTransaction()` is single-shot;
the retry loop and backoff live entirely in `lifecycle.poll()`.

| Parameter | Default | Override via |
|---|---|---|
| Timeout | 60 s | `PollConfig.timeoutMs` |
| Initial interval | 2 s | `PollConfig.intervalMs` |
| Backoff factor | 1.5× | `PollConfig.backoffFactor` |
| Max interval | 10 s | `PollConfig.maxIntervalMs` |

Pass `poll` inside `InvokeLifecycleOptions` to override per-call:

```ts
await lifecycle.invoke(ContractFn.BUY_TICKET, params, {
  poll: { timeoutMs: 90_000, intervalMs: 3_000 },
});
```

RPC-level transient errors (429, 500–504) are retried separately by `RpcService.executeRequest()`
and do not consume the poll timeout.

### Wallet Adapters
```

- [ ] **Step 5.2: Verify the markdown renders correctly**

```bash
cd /Users/user/Desktop/Projects/tikka && grep -n "Fee Estimation\|Confirmation Polling\|Wallet Adapters" docs/ARCHITECTURE.md
```

Expected output shows the three section headings at sequential line numbers with Fee Estimation and Confirmation Polling appearing before Wallet Adapters.

- [ ] **Step 5.3: Run the full SDK test suite one final time**

```bash
cd sdk && npx jest --no-coverage 2>&1 | tail -10
```

Expected: all tests pass, no failures.

- [ ] **Step 5.4: Commit**

```bash
git add docs/ARCHITECTURE.md
git commit -m "docs: document fee estimation and confirmation polling in ARCHITECTURE.md"
```

---

## Final Verification

- [ ] All 5 tasks committed to `fee_estimation` branch
- [ ] `sdk/src/network/rpc.service.ts` — `getTransaction` is single-shot (no while loop)
- [ ] `sdk/src/contract/lifecycle.ts` — default poll timeout is 60 s; `TxMemo` exported; `setWallet`/`setContractId` present
- [ ] `sdk/src/contract/contract.service.ts` — `invoke`, `buildUnsigned`, `submitSigned` delegate to `this.lifecycle`
- [ ] `docs/ARCHITECTURE.md` — Fee Estimation and Confirmation Polling sections present
