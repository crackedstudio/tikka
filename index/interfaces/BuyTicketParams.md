[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / BuyTicketParams

# Interface: BuyTicketParams

Defined in: [modules/ticket/ticket.types.ts:16](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/modules/ticket/ticket.types.ts#L16)

Parameters for purchasing tickets.
Quantity must be a positive integer between 1 and 1000.

## Properties

### memo?

> `optional` **memo?**: [`TxMemo`](../type-aliases/TxMemo.md)

Defined in: [modules/ticket/ticket.types.ts:25](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/modules/ticket/ticket.types.ts#L25)

Optional transaction memo for tracking or external integrations.
Supports text (≤28 bytes), numeric id, or 32-byte hash.

***

### quantity

> **quantity**: `number`

Defined in: [modules/ticket/ticket.types.ts:20](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/modules/ticket/ticket.types.ts#L20)

Number of tickets to purchase (1-1000)

***

### raffleId

> **raffleId**: `number`

Defined in: [modules/ticket/ticket.types.ts:18](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/modules/ticket/ticket.types.ts#L18)

Raffle ID (must be positive integer)
