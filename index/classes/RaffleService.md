[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / RaffleService

# Class: RaffleService

Defined in: [modules/raffle/raffle.service.ts:43](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/modules/raffle/raffle.service.ts#L43)

RaffleService — high-level API for raffle lifecycle operations.

Write methods (create, cancel) require a WalletAdapter to be set on the
ContractService. Read methods (get, listActive, listAll) are free (simulate).

## Constructors

### Constructor

> **new RaffleService**(`contract`, `feeEstimator`): `RaffleService`

Defined in: [modules/raffle/raffle.service.ts:44](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/modules/raffle/raffle.service.ts#L44)

#### Parameters

##### contract

[`ContractService`](../../index.write/classes/ContractService.md)

##### feeEstimator

[`FeeEstimatorService`](FeeEstimatorService.md)

#### Returns

`RaffleService`

## Methods

### cancel()

> **cancel**(`params`): `Promise`\<[`TxResponse`](../type-aliases/TxResponse.md)\<`void`\>\>

Defined in: [modules/raffle/raffle.service.ts:171](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/modules/raffle/raffle.service.ts#L171)

Cancels an OPEN raffle (must be the raffle creator).
Throws `RaffleStateError` if the raffle is not in the Open state.

#### Parameters

##### params

[`CancelRaffleParams`](../interfaces/CancelRaffleParams.md)

#### Returns

`Promise`\<[`TxResponse`](../type-aliases/TxResponse.md)\<`void`\>\>

***

### create()

> **create**(`params`): `Promise`\<`RaffleTxResponse`\<`number`\>\>

Defined in: [modules/raffle/raffle.service.ts:76](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/modules/raffle/raffle.service.ts#L76)

Creates a new raffle on-chain.

`params.asset` accepts either a plain code string ("XLM") for backwards
compatibility, or a structured `{ code, issuer? }` descriptor for non-native
SEP-41 tokens such as USDC or yXLM.

#### Parameters

##### params

[`RaffleParams`](../interfaces/RaffleParams.md)

#### Returns

`Promise`\<`RaffleTxResponse`\<`number`\>\>

The on-chain raffle ID, transaction hash, and ledger.

***

### estimateCreate()

> **estimateCreate**(`params`): `Promise`\<[`CreateRaffleEstimate`](../interfaces/CreateRaffleEstimate.md)\>

Defined in: [modules/raffle/raffle.service.ts:57](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/modules/raffle/raffle.service.ts#L57)

Pre-confirmation fee preview for raffle creation.
Simulates the transaction via [FeeEstimatorService](FeeEstimatorService.md) without submitting.

#### Parameters

##### params

[`RaffleParams`](../interfaces/RaffleParams.md)

#### Returns

`Promise`\<[`CreateRaffleEstimate`](../interfaces/CreateRaffleEstimate.md)\>

***

### get()

> **get**(`raffleId`): `Promise`\<`RaffleTxResponse`\<[`RaffleData`](../interfaces/RaffleData.md)\>\>

Defined in: [modules/raffle/raffle.service.ts:119](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/modules/raffle/raffle.service.ts#L119)

Fetches on-chain data for a single raffle (read-only).

#### Parameters

##### raffleId

`number`

#### Returns

`Promise`\<`RaffleTxResponse`\<[`RaffleData`](../interfaces/RaffleData.md)\>\>

***

### getWinner()

> **getWinner**(`raffleId`): `Promise`\<[`ContractResponse`](../../index.read/interfaces/ContractResponse.md)\<[`WinnerResult`](../interfaces/WinnerResult.md) \| `null`\>\>

Defined in: [modules/raffle/raffle.service.ts:232](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/modules/raffle/raffle.service.ts#L232)

Reads the winner of a finalized raffle (read-only).
Returns `undefined` fields when the raffle has not yet been finalized.

Source of truth: contract RPC (`get_raffle_data`).

#### Parameters

##### raffleId

`number`

#### Returns

`Promise`\<[`ContractResponse`](../../index.read/interfaces/ContractResponse.md)\<[`WinnerResult`](../interfaces/WinnerResult.md) \| `null`\>\>

***

### listActive()

> **listActive**(): `Promise`\<`RaffleTxResponse`\<`number`[]\>\>

Defined in: [modules/raffle/raffle.service.ts:142](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/modules/raffle/raffle.service.ts#L142)

Returns IDs of all currently active (OPEN) raffles.

#### Returns

`Promise`\<`RaffleTxResponse`\<`number`[]\>\>

***

### listAll()

> **listAll**(): `Promise`\<`RaffleTxResponse`\<`number`[]\>\>

Defined in: [modules/raffle/raffle.service.ts:156](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/modules/raffle/raffle.service.ts#L156)

Returns IDs of all raffles (any state).

#### Returns

`Promise`\<`RaffleTxResponse`\<`number`[]\>\>

***

### triggerDraw()

> **triggerDraw**(`params`): `Promise`\<[`ContractResponse`](../../index.read/interfaces/ContractResponse.md)\<[`TriggerDrawResult`](../interfaces/TriggerDrawResult.md)\>\>

Defined in: [modules/raffle/raffle.service.ts:201](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/modules/raffle/raffle.service.ts#L201)

Initiates the randomness request for a raffle that has reached its
end time or sold out. Transitions the raffle from `Open` → `Drawing`.

Requires the caller to be authorised (oracle or protocol admin).
Throws `RaffleStateError` if the raffle is not currently Open.

#### Parameters

##### params

[`TriggerDrawParams`](../interfaces/TriggerDrawParams.md)

#### Returns

`Promise`\<[`ContractResponse`](../../index.read/interfaces/ContractResponse.md)\<[`TriggerDrawResult`](../interfaces/TriggerDrawResult.md)\>\>
