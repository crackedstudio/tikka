[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / assertValidStroopsAmount

# Function: assertValidStroopsAmount()

> **assertValidStroopsAmount**(`amount`, `fieldName?`): `void`

Defined in: [modules/ticket/purchase-validation.ts:85](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/modules/ticket/purchase-validation.ts#L85)

Validates a price expressed in stroops (integer asset amount).
Rejects decimals / wrong asset precision, empty, negative, and non-numeric values.

## Parameters

### amount

`string`

### fieldName?

[`TicketPurchaseField`](../type-aliases/TicketPurchaseField.md) = `'maxPricePerTicket'`

## Returns

`void`
