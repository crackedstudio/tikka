[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / HorizonService

# Class: HorizonService

Defined in: [network/horizon.service.ts:10](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/network/horizon.service.ts#L10)

HorizonService
Wrapper around Stellar Horizon SDK for account + network queries.

## Constructors

### Constructor

> **new HorizonService**(`config`): `HorizonService`

Defined in: [network/horizon.service.ts:13](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/network/horizon.service.ts#L13)

#### Parameters

##### config

[`NetworkConfig`](../interfaces/NetworkConfig.md)

#### Returns

`HorizonService`

## Methods

### getBaseFee()

> **getBaseFee**(): `Promise`\<`number`\>

Defined in: [network/horizon.service.ts:30](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/network/horizon.service.ts#L30)

Get current base fee from network

#### Returns

`Promise`\<`number`\>

***

### getFeeStats()

> **getFeeStats**(): `Promise`\<`any`\>

Defined in: [network/horizon.service.ts:36](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/network/horizon.service.ts#L36)

Get full fee stats from network

#### Returns

`Promise`\<`any`\>

***

### getServer()

> **getServer**(): `HorizonServer`

Defined in: [network/horizon.service.ts:20](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/network/horizon.service.ts#L20)

Get raw Horizon server instance (advanced use cases)

#### Returns

`HorizonServer`

***

### loadAccount()

> **loadAccount**(`publicKey`): `Promise`\<`AccountResponse`\>

Defined in: [network/horizon.service.ts:25](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/network/horizon.service.ts#L25)

Load an account (required for building transactions)

#### Parameters

##### publicKey

`string`

#### Returns

`Promise`\<`AccountResponse`\>
