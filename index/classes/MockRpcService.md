[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / MockRpcService

# Class: MockRpcService

Defined in: [network/mock-rpc.service.ts:13](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/network/mock-rpc.service.ts#L13)

## Constructors

### Constructor

> **new MockRpcService**(): `MockRpcService`

#### Returns

`MockRpcService`

## Methods

### configure()

> **configure**(`behavior`): `void`

Defined in: [network/mock-rpc.service.ts:16](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/network/mock-rpc.service.ts#L16)

#### Parameters

##### behavior

[`MockRpcBehavior`](../interfaces/MockRpcBehavior.md)

#### Returns

`void`

***

### getTransaction()

> **getTransaction**(`hash`): `Promise`\<`any`\>

Defined in: [network/mock-rpc.service.ts:39](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/network/mock-rpc.service.ts#L39)

#### Parameters

##### hash

`string`

#### Returns

`Promise`\<`any`\>

***

### sendTransaction()

> **sendTransaction**(`_tx`): `Promise`\<`any`\>

Defined in: [network/mock-rpc.service.ts:28](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/network/mock-rpc.service.ts#L28)

#### Parameters

##### \_tx

`any`

#### Returns

`Promise`\<`any`\>

***

### simulateTransaction()

> **simulateTransaction**(`_tx`): `Promise`\<`any`\>

Defined in: [network/mock-rpc.service.ts:20](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/network/mock-rpc.service.ts#L20)

#### Parameters

##### \_tx

`any`

#### Returns

`Promise`\<`any`\>
