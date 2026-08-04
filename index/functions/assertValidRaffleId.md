[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / assertValidRaffleId

# Function: assertValidRaffleId()

> **assertValidRaffleId**(`raffleId`, `fieldName?`): `void`

Defined in: [modules/ticket/purchase-validation.ts:32](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/modules/ticket/purchase-validation.ts#L32)

Validates raffle id is a positive safe integer.
Rejects 0, negative, non-integer, NaN, and Infinity.

## Parameters

### raffleId

`number`

### fieldName?

[`TicketPurchaseField`](../type-aliases/TicketPurchaseField.md) = `'raffleId'`

## Returns

`void`
