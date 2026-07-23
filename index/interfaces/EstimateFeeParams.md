[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / EstimateFeeParams

# Interface: EstimateFeeParams

Defined in: [fee-estimator/fee-estimator.types.ts:151](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/fee-estimator/fee-estimator.types.ts#L151)

Input parameters for `FeeEstimatorService.estimateFee()`.

## Extended by

- [`GetFeeQuoteParams`](GetFeeQuoteParams.md)

## Properties

### method

> **method**: `string`

Defined in: [fee-estimator/fee-estimator.types.ts:156](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/fee-estimator/fee-estimator.types.ts#L156)

Name of the contract function to invoke (e.g. `ContractFn.BUY_TICKET`).
Accepts any string so callers can pass raw function names.

***

### params

> **params**: `any`[]

Defined in: [fee-estimator/fee-estimator.types.ts:163](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/fee-estimator/fee-estimator.types.ts#L163)

Arguments to pass to the contract function.
Accepts the same types as `ContractService.invoke` — raw JS values,
`xdr.ScVal` instances, or Stellar public keys (56-char G-strings).

***

### sourcePublicKey?

> `optional` **sourcePublicKey?**: `string`

Defined in: [fee-estimator/fee-estimator.types.ts:171](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/fee-estimator/fee-estimator.types.ts#L171)

Optional Stellar public key to use as the transaction source.
When omitted the connected wallet's public key is used, and if no
wallet is set a well-known zero-balance key is substituted so the
simulation still runs (read-path estimation).
