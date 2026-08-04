[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / TikkaSdkError

# Class: TikkaSdkError

Defined in: [utils/errors.ts:91](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/utils/errors.ts#L91)

Structured SDK error (high-level, used across SDK)
Allows consumers to handle failures predictably.

## Extends

- `Error`

## Extended by

- [`InvalidTicketPurchaseError`](InvalidTicketPurchaseError.md)
- [`RpcTimeoutError`](RpcTimeoutError.md)
- [`RateLimitError`](RateLimitError.md)
- [`UnavailableError`](UnavailableError.md)
- [`InvalidResponseError`](InvalidResponseError.md)
- [`ContractFailureError`](ContractFailureError.md)
- [`NetworkError`](NetworkError.md)
- [`TransactionRejectedError`](TransactionRejectedError.md)
- [`AuthError`](AuthError.md)
- [`RaffleNotFoundError`](RaffleNotFoundError.md)
- [`RaffleEndedError`](RaffleEndedError.md)
- [`RaffleFullError`](RaffleFullError.md)
- [`InsufficientFundsError`](InsufficientFundsError.md)
- [`UnauthorizedError`](UnauthorizedError.md)

## Constructors

### Constructor

> **new TikkaSdkError**(`code`, `message`, `cause?`): `TikkaSdkError`

Defined in: [utils/errors.ts:92](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/utils/errors.ts#L92)

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

Defined in: [utils/errors.ts:107](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/utils/errors.ts#L107)

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

Defined in: [utils/errors.ts:95](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/utils/errors.ts#L95)

***

### code

> `readonly` **code**: [`TikkaSdkErrorCode`](../enumerations/TikkaSdkErrorCode.md)

Defined in: [utils/errors.ts:93](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/utils/errors.ts#L93)
