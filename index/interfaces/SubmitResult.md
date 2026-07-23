[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / SubmitResult

# Interface: SubmitResult\<T\>

Defined in: [contract/lifecycle.ts:63](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/contract/lifecycle.ts#L63)

Result returned after a transaction is confirmed on-chain.

## Type Parameters

### T

`T` = `unknown`

## Properties

### ledger

> **ledger**: `number`

Defined in: [contract/lifecycle.ts:69](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/contract/lifecycle.ts#L69)

Ledger sequence in which the transaction was included.

***

### resultXdr?

> `optional` **resultXdr?**: `string`

Defined in: [contract/lifecycle.ts:71](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/contract/lifecycle.ts#L71)

Base64-encoded transaction result XDR (safe to surface in responses).

***

### returnValue

> **returnValue**: `T` \| `null`

Defined in: [contract/lifecycle.ts:65](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/contract/lifecycle.ts#L65)

Decoded on-chain return value (may differ from simulation if contract state changed).

***

### txHash

> **txHash**: `string`

Defined in: [contract/lifecycle.ts:67](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/contract/lifecycle.ts#L67)

Transaction hash.
