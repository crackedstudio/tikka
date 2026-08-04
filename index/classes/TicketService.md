[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / TicketService

# Class: TicketService

Defined in: [modules/ticket/ticket.service.ts:31](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/modules/ticket/ticket.service.ts#L31)

## Constructors

### Constructor

> **new TicketService**(`contractService`): `TicketService`

Defined in: [modules/ticket/ticket.service.ts:34](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/modules/ticket/ticket.service.ts#L34)

#### Parameters

##### contractService

[`ContractService`](../../index.write/classes/ContractService.md)

#### Returns

`TicketService`

## Methods

### buy()

> **buy**(`params`): `Promise`\<[`ContractResponse`](../../index.read/interfaces/ContractResponse.md)\<[`BuyTicketResult`](../interfaces/BuyTicketResult.md)\>\>

Defined in: [modules/ticket/ticket.service.ts:100](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/modules/ticket/ticket.service.ts#L100)

Purchases tickets for a raffle.
Requires wallet signature and submission.

Validates the raffle is in OPEN state before simulating/submitting —
see issue #929.

Token transfer failures (e.g. malicious SEP-41 token rejecting the call)
are surfaced as `ExternalContractError` so callers can handle them
separately from generic network/contract errors.

#### Parameters

##### params

[`BuyTicketParams`](../interfaces/BuyTicketParams.md)

#### Returns

`Promise`\<[`ContractResponse`](../../index.read/interfaces/ContractResponse.md)\<[`BuyTicketResult`](../interfaces/BuyTicketResult.md)\>\>

#### Throws

TikkaSdkError if validation fails, raffle is not OPEN, or submission is duplicate

***

### buyBatch()

> **buyBatch**(`params`): `Promise`\<[`ContractResponse`](../../index.read/interfaces/ContractResponse.md)\<[`BuyBatchResult`](../interfaces/BuyBatchResult.md)\>\>

Defined in: [modules/ticket/ticket.service.ts:350](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/modules/ticket/ticket.service.ts#L350)

Purchases tickets for multiple raffles in a single operation.

This method handles batch ticket purchases with individual validation for each raffle.
Returns individual success/failure results for each purchase, allowing partial failures.

Constraints:
- Maximum 100 purchases per batch
- Each purchase quantity: 1-1000 tickets
- Follows same duplicate submission detection as single purchase

#### Parameters

##### params

[`BuyBatchParams`](../interfaces/BuyBatchParams.md)

Batch purchase parameters containing array of raffle purchases

#### Returns

`Promise`\<[`ContractResponse`](../../index.read/interfaces/ContractResponse.md)\<[`BuyBatchResult`](../interfaces/BuyBatchResult.md)\>\>

Individual results for each raffle purchase attempt

#### Throws

If validation fails or all purchases fail

#### Example

```typescript
const result = await ticketService.buyBatch({
  purchases: [
    { raffleId: 1, quantity: 5 },
    { raffleId: 2, quantity: 3 },
  ],
  memo: { type: 'text', value: 'Batch purchase' }
});
```

***

### buyTickets()

> **buyTickets**(`params`): `Promise`\<[`ContractResponse`](../../index.read/interfaces/ContractResponse.md)\<[`BuyTicketResult`](../interfaces/BuyTicketResult.md)\>\>

Defined in: [modules/ticket/ticket.service.ts:165](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/modules/ticket/ticket.service.ts#L165)

Purchases multiple tickets for a raffle in a single transaction.
Uses the batch purchase contract entry point.

Validates the raffle is in OPEN state before simulating/submitting —
see issue #929.

#### Parameters

##### params

[`BuyTicketsParams`](../interfaces/BuyTicketsParams.md)

#### Returns

`Promise`\<[`ContractResponse`](../../index.read/interfaces/ContractResponse.md)\<[`BuyTicketResult`](../interfaces/BuyTicketResult.md)\>\>

#### Throws

TikkaSdkError if validation fails, raffle is not OPEN, or submission is duplicate

***

### claimPrize()

> **claimPrize**(`params`): `Promise`\<[`ContractResponse`](../../index.read/interfaces/ContractResponse.md)\<[`ClaimPrizeResult`](../interfaces/ClaimPrizeResult.md)\>\>

Defined in: [modules/ticket/ticket.service.ts:273](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/modules/ticket/ticket.service.ts#L273)

Claims the prize for a finalized raffle.
Requires wallet signature and submission.

#### Parameters

##### params

[`ClaimPrizeParams`](../interfaces/ClaimPrizeParams.md)

#### Returns

`Promise`\<[`ContractResponse`](../../index.read/interfaces/ContractResponse.md)\<[`ClaimPrizeResult`](../interfaces/ClaimPrizeResult.md)\>\>

#### Throws

TikkaSdkError if validation fails or prize claim fails

***

### getUserTickets()

> **getUserTickets**(`params`): `Promise`\<[`ContractResponse`](../../index.read/interfaces/ContractResponse.md)\<`number`[]\>\>

Defined in: [modules/ticket/ticket.service.ts:304](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/modules/ticket/ticket.service.ts#L304)

Gets all ticket IDs owned by a user for a specific raffle.
Read-only operation (no signing required).

#### Parameters

##### params

[`GetUserTicketsParams`](../interfaces/GetUserTicketsParams.md)

#### Returns

`Promise`\<[`ContractResponse`](../../index.read/interfaces/ContractResponse.md)\<`number`[]\>\>

#### Throws

TikkaSdkError if validation fails or query fails

***

### refund()

> **refund**(`params`): `Promise`\<[`ContractResponse`](../../index.read/interfaces/ContractResponse.md)\<[`RefundTicketResult`](../interfaces/RefundTicketResult.md)\>\>

Defined in: [modules/ticket/ticket.service.ts:226](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/modules/ticket/ticket.service.ts#L226)

Refunds a ticket (when raffle is cancelled).
Requires wallet signature and submission.

Token transfer failures during refund are surfaced as `ExternalContractError`.

#### Parameters

##### params

[`RefundTicketParams`](../interfaces/RefundTicketParams.md)

#### Returns

`Promise`\<[`ContractResponse`](../../index.read/interfaces/ContractResponse.md)\<[`RefundTicketResult`](../interfaces/RefundTicketResult.md)\>\>

#### Throws

TikkaSdkError if validation fails or refund fails
