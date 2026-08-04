[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / assertValidTicketQuantity

# Function: assertValidTicketQuantity()

> **assertValidTicketQuantity**(`quantity`, `fieldName?`): `void`

Defined in: [modules/ticket/purchase-validation.ts:51](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/modules/ticket/purchase-validation.ts#L51)

Validates ticket quantity / count against module constraints.
Covers 0, negative, non-integer, and max boundary.

## Parameters

### quantity

`number`

### fieldName?

`"quantity"` \| `"count"`

## Returns

`void`
