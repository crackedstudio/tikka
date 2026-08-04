[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / RpcTimeoutError

# Class: RpcTimeoutError

Defined in: [utils/errors.ts:118](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/utils/errors.ts#L118)

Thrown when an RPC request times out.

## Extends

- [`TikkaSdkError`](TikkaSdkError.md)

## Constructors

### Constructor

> **new RpcTimeoutError**(`message`, `cause?`): `RpcTimeoutError`

Defined in: [utils/errors.ts:119](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/utils/errors.ts#L119)

#### Parameters

##### message

`string`

##### cause?

`unknown`

#### Returns

`RpcTimeoutError`

#### Overrides

[`TikkaSdkError`](TikkaSdkError.md).[`constructor`](TikkaSdkError.md#constructor)

## Methods

### wrap()

> `static` **wrap**(`error`, `defaultCode?`): [`TikkaSdkError`](TikkaSdkError.md)

Defined in: [utils/errors.ts:107](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/utils/errors.ts#L107)

Static helper to wrap unknown errors into TikkaSdkError.
Useful in service-level catch blocks.

#### Parameters

##### error

`unknown`

##### defaultCode?

[`TikkaSdkErrorCode`](../enumerations/TikkaSdkErrorCode.md) = `TikkaSdkErrorCode.Unknown`

#### Returns

[`TikkaSdkError`](TikkaSdkError.md)

#### Inherited from

[`TikkaSdkError`](TikkaSdkError.md).[`wrap`](TikkaSdkError.md#wrap)

## Properties

### cause?

> `readonly` `optional` **cause?**: `unknown`

Defined in: [utils/errors.ts:95](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/utils/errors.ts#L95)

#### Inherited from

[`TikkaSdkError`](TikkaSdkError.md).[`cause`](TikkaSdkError.md#cause)

***

### code

> `readonly` **code**: [`TikkaSdkErrorCode`](../enumerations/TikkaSdkErrorCode.md)

Defined in: [utils/errors.ts:93](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/utils/errors.ts#L93)

#### Inherited from

[`TikkaSdkError`](TikkaSdkError.md).[`code`](TikkaSdkError.md#code)
