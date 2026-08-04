[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / InvalidTicketPurchaseError

# Class: InvalidTicketPurchaseError

Defined in: [modules/ticket/purchase-validation.ts:16](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/modules/ticket/purchase-validation.ts#L16)

Typed validation error for ticket purchase inputs.
Thrown at the module boundary before any network call or tx build.

## Extends

- [`TikkaSdkError`](TikkaSdkError.md)

## Constructors

### Constructor

> **new InvalidTicketPurchaseError**(`field`, `message`, `cause?`): `InvalidTicketPurchaseError`

Defined in: [modules/ticket/purchase-validation.ts:17](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/modules/ticket/purchase-validation.ts#L17)

#### Parameters

##### field

[`TicketPurchaseField`](../type-aliases/TicketPurchaseField.md)

##### message

`string`

##### cause?

`unknown`

#### Returns

`InvalidTicketPurchaseError`

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

***

### field

> `readonly` **field**: [`TicketPurchaseField`](../type-aliases/TicketPurchaseField.md)

Defined in: [modules/ticket/purchase-validation.ts:18](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/modules/ticket/purchase-validation.ts#L18)
