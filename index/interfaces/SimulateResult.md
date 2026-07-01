[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / SimulateResult

# Interface: SimulateResult\<T\>

Defined in: [contract/lifecycle.ts:51](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/contract/lifecycle.ts#L51)

Successful simulation result — everything needed to decide whether to sign.

## Type Parameters

### T

`T` = `unknown`

## Properties

### assembledXdr

> **assembledXdr**: `string`

Defined in: [contract/lifecycle.ts:57](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/contract/lifecycle.ts#L57)

Assembled (fee-bumped + auth-populated) transaction XDR, ready to sign.

***

### minResourceFee

> **minResourceFee**: `string`

Defined in: [contract/lifecycle.ts:55](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/contract/lifecycle.ts#L55)

Minimum resource fee in stroops, as a string.

***

### networkPassphrase

> **networkPassphrase**: `string`

Defined in: [contract/lifecycle.ts:59](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/contract/lifecycle.ts#L59)

Network passphrase — must be passed to the wallet so it signs the right network.

***

### returnValue

> **returnValue**: `T` \| `null`

Defined in: [contract/lifecycle.ts:53](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/contract/lifecycle.ts#L53)

Decoded return value of the simulated call (null for void functions).
