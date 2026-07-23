[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / FeeEstimatorService

# Class: FeeEstimatorService

Defined in: [fee-estimator/fee-estimator.service.ts:89](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/fee-estimator/fee-estimator.service.ts#L89)

FeeEstimatorService

Estimates the XLM cost of invoking a Tikka contract function **before** the
user is asked to sign anything. It uses `simulateTransaction` (a read-only
Soroban RPC call) and parses the returned fee fields.

## Fee model

Every Soroban transaction pays two fee components:

| Component        | Description                                               |
|------------------|-----------------------------------------------------------|
| **Base fee**     | Fixed 100-stroop validator tip; always charged            |
| **Resource fee** | Variable: CPU instructions + memory + ledger I/O + size  |

`totalFee = baseFee + minResourceFee`

All amounts are surfaced both as raw stroops strings and as human-readable
7-decimal XLM strings.

## Usage

```ts
const estimate = await feeEstimator.estimateFee({
  method: ContractFn.BUY_TICKET,
  params: [raffleId, buyerPublicKey, quantity],
});

console.log(`Estimated fee: ${estimate.xlm} XLM`);
console.log(`CPU instructions: ${estimate.resources.cpuInstructions}`);
```

Re-call `estimateFee` with updated params whenever user inputs change —
the estimate refreshes because it re-runs `simulateTransaction`.

## Constructors

### Constructor

> **new FeeEstimatorService**(`rpcService`, `horizon`, `networkConfig`, `wallet?`): `FeeEstimatorService`

Defined in: [fee-estimator/fee-estimator.service.ts:92](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/fee-estimator/fee-estimator.service.ts#L92)

#### Parameters

##### rpcService

[`RpcService`](RpcService.md)

##### horizon

[`HorizonService`](HorizonService.md)

##### networkConfig

[`NetworkConfig`](../interfaces/NetworkConfig.md)

##### wallet?

[`WalletAdapter`](WalletAdapter.md)

#### Returns

`FeeEstimatorService`

## Methods

### estimate()

> **estimate**(`tx`): `Promise`\<[`FeeEstimateResult`](../interfaces/FeeEstimateResult.md)\>

Defined in: [fee-estimator/fee-estimator.service.ts:136](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/fee-estimator/fee-estimator.service.ts#L136)

Estimates the transaction fee by simulating a pre-built unsigned transaction.

Call after assembling contract params when the caller owns transaction construction.
Used by write flows that simulate first, then surface the fee before signing.

#### Parameters

##### tx

`Transaction`

#### Returns

`Promise`\<[`FeeEstimateResult`](../interfaces/FeeEstimateResult.md)\>

***

### estimateFee()

> **estimateFee**(`params`): `Promise`\<[`FeeEstimateResult`](../interfaces/FeeEstimateResult.md)\>

Defined in: [fee-estimator/fee-estimator.service.ts:122](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/fee-estimator/fee-estimator.service.ts#L122)

Estimates the transaction fee for a contract invocation.

Runs `simulateTransaction` against the Soroban RPC and parses:
- `minResourceFee` — total resource charge in stroops
- `cost.cpuInstructions` — CPU consumption
- `cost.memBytes` — memory consumption
- `stateChanges` — ledger entry read/write count

#### Parameters

##### params

[`EstimateFeeParams`](../interfaces/EstimateFeeParams.md)

Method name, contract arguments, and optional source key.

#### Returns

`Promise`\<[`FeeEstimateResult`](../interfaces/FeeEstimateResult.md)\>

`FeeEstimateResult` with `xlm`, `stroops`, and `resources` breakdown.

#### Throws

`TikkaSdkError` with `SimulationFailed` if the simulation errors.

***

### estimateFromResourceFee()

> **estimateFromResourceFee**(`minResourceFee`): [`FeeEstimateResult`](../interfaces/FeeEstimateResult.md)

Defined in: [fee-estimator/fee-estimator.service.ts:166](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/fee-estimator/fee-estimator.service.ts#L166)

Derives a fee estimate from a simulation's `minResourceFee` stroops value.
Used after ContractService.simulate when the raw RPC response is unavailable.

#### Parameters

##### minResourceFee

`string`

#### Returns

[`FeeEstimateResult`](../interfaces/FeeEstimateResult.md)

***

### estimateFromSimulation()

> **estimateFromSimulation**(`sim`): [`FeeEstimateResult`](../interfaces/FeeEstimateResult.md)

Defined in: [fee-estimator/fee-estimator.service.ts:156](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/fee-estimator/fee-estimator.service.ts#L156)

Derives a fee estimate from an already-completed simulation response.
Avoids a second RPC round-trip when the caller has just simulated the tx.

#### Parameters

##### sim

`SimulateTransactionSuccessResponse`

#### Returns

[`FeeEstimateResult`](../interfaces/FeeEstimateResult.md)

***

### getFeeQuote()

> **getFeeQuote**(`params`): `Promise`\<[`FeeQuote`](../interfaces/FeeQuote.md)\>

Defined in: [fee-estimator/fee-estimator.service.ts:301](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/fee-estimator/fee-estimator.service.ts#L301)

Returns a reusable, typed `FeeQuote` that includes source, confidence,
expiry, and any user-visible warnings.

Behaviour:
- Attempts a live `simulateTransaction` (source = `simulation`, confidence = `high`)
- On simulation failure falls back to a static heuristic (source = `fallback`,
  confidence = `low`) so the caller always receives a usable estimate.
- Adds `MAX_FEE_EXCEEDED` warning when the estimate exceeds `maxFeeStroops`.

#### Parameters

##### params

[`GetFeeQuoteParams`](../interfaces/GetFeeQuoteParams.md)

#### Returns

`Promise`\<[`FeeQuote`](../interfaces/FeeQuote.md)\>

#### Example

```ts
const quote = await feeEstimator.getFeeQuote({
  method: ContractFn.BUY_TICKET,
  params: [raffleId, buyerKey, quantity],
  maxFeeStroops: '100000',
});
if (quote.warnings.length) console.warn(quote.warnings.map(w => w.message));
// Pass quote.stroops as the fee ceiling when building the real transaction.
await wallet.signTransaction(tx, { fee: quote.stroops });
```

***

### isQuoteStale()

> **isQuoteStale**(`quote`, `nowMs?`): `boolean`

Defined in: [fee-estimator/fee-estimator.service.ts:376](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/fee-estimator/fee-estimator.service.ts#L376)

Returns whether a previously obtained `FeeQuote` is still within its
validity window.

#### Parameters

##### quote

[`FeeQuote`](../interfaces/FeeQuote.md)

The quote to check.

##### nowMs?

`number` = `...`

Override for the current time (defaults to `Date.now()`).

#### Returns

`boolean`

***

### setContractId()

> **setContractId**(`id`): `void`

Defined in: [fee-estimator/fee-estimator.service.ts:105](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/fee-estimator/fee-estimator.service.ts#L105)

Override the contract ID used for fee estimation.
Useful in tests or when targeting a non-default contract deployment.

#### Parameters

##### id

`string`

#### Returns

`void`
