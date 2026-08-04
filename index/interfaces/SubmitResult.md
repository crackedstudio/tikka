[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / SubmitResult

# Interface: SubmitResult\<T\>

Defined in: [contract/lifecycle.ts:65](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/contract/lifecycle.ts#L65)

Result returned after a transaction is confirmed on-chain.

## Type Parameters

### T

`T` = `unknown`

## Properties

### ledger

> **ledger**: `number`

Defined in: [contract/lifecycle.ts:71](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/contract/lifecycle.ts#L71)

Ledger sequence in which the transaction was included.

***

### resultXdr?

> `optional` **resultXdr?**: `string`

Defined in: [contract/lifecycle.ts:73](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/contract/lifecycle.ts#L73)

Base64-encoded transaction result XDR (safe to surface in responses).

***

### returnValue

> **returnValue**: `T` \| `null`

Defined in: [contract/lifecycle.ts:67](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/contract/lifecycle.ts#L67)

Decoded on-chain return value (may differ from simulation if contract state changed).

***

### txHash

> **txHash**: `string`

Defined in: [contract/lifecycle.ts:69](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/contract/lifecycle.ts#L69)

Transaction hash.
