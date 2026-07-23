[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / TikkaSdkError

# Class: TikkaSdkError

Defined in: [utils/errors.ts:87](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/utils/errors.ts#L87)

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
- [`RaffleNotFoundError`](RaffleNotFoundError.md)
- [`RaffleEndedError`](RaffleEndedError.md)
- [`RaffleFullError`](RaffleFullError.md)
- [`InsufficientFundsError`](InsufficientFundsError.md)
- [`UnauthorizedError`](UnauthorizedError.md)

## Constructors

### Constructor

> **new TikkaSdkError**(`code`, `message`, `cause?`): `TikkaSdkError`

Defined in: [utils/errors.ts:88](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/utils/errors.ts#L88)

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

Defined in: [utils/errors.ts:103](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/utils/errors.ts#L103)

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

Defined in: [utils/errors.ts:91](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/utils/errors.ts#L91)

***

### code

> `readonly` **code**: [`TikkaSdkErrorCode`](../enumerations/TikkaSdkErrorCode.md)

Defined in: [utils/errors.ts:89](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/utils/errors.ts#L89)
