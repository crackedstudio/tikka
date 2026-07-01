[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / TicketService

# Class: TicketService

Defined in: [modules/ticket/ticket.service.ts:24](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/modules/ticket/ticket.service.ts#L24)

## Constructors

### Constructor

> **new TicketService**(`contractService`): `TicketService`

Defined in: [modules/ticket/ticket.service.ts:27](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/modules/ticket/ticket.service.ts#L27)

#### Parameters

##### contractService

[`ContractService`](../../index.write/classes/ContractService.md)

#### Returns

`TicketService`

## Methods

### buy()

> **buy**(`params`): `Promise`\<[`ContractResponse`](../../index.read/interfaces/ContractResponse.md)\<[`BuyTicketResult`](../interfaces/BuyTicketResult.md)\>\>

Defined in: [modules/ticket/ticket.service.ts:97](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/modules/ticket/ticket.service.ts#L97)

Purchases tickets for a raffle.
Requires wallet signature and submission.

Token transfer failures (e.g. malicious SEP-41 token rejecting the call)
are surfaced as `ExternalContractError` so callers can handle them
separately from generic network/contract errors.

#### Parameters

##### params

[`BuyTicketParams`](../interfaces/BuyTicketParams.md)

#### Returns

`Promise`\<[`ContractResponse`](../../index.read/interfaces/ContractResponse.md)\<[`BuyTicketResult`](../interfaces/BuyTicketResult.md)\>\>

#### Throws

TikkaSdkError if validation fails or submission is duplicate

***

### buyBatch()

> **buyBatch**(`params`): `Promise`\<[`ContractResponse`](../../index.read/interfaces/ContractResponse.md)\<[`BuyBatchResult`](../interfaces/BuyBatchResult.md)\>\>

Defined in: [modules/ticket/ticket.service.ts:338](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/modules/ticket/ticket.service.ts#L338)

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

Defined in: [modules/ticket/ticket.service.ts:156](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/modules/ticket/ticket.service.ts#L156)

Purchases multiple tickets for a raffle in a single transaction.
Uses the batch purchase contract entry point.

#### Parameters

##### params

[`BuyTicketsParams`](../interfaces/BuyTicketsParams.md)

#### Returns

`Promise`\<[`ContractResponse`](../../index.read/interfaces/ContractResponse.md)\<[`BuyTicketResult`](../interfaces/BuyTicketResult.md)\>\>

#### Throws

TikkaSdkError if validation fails or submission is duplicate

***

### claimPrize()

> **claimPrize**(`params`): `Promise`\<[`ContractResponse`](../../index.read/interfaces/ContractResponse.md)\<`ClaimPrizeResult`\>\>

Defined in: [modules/ticket/ticket.service.ts:261](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/modules/ticket/ticket.service.ts#L261)

Claims the prize for a finalized raffle.
Requires wallet signature and submission.

#### Parameters

##### params

`ClaimPrizeParams`

#### Returns

`Promise`\<[`ContractResponse`](../../index.read/interfaces/ContractResponse.md)\<`ClaimPrizeResult`\>\>

#### Throws

TikkaSdkError if validation fails or prize claim fails

***

### getUserTickets()

> **getUserTickets**(`params`): `Promise`\<[`ContractResponse`](../../index.read/interfaces/ContractResponse.md)\<`number`[]\>\>

Defined in: [modules/ticket/ticket.service.ts:292](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/modules/ticket/ticket.service.ts#L292)

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

Defined in: [modules/ticket/ticket.service.ts:214](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/modules/ticket/ticket.service.ts#L214)

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
