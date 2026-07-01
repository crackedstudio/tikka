[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / InvalidResponseError

# Class: InvalidResponseError

Defined in: [utils/errors.ts:137](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/utils/errors.ts#L137)

Thrown when the response format is invalid or cannot be parsed.

## Extends

- [`TikkaSdkError`](TikkaSdkError.md)

## Constructors

### Constructor

> **new InvalidResponseError**(`message`, `cause?`): `InvalidResponseError`

Defined in: [utils/errors.ts:138](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/utils/errors.ts#L138)

#### Parameters

##### message

`string`

##### cause?

`unknown`

#### Returns

`InvalidResponseError`

#### Overrides

[`TikkaSdkError`](TikkaSdkError.md).[`constructor`](TikkaSdkError.md#constructor)

## Methods

### wrap()

> `static` **wrap**(`error`, `defaultCode?`): [`TikkaSdkError`](TikkaSdkError.md)

Defined in: [utils/errors.ts:93](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/utils/errors.ts#L93)

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

Defined in: [utils/errors.ts:81](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/utils/errors.ts#L81)

#### Inherited from

[`TikkaSdkError`](TikkaSdkError.md).[`cause`](TikkaSdkError.md#cause)

***

### code

> `readonly` **code**: [`TikkaSdkErrorCode`](../enumerations/TikkaSdkErrorCode.md)

Defined in: [utils/errors.ts:79](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/utils/errors.ts#L79)

#### Inherited from

[`TikkaSdkError`](TikkaSdkError.md).[`code`](TikkaSdkError.md#code)
