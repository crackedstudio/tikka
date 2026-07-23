[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / GetFeeQuoteParams

# Interface: GetFeeQuoteParams

Defined in: [fee-estimator/fee-estimator.types.ts:60](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/fee-estimator/fee-estimator.types.ts#L60)

Options accepted by `FeeEstimatorService.getFeeQuote()`.

## Extends

- [`EstimateFeeParams`](EstimateFeeParams.md)

## Properties

### maxFeeStroops?

> `optional` **maxFeeStroops?**: `string`

Defined in: [fee-estimator/fee-estimator.types.ts:65](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/fee-estimator/fee-estimator.types.ts#L65)

Hard ceiling in stroops. If the estimated fee exceeds this value a
`MAX_FEE_EXCEEDED` warning is added and confidence is downgraded to `low`.

***

### method

> **method**: `string`

Defined in: [fee-estimator/fee-estimator.types.ts:156](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/fee-estimator/fee-estimator.types.ts#L156)

Name of the contract function to invoke (e.g. `ContractFn.BUY_TICKET`).
Accepts any string so callers can pass raw function names.

#### Inherited from

[`EstimateFeeParams`](EstimateFeeParams.md).[`method`](EstimateFeeParams.md#method)

***

### params

> **params**: `any`[]

Defined in: [fee-estimator/fee-estimator.types.ts:163](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/fee-estimator/fee-estimator.types.ts#L163)

Arguments to pass to the contract function.
Accepts the same types as `ContractService.invoke` — raw JS values,
`xdr.ScVal` instances, or Stellar public keys (56-char G-strings).

#### Inherited from

[`EstimateFeeParams`](EstimateFeeParams.md).[`params`](EstimateFeeParams.md#params)

***

### sourcePublicKey?

> `optional` **sourcePublicKey?**: `string`

Defined in: [fee-estimator/fee-estimator.types.ts:171](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/fee-estimator/fee-estimator.types.ts#L171)

Optional Stellar public key to use as the transaction source.
When omitted the connected wallet's public key is used, and if no
wallet is set a well-known zero-balance key is substituted so the
simulation still runs (read-path estimation).

#### Inherited from

[`EstimateFeeParams`](EstimateFeeParams.md).[`sourcePublicKey`](EstimateFeeParams.md#sourcepublickey)

***

### staleAfterMs?

> `optional` **staleAfterMs?**: `number`

Defined in: [fee-estimator/fee-estimator.types.ts:70](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/fee-estimator/fee-estimator.types.ts#L70)

How long (ms) a simulation-derived quote remains `high`-confidence.
Defaults to 30 000 ms (30 s).
