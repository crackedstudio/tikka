[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / UserService

# Class: UserService

Defined in: [modules/user/user.service.ts:42](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/modules/user/user.service.ts#L42)

## Remarks

Service for querying user participation data on the Tikka raffle contract.
Provides read-only access to user participation statistics including
raffle count, ticket purchases, and win history.

## Example

```ts
const userService = app.get(UserService);

// Get user's participation data
const result = await userService.getParticipation({
  address: 'GBIQ4VH3TRO5A72SCCSHV5QZJVUHMFAZVD5K4PIWL3RBQFKBDLPHJ36'
});

if (result.success && result.value) {
  console.log('User participation:');
  console.log(`  - Raffles entered: ${result.value.totalRafflesEntered}`);
  console.log(`  - Tickets bought: ${result.value.totalTicketsBought}`);
  console.log(`  - Raffles won: ${result.value.totalRafflesWon}`);
  console.log(`  - Raffle IDs: ${result.value.raffleIds.join(', ')}`);
}
```

## Constructors

### Constructor

> **new UserService**(`contractService`): `UserService`

Defined in: [modules/user/user.service.ts:43](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/modules/user/user.service.ts#L43)

#### Parameters

##### contractService

[`ContractService`](../../index.write/classes/ContractService.md)

#### Returns

`UserService`

## Methods

### getActivitySummary()

> **getActivitySummary**(`params`): `Promise`\<[`ContractResponse`](../../index.read/interfaces/ContractResponse.md)\<[`UserActivitySummary`](../interfaces/UserActivitySummary.md)\>\>

Defined in: [modules/user/user.service.ts:151](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/modules/user/user.service.ts#L151)

Builds an aggregated `UserActivitySummary` from contract data.

Aggregates raffles entered, tickets owned, wins, and creator activity
entirely from contract RPC calls. Pass `includeIndexerData: true` to
additionally annotate tickets with `purchasedAt` timestamps from an
indexer (not yet wired — currently returns undefined for indexer fields).

Source-of-truth per field:
- `raffles`, `tickets`, `wonRaffleIds`, `createdRaffleIds`, `totals`
  → contract RPC (simulateReadOnly)
- `refundedTicketIds`, `totalRefunded`, `tickets[].purchasedAt`
  → indexer/backend (undefined until indexer integration is wired)

#### Parameters

##### params

[`GetUserActivityParams`](../interfaces/GetUserActivityParams.md)

#### Returns

`Promise`\<[`ContractResponse`](../../index.read/interfaces/ContractResponse.md)\<[`UserActivitySummary`](../interfaces/UserActivitySummary.md)\>\>

#### Source

contract (indexer fields are undefined until wired)

***

### getParticipation()

> **getParticipation**(`params`): `Promise`\<[`ContractResponse`](../../index.read/interfaces/ContractResponse.md)\<[`UserParticipation`](../interfaces/UserParticipation.md)\>\>

Defined in: [modules/user/user.service.ts:70](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/modules/user/user.service.ts#L70)

Retrieves user participation data from the Soroban contract.
Aggregates all user's raffle and ticket activity on the contract.
Read-only — no signing required.

#### Parameters

##### params

[`GetParticipationParams`](../interfaces/GetParticipationParams.md)

Parameters containing the user's Stellar public key

#### Returns

`Promise`\<[`ContractResponse`](../../index.read/interfaces/ContractResponse.md)\<[`UserParticipation`](../interfaces/UserParticipation.md)\>\>

Promise containing user participation statistics

#### Throws

Will reject if address is invalid

#### Example

```ts
const participation = await userService.getParticipation({
  address: userAddress
});

if (participation.success) {
  console.log(`${participation.value?.totalTicketsBought} tickets purchased`);
  console.log(`Participated in raffles: ${participation.value?.raffleIds}`);
}
```
Retrieves core user participation data from the Soroban contract.
Read-only — no signing required.

#### Source

contract

***

### getTickets()

> **getTickets**(`address`): `Promise`\<[`ContractResponse`](../../index.read/interfaces/ContractResponse.md)\<[`UserTicket`](../interfaces/UserTicket.md)[]\>\>

Defined in: [modules/user/user.service.ts:109](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/modules/user/user.service.ts#L109)

Returns all tickets owned by a user across every raffle they entered.

Calls `GET_USER_TICKETS` for each raffle ID returned by `getParticipation`.
The result includes per-ticket raffle IDs, suitable for display or refund
eligibility checks.

#### Parameters

##### address

`string`

#### Returns

`Promise`\<[`ContractResponse`](../../index.read/interfaces/ContractResponse.md)\<[`UserTicket`](../interfaces/UserTicket.md)[]\>\>

#### Source

contract

***

### getWinnings()

> **getWinnings**(`address`): `any`

Defined in: [modules/user/user.service.ts:240](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/modules/user/user.service.ts#L240)

Returns claimable prize entries for a given address.

Filters the user's activity summary for won raffles, then checks
on-chain raffle data to determine whether each prize has been claimed.

A prize is considered unclaimed when the raffle is Finalized and the
winner field still matches the address (the contract clears this on claim).

#### Parameters

##### address

`string`

The winner's Stellar public key

#### Returns

`any`

Array of WinningEntry objects, one per won raffle
