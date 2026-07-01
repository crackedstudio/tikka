[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / RpcError

# Class: RpcError

Defined in: [utils/errors.ts:4](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/utils/errors.ts#L4)

Low-level RPC error (transport / HTTP / JSON-RPC failures)

## Extends

- `Error`

## Constructors

### Constructor

> **new RpcError**(`message`, `endpoint`, `method?`, `statusCode?`, `response?`): `RpcError`

Defined in: [utils/errors.ts:5](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/utils/errors.ts#L5)

#### Parameters

##### message

`string`

##### endpoint

`string`

##### method?

`string`

##### statusCode?

`number`

##### response?

`any`

#### Returns

`RpcError`

#### Overrides

`Error.constructor`

## Methods

### fromResponse()

> `static` **fromResponse**(`endpoint`, `method`, `response`, `payload?`): `RpcError`

Defined in: [utils/errors.ts:17](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/utils/errors.ts#L17)

#### Parameters

##### endpoint

`string`

##### method

`string`

##### response

`any`

##### payload?

`any`

#### Returns

`RpcError`

## Properties

### endpoint

> `readonly` **endpoint**: `string`

Defined in: [utils/errors.ts:7](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/utils/errors.ts#L7)

***

### method?

> `readonly` `optional` **method?**: `string`

Defined in: [utils/errors.ts:8](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/utils/errors.ts#L8)

***

### response?

> `readonly` `optional` **response?**: `any`

Defined in: [utils/errors.ts:10](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/utils/errors.ts#L10)

***

### statusCode?

> `readonly` `optional` **statusCode?**: `number`

Defined in: [utils/errors.ts:9](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/utils/errors.ts#L9)
