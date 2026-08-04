[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / parseSorobanContractErrorCode

# Function: parseSorobanContractErrorCode()

> **parseSorobanContractErrorCode**(`raw`): `number` \| `undefined`

Defined in: [utils/errors.ts:289](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/utils/errors.ts#L289)

Extracts a numeric Soroban contract error code from a raw error string.
Recognizes the common formats surfaced by the Stellar RPC / SDK:
  - "Error(Contract, #35)"
  - "ScError::Contract(4)"
  - "contract error code 5"

## Parameters

### raw

`string` \| `null` \| `undefined`

## Returns

`number` \| `undefined`

the parsed code, or `undefined` if no recognizable pattern is found.
