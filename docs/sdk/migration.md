# Migrating from direct `@stellar/stellar-sdk` to `@tikka/sdk`

This guide is for integrators who already talk to the Tikka raffle contract by
driving `@stellar/stellar-sdk` themselves — `new Contract()`, `rpc.Server`,
`TransactionBuilder`, `nativeToScVal`, `rpc.assembleTransaction` — and want to
consume `@tikka/sdk` instead.

The mapping below is not theoretical. It is the migration the Tikka frontend
itself made in [PR #1434](https://github.com/crackedstudio/tikka/pull/1434),
which deleted a 708-line `contractService.ts` and replaced it with a thin
`sdkClient.ts` that only wires config, a wallet bridge, and result-shape
mapping. If your code looks like the "Before" column, the "After" column is
where it goes.

**Quick links**

- [Install](#1-install)
- [`@stellar/stellar-sdk` version constraint](#2-stellarstellar-sdk-version-constraint) — and [what breaks on v14](#what-breaks-on-v14)
- [API mapping](#3-api-mapping)
- [Reads, before → after](#4-reads-before--after)
- [Writes, before → after](#5-writes-before--after)
- [Error handling](#6-error-handling)
- [Offline and cold-wallet signing](#7-offline-and-cold-wallet-signing)
- [Wallet adapters vs. a wallet kit](#8-wallet-adapters-vs-a-wallet-kit)
- [Testing and mocking](#9-testing-and-mocking)
- [Migration checklist](#10-migration-checklist)

---

## 1. Install

```bash
pnpm add @tikka/sdk
```

```ts
import { RaffleService, TicketService, FreighterAdapter } from '@tikka/sdk';
```

**Node 22 or newer is required.** `@tikka/sdk` depends on
`@stellar/stellar-sdk@^16.1.0`, and that release declares
`engines.node >= 22.0.0`. If you are still on Node 18 or 20, upgrade first —
this is the single most common reason a v14-era app fails to install cleanly
after adopting the SDK.

Pick your entry point before you go further — the full SDK, the read-only
sub-path, and the light bundle have very different footprints:

| Entry              | Use when                                                                                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@tikka/sdk`       | Browser apps that must write (create/buy/claim) or Node services that want the NestJS modules. Instantiate service classes directly; there is no DI container in the browser. |
| `@tikka/sdk/read`  | Dashboards, SSR pages, analytics — query only. No wallet or signing code is bundled.                                                                                          |
| `@tikka/sdk/light` | React Native / edge / size-constrained browsers. Smallest bundle, manual instantiation only.                                                                                  |

---

## 2. `@stellar/stellar-sdk` version constraint

`@tikka/sdk` declares its Stellar dependency as a **direct dependency**, pinned
to the v16 line:

```jsonc
// sdk/package.json
"dependencies": {
  "@stellar/stellar-sdk": "^16.1.0"
}
```

The monorepo additionally pins it workspace-wide, which is the recommended
pattern for consumers too:

```jsonc
// package.json
"pnpm": {
  "overrides": {
    "@stellar/stellar-sdk": "^16.1.0"
  }
}
```

**Why this is not optional.** Stellar SDK types cross the SDK boundary in both
directions — `HorizonService.getServer()` hands you a `Horizon.Server`,
`TransactionLifecycle` consumes `rpc.Server`, and `simulate()` /
`sendTransaction()` pass Stellar `Transaction` objects around. If your app
resolves a _different_ major than `@tikka/sdk` does, your package manager
installs **two copies** of `@stellar/stellar-sdk` into the tree. The values
then stop being identity-compatible: `instanceof` checks fail, `xdr` class
identity diverges, and XDR you decode with your copy is not the XDR the SDK
serialized with its copy. The failure is a runtime `TypeError` or a silently
mangled payload — not a helpful type error.

So: if `@stellar/stellar-sdk` remains a direct dependency of your app, either
align the range to `^16.1.0` or add the `overrides` entry above. Do both if
other packages in your workspace pull it in too.

### What breaks on v14

Migrating from a v14-based app to v16 is mostly a **packaging** change, not a
rewrite of the Soroban calls. These are the parts that actually break:

| Symptom                                                                                           | Cause                                                                                                 | Fix                                                                                                                               |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Install or `engines` check fails on Node 18/20                                                    | `@stellar/stellar-sdk@16.2.0` declares `engines.node >= 22.0.0`                                       | Upgrade to Node 22+ before adopting the SDK                                                                                       |
| `TypeError` on XDR objects crossing the SDK boundary                                              | Two copies of `@stellar/stellar-sdk` (your `^14` and the SDK's `^16.1.0`)                             | Align the range or add the `pnpm.overrides` pin                                                                                   |
| `SyntaxError: Unexpected token 'export'` / `Cannot use import statement outside a module` in Jest | v16 pulls ESM-only transitive dependencies (`@noble/*`, `uint8array-extras`, `@scure/*`, `base32.js`) | Allow-list them in `transformIgnorePatterns`. This repo's own equivalent is in [`sdk/jest.config.cjs`](../../sdk/jest.config.cjs) |
| `require()` interop changes in a CJS test or build                                                | v16 is a dual ESM + CJS package with `"type": "module"`; the CJS output lives under `lib/cjs/`        | Keep the SDK on the ESM path (Vite/webpack default), or point CJS tooling at the `require` condition                              |
| `@stellar/stellar-base` is no longer needed as a separate install                                 | v16 merged `@stellar/stellar-base` into `@stellar/stellar-sdk`                                        | Drop `@stellar/stellar-base` from your dependencies and import from `@stellar/stellar-sdk`                                        |

**What does _not_ break.** Every low-level API the old direct-SDK code used is
still exported in v16: `Contract`, `rpc.Server`, `TransactionBuilder`,
`Account`, `BASE_FEE`, `nativeToScVal`, `scValToNative`, `Keypair`, `Horizon`,
`Networks`. That is precisely why the changes in this guide are about _call
shape_ — you move from building and assembling transactions by hand to handing
the SDK a method name and native arguments.

One v16 behaviour change worth knowing about even though it is opt-in: the XDR
schema was regenerated for protocol 27 (CAP-71) and the new
`SOROBAN_CREDENTIALS_ADDRESS_V2` / `SOROBAN_CREDENTIALS_ADDRESS_WITH_DELEGATES`
credential types are available. The legacy `SOROBAN_CREDENTIALS_ADDRESS` (V1)
credential **remains the default**, so an existing v14-era authorization setup
keeps working unchanged.

---

## 3. API mapping

### Transport and configuration

| Direct `@stellar/stellar-sdk`                       | `@tikka/sdk`                                                                                                                   |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `new Server(rpcUrl)`                                | `new RpcService(networkConfig, rpcConfig?)` — adds retries, endpoint failover, circuit breaking, and a pluggable `fetchClient` |
| `server.simulateTransaction(tx)`                    | `rpcService.simulateTransaction(tx)`                                                                                           |
| `server.sendTransaction(tx)`                        | `rpcService.sendTransaction(tx)`                                                                                               |
| `server.getTransaction(hash)`                       | `rpcService.getTransaction(hash)`                                                                                              |
| `new Horizon.Server(horizonUrl)`                    | `new HorizonService(networkConfig)`                                                                                            |
| `horizon.loadAccount(pk)` / `server.getAccount(pk)` | `horizonService.loadAccount(pk)`                                                                                               |
| `horizon.fetchBaseFee()`                            | `horizonService.getBaseFee()`                                                                                                  |
| Hand-rolled `NETWORK_PASSPHRASE` / URL constants    | `resolveNetworkConfig('testnet' \| 'mainnet' \| 'standalone')`, or the `NETWORK_PRESETS` map                                   |
| `subscribeToContractEvents(server, opts)`           | `subscribeToContractEvents(server, opts)` / `subscribeToEvents(opts)` (re-exported from the SDK)                               |

### Contract calls

| Direct `@stellar/stellar-sdk`                                                                                | `@tikka/sdk`                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `new Contract(contractId)`                                                                                   | `new ContractService(rpc, horizon, networkConfig, wallet?, contractId?)`                                                                 |
| `contract.call(fn, ...scVals)`                                                                               | `contractService.invoke(fn, nativeParams)` / `.simulateReadOnly(fn, nativeParams)` / `.buildUnsigned(fn, nativeParams, sourcePublicKey)` |
| `new TransactionBuilder(acct, { fee: BASE_FEE, networkPassphrase }).addOperation(op).setTimeout(30).build()` | `TransactionLifecycle.invoke(fn, params)` (online) or `ContractService.buildUnsigned(...)` (offline)                                     |
| `nativeToScVal(v, { type: 'u32' })`                                                                          | **Delete it.** Pass the native value; the SDK converts to the right `ScVal`                                                              |
| `scValToNative(result)`                                                                                      | **Delete it.** `SimulateResult.returnValue`, `SubmitResult.returnValue`, and `ContractResponse.value` are already decoded                |
| `new Account("GAAAA…WHF", "0")` dummy account for reads                                                      | **Delete it.** `simulateReadOnly()` needs no account and no signature                                                                    |
| `rpc.assembleTransaction(tx, sim).build()` then read `.fee`                                                  | `FeeEstimatorService.estimateFee({ method, params })` → `{ stroops, xlm, resources }`                                                    |
| manual simulate → sign → submit → poll                                                                       | `TransactionLifecycle.invoke(fn, params, { poll })`                                                                                      |
| `rpc.Api.isSimulationError(res)`                                                                             | `TikkaSdkError` + `TikkaSdkErrorCode`, or `toTypedSdkError(err)`                                                                         |
| `formatXlm(stroops)` / hand-rolled amount math                                                               | `stroopsToXlm`, `normalizeAmount`, `formatContractResponse`, `multiplyAmountByQuantity`                                                  |
| SEP-10 challenge/verify written against the Stellar SDK                                                      | `buildChallenge` / `verifyResponse`, re-exported from `@tikka/sdk`                                                                       |

### Domain-level operations

The direct-SDK code hard-coded contract function names. The SDK exposes them as
`ContractFn` constants, and the domain services wrap them with validation:

| Direct `@stellar/stellar-sdk`                                          | `@tikka/sdk`                                                                    |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `contract.call(ContractFn.CREATE_RAFFLE, …)`                           | `RaffleService.create(params)` / `RaffleService.estimateCreate(params)`         |
| `contract.call(ContractFn.BUY_TICKET, raffleId, buyer, qty)` in a loop | `TicketService.buyTickets({ raffleId, count, maxPricePerTicket })`              |
| `contract.call(ContractFn.BUY_TICKETS_BATCH, …)`                       | `TicketService.buyBatch({ purchases })`                                         |
| `contract.call(ContractFn.CLAIM_PRIZE, raffleId)`                      | `TicketService.claimPrize({ raffleId })`                                        |
| `contract.call(ContractFn.CANCEL_RAFFLE, raffleId)`                    | `RaffleService.cancel({ raffleId })`                                            |
| `contract.call(ContractFn.GET_RAFFLE_DATA, raffleId)`                  | `RaffleService.get(raffleId)`                                                   |
| `contract.call(ContractFn.GET_ACTIVE_RAFFLE_IDS)`                      | `RaffleService.listActive()`                                                    |
| `contract.call(ContractFn.GET_ALL_RAFFLE_IDS)`                         | `RaffleService.listAll()`                                                       |
| `contract.call(ContractFn.GET_USER_TICKETS, raffleId, addr)`           | `TicketService.getUserTickets({ raffleId, userAddress })`                       |
| `contract.call(ContractFn.GET_USER_PARTICIPATION, addr)`               | `UserService.getParticipation({ address })` / `UserService.getTickets(address)` |
| `contract.call(ContractFn.PAUSE \| UNPAUSE, …)`                        | `AdminService.pause()` / `.unpause()`                                           |

### Wallet integration

| Direct `@stellar/stellar-sdk`                                  | `@tikka/sdk`                                                                  |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `window.freighter` / `window.xBull` / `window.rabet` detection | `FreighterAdapter` / `XBullAdapter` / `RabetAdapter` with `isAvailable()`     |
| `@albedo-link/intent` calls                                    | `AlbedoAdapter`                                                               |
| `@lobstrco/signer-extension-api` calls                         | `LobstrAdapter`                                                               |
| Hand-rolled `if (walletInstalled) sign(tx.toXDR())`            | `WalletAdapter.signTransaction(xdr, { networkPassphrase })` → `{ signedXdr }` |
| `Keypair` in tests                                             | `MockWalletAdapter`                                                           |
| —                                                              | `WalletName`, `WalletCapabilities`, `SignTransactionResult`                   |

### The response envelope

All SDK contract operations return a `ContractResponse<T>` envelope. That
interface is not re-exported from the package root — the exported alias is
`TxResponse<T>`, so that is the name to import if you need to annotate:

```ts
import type { TxResponse } from '@tikka/sdk';
```

The shape is deliberately permissive because different paths set different
subsets:

```ts
interface ContractResponse<T = any> {
  success?: boolean;
  status?: 'SUCCESS' | 'ERROR';
  value?: T; // decoded result, on success
  error?: string; // message, on failure
  transactionHash?: string;
  txHash?: string; // legacy alias
  ledger?: number;
  feeCharged?: string;
  feePaid?: string;
  resultXdr?: string;
  warnings?: string[];
}
```

Read `value` on success and `error` on failure. `success` and `status` are both
present on write paths; treat them as optional rather than assuming a single
canonical flag.

---

## 4. Reads, before → after

### Bootstrap once, reuse everywhere

**Before** — a module-level singleton plus raw SDK objects:

```ts
import { Contract, rpc } from '@stellar/stellar-sdk';

const server = new rpc.Server('https://soroban-testnet.stellar.org');
const contract = new Contract('CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2');
```

**After** — SDK singletons constructed from a resolved network config:

```ts
import {
  RpcService,
  HorizonService,
  ContractService,
  FeeEstimatorService,
  RaffleService,
  TicketService,
  resolveNetworkConfig,
} from '@tikka/sdk';

const networkConfig = resolveNetworkConfig('testnet');
const CONTRACT_ID = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2';

const rpcService = new RpcService(networkConfig);
const horizonService = new HorizonService(networkConfig);

const contractService = new ContractService(
  rpcService,
  horizonService,
  networkConfig,
  walletAdapter, // omit (or pass undefined) for read-only usage
  CONTRACT_ID,
);
const feeEstimator = new FeeEstimatorService(
  rpcService,
  horizonService,
  networkConfig,
  walletAdapter,
  CONTRACT_ID,
);

const raffleService = new RaffleService(contractService, feeEstimator);
const ticketService = new TicketService(contractService);
```

> **Entry points — read this before copying the snippet.**
>
> - The `@tikka/sdk` root exports the transport (`RpcService`, `HorizonService`),
>   the domain services (`RaffleService`, `TicketService`, `UserService`,
>   `AdminService`), `FeeEstimatorService`, the wallet contract, `ContractFn`,
>   `RaffleStatus`, the `TxResponse` envelope and the shared utils. It does **not**
>   re-export `ContractService` itself. In-repo consumers therefore reach it
>   through the SDK's NestJS module graph rather than a direct import — see
>   `sdk/examples/quickstart.ts` for the module-wiring form
>   (`AppModule.forRoot({ network, wallet })` then `app.get(RaffleService)`).
>   If you are on the root entry today, that module form is the supported way to
>   obtain a wired `ContractService`.
> - The `@tikka/sdk/light` entry exports its own browser-friendly `RpcService`
>   whose _public_ surface matches, but which lacks the private members the full
>   service's constructor type expects. If you mix entries, cast once at the
>   boundary rather than loosening types everywhere:
>   `const transport = rpcService as unknown as ConstructorParameters<typeof ContractService>[0];`

### Read a raffle

**Before** — build an operation, invent a zero-sequence dummy account, simulate,
check for a simulation error, decode the XDR:

```ts
const operation = contract.call('get_raffle_data', nativeToScVal(raffleId, { type: 'u32' }));
const account = new Account('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', '0');
const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase })
  .addOperation(operation)
  .setTimeout(30)
  .build();

const response = await server.simulateTransaction(tx);
if (rpc.Api.isSimulationError(response)) {
  throw new Error(`Failed to get raffle data: ${response.error}`);
}
const raw = scValToNative(response.result!.retval);
```

**After** — one call, result already decoded:

```ts
// Typed domain service (preferred):
const { value: raffle, error } = await raffleService.get(raffleId);
// raffle: RaffleData {
//   raffleId, creator, metadataCid, ticketPrice, maxTickets, ticketsSold,
//   endTime, status: RaffleStatus, allowMultiple, asset, assetIssuer?,
//   winner?, winningTicketId?, prizeAmount?
// }

// Or the raw escape hatch, when you need a binding the domain service
// does not wrap yet:
const res = await contractService.simulateReadOnly<Record<string, unknown>>(
  ContractFn.GET_RAFFLE_DATA,
  [raffleId], // native args — no nativeToScVal
);
```

`RaffleStatus` is a **string** enum — `RaffleStatus.OPEN = "open"`,
`DRAWING = "drawing"`, `FINALIZED = "finalized"`, `CANCELLED = "cancelled"` —
re-exported from `@tikka/sdk`. If you previously derived `isActive` yourself by
comparing `raw.state` against a hard-coded number, compare against the enum
member instead.

### List raffle IDs

**Before:**

```ts
const op = contract.call('get_active_raffle_ids');
// …dummy account, TransactionBuilder, simulateTransaction, scValToNative…
const ids = Array.isArray(parsed) ? parsed : [];
```

**After:**

```ts
const { value: activeIds } = await raffleService.listActive();
const { value: allIds } = await raffleService.listAll();
```

### Read a user's participation

**Before** — call the binding directly and hand-decode the struct:

```ts
const op = contract.call(
  'get_user_raffle_participation',
  nativeToScVal(userAddress, { type: 'address' }),
  nativeToScVal(raffleId, { type: 'u32' }),
);
// …simulate, scValToNative, then map snake_case → camelCase by hand…
```

**After** — prefer the domain service; fall back to the escape hatch only for
legacy per-raffle bindings that predate the global helper:

```ts
// Global participation summary:
const { value: participation } = await userService.getParticipation({ address });
// { address, raffleIds, totalRafflesEntered, totalRafflesWon, totalTicketsBought }

const { value: tickets } = await userService.getTickets(address);
// [{ raffleId, ticketId, purchasedAt? }]

// Legacy per-raffle binding (returns an untyped struct — map it yourself):
const res = await contractService.simulateReadOnly<Record<string, unknown>>(
  'get_user_raffle_participation',
  [userAddress, raffleId],
);
```

---

## 5. Writes, before → after

### Estimate the create-raffle fee

**Before** — simulate the create transaction, assemble it, and read the fee off
the rebuilt envelope:

```ts
const tx = await buildCreateRaffleTx(params);
const sim = await server.simulateTransaction(tx);
if (rpc.Api.isSimulationError(sim)) throw new Error(sim.error ?? 'Simulation failed');
const prepared = rpc.assembleTransaction(tx, sim).build();
return { xlm: formatXlm(prepared.fee), stroops: prepared.fee };
```

**After:**

```ts
const estimate = await raffleService.estimateCreate({
  ticketPrice: stroopsToXlm(ticketPriceStroops),
  maxTickets: totalTickets,
  endTime: Date.now() + durationInSeconds * 1000, // milliseconds
  allowMultiple: true,
  asset: 'XLM',
  metadataCid: metadataId ?? '',
});
// estimate: { stroops: string; xlm: string }
```

Two unit details catch people out:

- `RaffleParams.ticketPrice` is an **XLM decimal string** — convert with
  `stroopsToXlm()` if you hold stroops.
- `RaffleParams.endTime` is in **milliseconds**; the SDK converts to the
  seconds the contract expects.

For a fee you can quote to a user before they commit, `FeeEstimatorService`
also exposes `getFeeQuote()` (with `maxFeeStroops` / `staleAfterMs`,
`confidence`, and `warnings`) and `isQuoteStale()`.

### Create a raffle

**Before** — a hand-rolled `build → estimate → sign → submit → poll` pipeline
driven by a `buildCreateRaffleTx` callback:

```ts
return runPipeline((p) => buildCreateRaffleTx(p), { params, options });
```

**After** — let the domain service own the whole lifecycle:

```ts
const result = await raffleService.create({
  ticketPrice: stroopsToXlm(ticketPriceStroops),
  maxTickets: totalTickets,
  endTime: endTimeUnixSeconds * 1000,
  allowMultiple: true,
  asset: 'XLM',
  metadataCid: metadataId ?? '',
});
// result: ContractResponse<number> — `value` is the new raffleId
```

If you need progress events (to drive a UI spinner through
`BUILD → ESTIMATE → SIGN → SUBMIT → POLL → DONE`) rather than a single
resolved promise, drive the SDK stage methods yourself against
`ContractService`:

```ts
import { ContractFn } from '@tikka/sdk';

const params = raffleService.buildCreateContractParams(contractParams);
const sim = await contractService.simulate(ContractFn.CREATE_RAFFLE, params);
const signedXdr = await contractService.sign(sim.assembledXdr, sim.networkPassphrase);
const txHash = await contractService.submit(signedXdr);
const done = await contractService.poll(txHash, { timeoutMs: 30_000, intervalMs: 2_000 });
```

`buildCreateContractParams()` is public precisely so a frontend can reuse the
SDK's canonical `ScVal` shape without duplicating it. Note that the SDK takes
`endTime` in **milliseconds** here as well, and converts on your behalf.

`TransactionLifecycle` is the lower-level equivalent, if you would rather not
depend on the domain service at all:

```ts
const result = await lifecycle.invoke(ContractFn.CREATE_RAFFLE, params, {
  poll: { timeoutMs: 90_000, intervalMs: 3_000 },
});
// result: SubmitResult<number> { txHash, ledger, returnValue, resultXdr? }
```

### Buy tickets

**Before** — one `buy_ticket` operation per ticket, or a manual batch loop:

```ts
const op = contract.call(
  'buy_ticket',
  nativeToScVal(raffleId, { type: 'u32' }),
  nativeToScVal(userAddress, { type: 'address' }),
  nativeToScVal(ticketCount, { type: 'u32' }),
  nativeToScVal(BigInt(maxPricePerTicket)),
);
```

**After:**

```ts
const result = await ticketService.buyTickets({
  raffleId,
  count: ticketCount,
  maxPricePerTicket, // stroops, as a string
});
// result: ContractResponse<BuyTicketResult>
// { value?: { transactionHash, ledger, ticketIds, feePaid }, error?: string }
```

The service validates the inputs, the raffle state, and duplicate submissions
before it ever hits the network, and it surfaces duplicates as typed errors
rather than failed simulations. For a genuine multi-raffle batch use
`buyBatch({ purchases: [{ raffleId, quantity }] })`.

### Claim a prize

**Before:**

```ts
const op = contract.call('claim_prize', nativeToScVal(raffleId, { type: 'u32' }));
// …assemble, sign, submit, poll…
```

**After:**

```ts
const result = await ticketService.claimPrize({ raffleId });
// result: ContractResponse<ClaimPrizeResult>
// { value?: { transactionHash, ledger, feePaid }, error?: string }
```

---

## 6. Error handling

**Before** — substring matching on error messages, because the Stellar SDK only
hands you strings:

```ts
function handleError(error: unknown, operation: string): ContractError {
  const msg = error instanceof Error ? error.message : String(error);
  if (msg.includes('ContractPaused') || msg.includes('contract_paused')) {
    /* … */
  }
  if (msg.includes('network') || msg.includes('connection')) {
    /* … */
  }
  if (msg.includes('insufficient')) {
    /* … */
  }
  // …and so on
}
```

**After** — switch on `TikkaSdkErrorCode`. The SDK maps Soroban contract
errors to codes, so you match on a value instead of on prose:

```ts
import { TikkaSdkError, TikkaSdkErrorCode, toTypedSdkError } from '@tikka/sdk';

try {
  await ticketService.buyTickets({ raffleId, count, maxPricePerTicket });
} catch (err) {
  const e = toTypedSdkError(err);
  switch (e.code) {
    case TikkaSdkErrorCode.UserRejected:
      /* user cancelled        */ break;
    case TikkaSdkErrorCode.WalletNotConnected:
      /* call connect() first  */ break;
    case TikkaSdkErrorCode.WalletNotInstalled:
      /* extension missing     */ break;
    case TikkaSdkErrorCode.RaffleNotFound:
      /* …                     */ break;
    case TikkaSdkErrorCode.RaffleEnded:
      /* …                     */ break;
    case TikkaSdkErrorCode.RaffleFull:
      /* …                     */ break;
    case TikkaSdkErrorCode.InsufficientFunds:
      /* …                     */ break;
    case TikkaSdkErrorCode.SimulationFailed:
      /* …                     */ break;
    case TikkaSdkErrorCode.Timeout:
      /* …                     */ break;
    case TikkaSdkErrorCode.NetworkError:
      /* …                     */ break;
    default: /* e.message, e.cause    */
  }
}
```

`toTypedContractError(message, rawError)` is available when you have a raw
Soroban error string rather than a thrown `TikkaSdkError`. The legacy
`ContractErrorType` object is also still exported if you need the old key
names during the transition.

---

## 7. Offline and cold-wallet signing

If you were building an unsigned transaction on an online machine and handing
the XDR to an offline signer, use `buildUnsigned` / `submitSigned` — or the
standalone helpers if you want no service instance at all:

```ts
import { signTransactionOffline } from '@tikka/sdk';

// Step 1 — online machine: build, simulate, auth-populate, fee-bump.
const { unsignedXdr, fee, networkPassphrase, simulatedResult } =
  await contractService.buildUnsigned(ContractFn.CREATE_RAFFLE, params, sourcePublicKey);

// Step 2 — offline signer: sign the XDR with a local secret.
const signedXdr = signTransactionOffline(unsignedXdr, secretKey, networkPassphrase);

// Step 3 — online machine: broadcast and poll.
const result = await contractService.submitSigned(signedXdr);
```

`buildUnsigned()` returns the simulated result alongside the XDR, so the signer
side can review the outcome before committing a signature. A runnable version
is in [`examples/offline-signing.ts`](../../sdk/examples/offline-signing.ts).

---

## 8. Wallet adapters vs. a wallet kit

This is the decision most integrators get wrong, so it is worth being explicit.

The SDK's `WalletAdapter` contract is deliberately tiny:

```ts
abstract class WalletAdapter {
  abstract readonly name: string;

  isAvailable(): boolean; // required
  getPublicKey(): Promise<string>; // required
  signTransaction(xdr, opts?): Promise<SignTransactionResult>; // required
  getCapabilities(): WalletCapabilities; // required

  connect?(): Promise<void>; // optional
  disconnect?(): void; // optional
  signMessage?(message: string): Promise<string>;
  getNetwork?(): Promise<string | undefined>;
}
```

The signing flow is fixed, and it is the whole point:

```
SDK builds unsigned XDR
  → adapter.signTransaction(xdr, { networkPassphrase })
  → adapter returns { signedXdr }
  → SDK submits signedXdr to Soroban RPC
```

### Use a built-in SDK adapter when…

- You support one or two known wallets.
- You need exactly two things from the wallet: **connect** and **sign**.
- You would rather not ship wallet-selection UI code.

```ts
import { FreighterAdapter, resolveNetworkConfig } from '@tikka/sdk';

const networkConfig = resolveNetworkConfig('testnet');
const wallet = new FreighterAdapter({ networkPassphrase: networkConfig.networkPassphrase });

if (wallet.isAvailable()) {
  await wallet.connect();
  const publicKey = await wallet.getPublicKey();
  // …hand `wallet` to ContractService and carry on…
}
```

`isAvailable()` is synchronous, so the usual pattern is to build a map of
adapters, filter by availability, and let the user pick:

```ts
const adapters = {
  freighter: new FreighterAdapter({ networkPassphrase }),
  xbull: new XBullAdapter({ networkPassphrase }),
  albedo: new AlbedoAdapter({ networkPassphrase }),
  lobstr: new LobstrAdapter({ networkPassphrase }),
};
const available = Object.entries(adapters).filter(([, a]) => a.isAvailable());
```

Behaviour is **not** uniform across adapters, so check `getCapabilities()`
before depending on a feature rather than assuming:

| Adapter             | `signMessage` |   `getNetwork`    | Requires `connect()` | Network passphrase for `signTransaction` |
| ------------------- | :-----------: | :---------------: | :------------------: | :--------------------------------------: |
| `FreighterAdapter`  |      ✅       |        ✅         |       optional       |                    ❌                    |
| `AlbedoAdapter`     |      ✅       |        ✅         |          ❌          |                    ✅                    |
| `RabetAdapter`      |      ❌       | ✅ (from options) |          ❌          |                    ✅                    |
| `XBullAdapter`      |      ❌       |        ❌         |          ✅          |                    ❌                    |
| `LobstrAdapter`     |      ❌       |        ❌         |          ✅          |                    ❌                    |
| `MockWalletAdapter` |      ✅       |        ✅         |          ❌          |                    ❌                    |

The full contract, per-wallet setup, and error codes are in
[`WALLET_ADAPTERS.md`](../WALLET_ADAPTERS.md).

### Use a wallet kit when…

- You need **wallet discovery and a multi-wallet selection UI** (a modal
  listing every installed wallet). Adapter availability checks do not give you
  a picker, and kits handle deep links, mobile handoff, and account switching
  for you.
- You need a wallet the SDK does not ship an adapter for.
- You are building a mobile app and need the kit's native deep-link handling.

Kits such as `@creit.tech/stellar-wallets-kit` solve _connection and discovery_.
They know nothing about the Tikka contract, so they should never build or submit
a transaction — that is the work the SDK exists to own. The correct shape is a
thin bridge: the kit handles connection, the SDK keeps everything else. This is
exactly what the Tikka frontend does in `client/src/services/sdkClient.ts`.

```ts
import {
  WalletAdapter,
  WalletName,
  TikkaSdkError,
  TikkaSdkErrorCode,
  type SignTransactionResult,
  type WalletCapabilities,
} from '@tikka/sdk';
import { getAccountAddress, signTransaction } from './walletService';

class MyKitAdapter extends WalletAdapter {
  readonly name = WalletName.Custom;

  isAvailable(): boolean {
    return true; // the kit owns discovery; we are always "installed"
  }

  async getPublicKey(): Promise<string> {
    const address = await getAccountAddress();
    if (!address) {
      throw new TikkaSdkError(TikkaSdkErrorCode.WalletNotConnected, 'Wallet not connected');
    }
    return address;
  }

  async signTransaction(
    xdr: string,
    opts?: { networkPassphrase?: string; accountToSign?: string },
  ): Promise<SignTransactionResult> {
    // The kit signs XDR. It does not build, simulate, or submit.
    const signedXdr = await signTransaction(xdr, {
      networkPassphrase: opts?.networkPassphrase ?? this.options.networkPassphrase,
      accountToSign: opts?.accountToSign,
    });
    return { signedXdr };
  }

  getCapabilities(): WalletCapabilities {
    return {
      supportsGetPublicKey: true,
      supportsSignTransaction: true,
      supportsSignMessage: false,
      supportsGetNetwork: false,
    };
  }
}
```

**The rule of thumb:** if a wallet integration ever produces a `Transaction`
object rather than a signed XDR string, you have given transaction construction
away — and with it simulation, resource-fee estimation, sequence management,
and confirmation polling.

### Custom adapters

`WalletName.Custom` is a valid `name` for any adapter you write, so custody
APIs, HSMs, and mobile-native signers all slot into the same interface. Keep the
capability flags honest: the SDK's conformance suite verifies that adapters
reporting `supportsSignMessage: false` actually throw when `signMessage()` is
called, and that `true` adapters return a string. A runnable example is in
[`examples/custom-wallet.ts`](../../sdk/examples/custom-wallet.ts).

---

## 9. Testing and mocking

Replace test doubles you had to write by hand:

| Need                                            | Use                                                                                                                                                         |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A wallet that signs without a browser extension | `MockWalletAdapter` — also accepts `failSignTransaction`, `failGetPublicKey`, `failSignMessage`, and `delayMs` for exercising your error and loading states |
| An RPC layer with no network                    | `MockRpcService` — in-memory, for Storybook and offline dev                                                                                                 |
| Dev logging                                     | `ConsoleLogger`, or pass your own `{ debug, info, warn, error }` object                                                                                     |

The SDK is **silent by default** (a no-op logger), so if you were relying on
`console.*` output from SDK internals, opt in explicitly:

```ts
import { RpcService, resolveNetworkConfig, ConsoleLogger } from '@tikka/sdk';

const rpc = new RpcService(
  resolveNetworkConfig('testnet'),
  undefined, // rpcConfig
  new ConsoleLogger(), // logger
);
```

Details and wiring your own logger (pino, winston) are in
[`sdk/docs/LOGGER.md`](../../sdk/docs/LOGGER.md).

---

## 10. Migration checklist

- [ ] Node is on 22 or newer.
- [ ] `@stellar/stellar-sdk` in your app is aligned to `^16.1.0`, or the `pnpm.overrides` pin is in place — no dual copies.
- [ ] `@stellar/stellar-base` removed from your dependencies if you were importing it directly.
- [ ] Network config resolved with `resolveNetworkConfig()` instead of hand-rolled URL/passphrase constants.
- [ ] `RpcService` / `HorizonService` constructed once and injected into `ContractService`.
- [ ] Every `contract.call(fn, nativeToScVal(...))` replaced with a domain service, or `simulateReadOnly` / `invoke` with native args.
- [ ] Dummy read accounts (`new Account('GAAA…', '0')`) deleted.
- [ ] String-matching error handling replaced with `TikkaSdkErrorCode`.
- [ ] `formatXlm` / hand-rolled stroops math replaced with `stroopsToXlm` and friends.
- [ ] Unit checks: `RaffleParams.ticketPrice` in XLM, `RaffleParams.endTime` in **milliseconds**, `maxPricePerTicket` in **stroops**.
- [ ] Wallet strategy chosen: built-in adapter, custom `WalletAdapter`, or a kit bridged behind `WalletAdapter`. In every case the wallet signs XDR and nothing more.
- [ ] Jest `transformIgnorePatterns` allow-lists the ESM-only deps (`@noble/*`, `uint8array-extras`, `@scure/*`, `base32.js`).
- [ ] Tests use `MockWalletAdapter` / `MockRpcService`.

---

## Related documentation

- [`sdk/README.md`](../../sdk/README.md) — entry points, browser/Node support matrix, bundle budgets, wallet adapter reference
- [`WALLET_ADAPTERS.md`](../WALLET_ADAPTERS.md) — the full `WalletAdapter` contract, per-wallet setup, conformance suite
- [`sdk/docs/LOGGER.md`](../../sdk/docs/LOGGER.md) — routing SDK logs into your own logger
- [`sdk/DEPRECATION.md`](../../sdk/DEPRECATION.md) — deprecation policy and the committed `etc/*.api.md` API surface reports
- [`sdk/examples/`](../../sdk/examples/) — runnable quickstart, buy-tickets, offline-signing, and custom-wallet samples
- [Generated API reference](https://crackedstudio.github.io/tikka) — full TypeDoc output
