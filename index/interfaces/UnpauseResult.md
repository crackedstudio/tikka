[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / UnpauseResult

# Interface: UnpauseResult

Defined in: [modules/admin/admin.types.ts:34](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/modules/admin/admin.types.ts#L34)

Result returned from resuming the raffle contract.

## Example

```ts
const result = await adminService.unpause();
if (result.success) {
  console.log(`Resume confirmed at ledger ${result.ledger} - tx: ${result.txHash}`);
}
```

## Properties

### ledger

> **ledger**: `number`

Defined in: [modules/admin/admin.types.ts:38](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/modules/admin/admin.types.ts#L38)

Ledger number where the transaction was confirmed

***

### txHash

> **txHash**: `string`

Defined in: [modules/admin/admin.types.ts:36](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/modules/admin/admin.types.ts#L36)

Transaction hash on the Stellar network
