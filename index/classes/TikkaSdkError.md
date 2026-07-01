[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / TikkaSdkError

# Class: TikkaSdkError

Defined in: [utils/errors.ts:77](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/utils/errors.ts#L77)

Structured SDK error (high-level, used across SDK)
Allows consumers to handle failures predictably.

## Extends

- `Error`

## Extended by

- [`RpcTimeoutError`](RpcTimeoutError.md)
- [`RateLimitError`](RateLimitError.md)
- [`UnavailableError`](UnavailableError.md)
- [`InvalidResponseError`](InvalidResponseError.md)
- [`ContractFailureError`](ContractFailureError.md)

## Constructors

### Constructor

> **new TikkaSdkError**(`code`, `message`, `cause?`): `TikkaSdkError`

Defined in: [utils/errors.ts:78](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/utils/errors.ts#L78)

#### Parameters

##### code

[`TikkaSdkErrorCode`](../enumerations/TikkaSdkErrorCode.md)

##### message

`string`

##### cause?

`unknown`

#### Returns

`TikkaSdkError`

#### Overrides

`Error.constructor`

## Methods

### wrap()

> `static` **wrap**(`error`, `defaultCode?`): `TikkaSdkError`

Defined in: [utils/errors.ts:93](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/utils/errors.ts#L93)

Static helper to wrap unknown errors into TikkaSdkError.
Useful in service-level catch blocks.

#### Parameters

##### error

`unknown`

##### defaultCode?

[`TikkaSdkErrorCode`](../enumerations/TikkaSdkErrorCode.md) = `TikkaSdkErrorCode.Unknown`

#### Returns

`TikkaSdkError`

## Properties

### cause?

> `readonly` `optional` **cause?**: `unknown`

Defined in: [utils/errors.ts:81](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/utils/errors.ts#L81)

***

### code

> `readonly` **code**: [`TikkaSdkErrorCode`](../enumerations/TikkaSdkErrorCode.md)

Defined in: [utils/errors.ts:79](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/utils/errors.ts#L79)
