[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / UserActivitySummary

# Interface: UserActivitySummary

Defined in: [modules/user/user.types.ts:76](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/modules/user/user.types.ts#L76)

Aggregated view of all user activity — raffles, tickets, wins, refunds,
and creator activity — as required by issue #604.

Fields annotated with `@source indexer` require a backend/indexer endpoint
and will be `undefined` when the SDK is used contract-only.

## Properties

### address

> **address**: `string`

Defined in: [modules/user/user.types.ts:78](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/modules/user/user.types.ts#L78)

User's Stellar address.

#### Source

contract

***

### createdRaffleIds

> **createdRaffleIds**: `number`[]

Defined in: [modules/user/user.types.ts:90](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/modules/user/user.types.ts#L90)

IDs of raffles created by this user.

#### Source

contract

***

### raffles

> **raffles**: [`UserRaffleActivity`](UserRaffleActivity.md)[]

Defined in: [modules/user/user.types.ts:81](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/modules/user/user.types.ts#L81)

All raffles the user participated in.

#### Source

contract

***

### refundedTicketIds?

> `optional` **refundedTicketIds?**: `number`[]

Defined in: [modules/user/user.types.ts:96](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/modules/user/user.types.ts#L96)

IDs of tickets that were refunded (raffle cancelled).

#### Source

indexer — requires backend query; undefined when unavailable.

***

### tickets

> **tickets**: [`UserTicket`](UserTicket.md)[]

Defined in: [modules/user/user.types.ts:84](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/modules/user/user.types.ts#L84)

Flat list of all tickets owned.

#### Source

contract

***

### totalRefunded?

> `optional` **totalRefunded?**: `string`

Defined in: [modules/user/user.types.ts:102](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/modules/user/user.types.ts#L102)

Total XLM (or asset) refunded across all refunded tickets.

#### Source

indexer — undefined when unavailable.

***

### totals

> **totals**: `object`

Defined in: [modules/user/user.types.ts:105](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/modules/user/user.types.ts#L105)

Aggregate participation counts.

#### rafflesCreated

> **rafflesCreated**: `number`

#### rafflesEntered

> **rafflesEntered**: `number`

#### rafflesWon

> **rafflesWon**: `number`

#### ticketsBought

> **ticketsBought**: `number`

#### Source

contract

***

### wonRaffleIds

> **wonRaffleIds**: `number`[]

Defined in: [modules/user/user.types.ts:87](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/modules/user/user.types.ts#L87)

IDs of raffles won.

#### Source

contract
