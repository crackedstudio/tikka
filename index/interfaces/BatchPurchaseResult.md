[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / BatchPurchaseResult

# Interface: BatchPurchaseResult

Defined in: [modules/ticket/ticket.types.ts:148](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/modules/ticket/ticket.types.ts#L148)

Result for a single purchase in a batch operation.
Indicates success or failure with error details if failed.

## Properties

### error?

> `optional` **error?**: `string`

Defined in: [modules/ticket/ticket.types.ts:158](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/modules/ticket/ticket.types.ts#L158)

Error message if purchase failed

***

### raffleId

> **raffleId**: `number`

Defined in: [modules/ticket/ticket.types.ts:150](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/modules/ticket/ticket.types.ts#L150)

Raffle ID for this purchase

***

### status?

> `optional` **status?**: `"SUCCESS"` \| `"ERROR"`

Defined in: [modules/ticket/ticket.types.ts:156](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/modules/ticket/ticket.types.ts#L156)

Batch execution status

***

### success

> **success**: `boolean`

Defined in: [modules/ticket/ticket.types.ts:154](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/modules/ticket/ticket.types.ts#L154)

Whether this purchase succeeded

***

### ticketIds

> **ticketIds**: `number`[]

Defined in: [modules/ticket/ticket.types.ts:152](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/modules/ticket/ticket.types.ts#L152)

Array of purchased ticket IDs (empty if failed)
