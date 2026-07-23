[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / toTypedContractError

# Function: toTypedContractError()

> **toTypedContractError**(`message`, `rawError`): [`TikkaSdkError`](../classes/TikkaSdkError.md) \| `null`

Defined in: [utils/errors.ts:278](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/utils/errors.ts#L278)

Attempts to convert a raw contract failure (message + raw error/XDR string)
into a typed SDK error based on the embedded Soroban contract error code.

## Parameters

### message

`string`

Human-readable message to attach to the typed error.

### rawError

`string`

Raw error string (e.g. simulation error or resultXdr) to parse.

## Returns

[`TikkaSdkError`](../classes/TikkaSdkError.md) \| `null`

a typed `TikkaSdkError` subclass instance, or `null` if the code
         is unrecognized (callers should fall back to a generic error).
