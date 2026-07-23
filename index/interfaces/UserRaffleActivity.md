[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / UserRaffleActivity

# Interface: UserRaffleActivity

Defined in: [modules/user/user.types.ts:54](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/modules/user/user.types.ts#L54)

Summary of the user's activity in a specific raffle.

## Properties

### isCreator

> **isCreator**: `boolean`

Defined in: [modules/user/user.types.ts:62](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/modules/user/user.types.ts#L62)

True when this user is the raffle creator.

#### Source

contract

***

### isWinner

> **isWinner**: `boolean`

Defined in: [modules/user/user.types.ts:64](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/modules/user/user.types.ts#L64)

True when this user won the raffle.

#### Source

contract

***

### prizeAmount?

> `optional` **prizeAmount?**: `string`

Defined in: [modules/user/user.types.ts:66](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/modules/user/user.types.ts#L66)

Prize amount in the raffle asset, only set when isWinner.

#### Source

contract

***

### raffleId

> **raffleId**: `number`

Defined in: [modules/user/user.types.ts:56](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/modules/user/user.types.ts#L56)

#### Source

contract

***

### status

> **status**: [`RaffleStatus`](../enumerations/RaffleStatus.md)

Defined in: [modules/user/user.types.ts:58](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/modules/user/user.types.ts#L58)

#### Source

contract

***

### ticketIds

> **ticketIds**: `number`[]

Defined in: [modules/user/user.types.ts:60](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/modules/user/user.types.ts#L60)

Tickets held by this user in this raffle.

#### Source

contract
