[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / BuyTicketResult

# Interface: BuyTicketResult

Defined in: [modules/ticket/ticket.types.ts:48](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/modules/ticket/ticket.types.ts#L48)

Result of a ticket purchase.
Provides transaction confirmation and purchased ticket IDs.

## Properties

### feePaid

> **feePaid**: `string`

Defined in: [modules/ticket/ticket.types.ts:56](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/modules/ticket/ticket.types.ts#L56)

Transaction fee paid in stroops

***

### ledger

> **ledger**: `number`

Defined in: [modules/ticket/ticket.types.ts:54](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/modules/ticket/ticket.types.ts#L54)

Ledger number where transaction was confirmed

***

### ticketIds

> **ticketIds**: `number`[]

Defined in: [modules/ticket/ticket.types.ts:50](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/modules/ticket/ticket.types.ts#L50)

Array of successfully purchased ticket IDs

***

### transactionHash

> **transactionHash**: `string`

Defined in: [modules/ticket/ticket.types.ts:52](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/modules/ticket/ticket.types.ts#L52)

Transaction hash for confirmation
