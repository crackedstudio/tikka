[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / toTypedSdkError

# Function: toTypedSdkError()

> **toTypedSdkError**(`err`): [`TikkaSdkError`](../classes/TikkaSdkError.md)

Defined in: [utils/errors.ts:332](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/utils/errors.ts#L332)

Upgrades a generic caught error into the most specific `TikkaSdkError`
subtype possible. If `err` is already a `TikkaSdkError` with code
`ContractError` and a string `cause` containing a recognizable Soroban
error code, it is converted into the matching typed error. Otherwise the
error is returned unchanged (if already a `TikkaSdkError`) or wrapped.

## Parameters

### err

`unknown`

## Returns

[`TikkaSdkError`](../classes/TikkaSdkError.md)
