[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index.read](../README.md) / ReadOnlyRaffleService

# Class: ReadOnlyRaffleService

Defined in: [modules/raffle/raffle.read.service.ts:24](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/modules/raffle/raffle.read.service.ts#L24)

Read-only raffle queries — no wallet or signing dependencies required.
Suitable for public dashboards and SSR pages.

## Constructors

### Constructor

> **new ReadOnlyRaffleService**(`rpcService`, `networkConfig`): `ReadOnlyRaffleService`

Defined in: [modules/raffle/raffle.read.service.ts:27](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/modules/raffle/raffle.read.service.ts#L27)

#### Parameters

##### rpcService

[`RpcService`](../../index/classes/RpcService.md)

##### networkConfig

[`NetworkConfig`](../../index/interfaces/NetworkConfig.md)

#### Returns

`ReadOnlyRaffleService`

## Methods

### getAll()

> **getAll**(): `Promise`\<[`ContractResponse`](../interfaces/ContractResponse.md)\<`number`[]\>\>

Defined in: [modules/raffle/raffle.read.service.ts:41](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/modules/raffle/raffle.read.service.ts#L41)

Return IDs of all raffles (any state). Alias for `listAll`.

#### Returns

`Promise`\<[`ContractResponse`](../interfaces/ContractResponse.md)\<`number`[]\>\>

***

### getById()

> **getById**(`raffleId`): `Promise`\<[`ContractResponse`](../interfaces/ContractResponse.md)\<[`RaffleData`](../../index/interfaces/RaffleData.md)\>\>

Defined in: [modules/raffle/raffle.read.service.ts:35](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/modules/raffle/raffle.read.service.ts#L35)

Fetch on-chain data for a single raffle by ID. Alias for `get`.

#### Parameters

##### raffleId

`number`

#### Returns

`Promise`\<[`ContractResponse`](../interfaces/ContractResponse.md)\<[`RaffleData`](../../index/interfaces/RaffleData.md)\>\>
