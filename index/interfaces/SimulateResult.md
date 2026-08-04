[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / SimulateResult

# Interface: SimulateResult\<T\>

Defined in: [contract/lifecycle.ts:53](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/contract/lifecycle.ts#L53)

Successful simulation result — everything needed to decide whether to sign.

## Type Parameters

### T

`T` = `unknown`

## Properties

### assembledXdr

> **assembledXdr**: `string`

Defined in: [contract/lifecycle.ts:59](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/contract/lifecycle.ts#L59)

Assembled (fee-bumped + auth-populated) transaction XDR, ready to sign.

***

### minResourceFee

> **minResourceFee**: `string`

Defined in: [contract/lifecycle.ts:57](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/contract/lifecycle.ts#L57)

Minimum resource fee in stroops, as a string.

***

### networkPassphrase

> **networkPassphrase**: `string`

Defined in: [contract/lifecycle.ts:61](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/contract/lifecycle.ts#L61)

Network passphrase — must be passed to the wallet so it signs the right network.

***

### returnValue

> **returnValue**: `T` \| `null`

Defined in: [contract/lifecycle.ts:55](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/contract/lifecycle.ts#L55)

Decoded return value of the simulated call (null for void functions).
