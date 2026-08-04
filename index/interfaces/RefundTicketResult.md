[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / RefundTicketResult

# Interface: RefundTicketResult

Defined in: [modules/ticket/ticket.types.ts:79](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/modules/ticket/ticket.types.ts#L79)

Result of a ticket refund.
Provides transaction confirmation.

## Properties

### feePaid

> **feePaid**: `string`

Defined in: [modules/ticket/ticket.types.ts:85](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/modules/ticket/ticket.types.ts#L85)

Transaction fee paid in stroops

***

### ledger

> **ledger**: `number`

Defined in: [modules/ticket/ticket.types.ts:83](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/modules/ticket/ticket.types.ts#L83)

Ledger number where transaction was confirmed

***

### transactionHash

> **transactionHash**: `string`

Defined in: [modules/ticket/ticket.types.ts:81](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/modules/ticket/ticket.types.ts#L81)

Transaction hash for confirmation
