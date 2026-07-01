[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / RefundTicketParams

# Interface: RefundTicketParams

Defined in: [modules/ticket/ticket.types.ts:63](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/modules/ticket/ticket.types.ts#L63)

Parameters for refunding a ticket.
Used when cancelling a raffle and returning funds to ticket holders.

## Properties

### memo?

> `optional` **memo?**: [`TxMemo`](../type-aliases/TxMemo.md)

Defined in: [modules/ticket/ticket.types.ts:72](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/modules/ticket/ticket.types.ts#L72)

Optional transaction memo for tracking or external integrations.
Supports text (≤28 bytes), numeric id, or 32-byte hash.

***

### raffleId

> **raffleId**: `number`

Defined in: [modules/ticket/ticket.types.ts:65](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/modules/ticket/ticket.types.ts#L65)

Raffle ID (must be positive integer)

***

### ticketId

> **ticketId**: `number`

Defined in: [modules/ticket/ticket.types.ts:67](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/modules/ticket/ticket.types.ts#L67)

Ticket ID to refund (must be positive integer)
