[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / TransferAdminResult

# Interface: TransferAdminResult

Defined in: [modules/admin/admin.types.ts:55](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/modules/admin/admin.types.ts#L55)

Result returned from initiating admin transfer.
The new admin must call [AdminService.acceptAdmin](../classes/AdminService.md#acceptadmin) to complete the transfer.

## Example

```ts
const result = await adminService.transferAdmin(newAdminAddress);
if (result.success) {
  console.log(`Transfer initiated at ledger ${result.ledger}`);
  console.log('New admin must call acceptAdmin() to complete');
}
```

## Properties

### ledger

> **ledger**: `number`

Defined in: [modules/admin/admin.types.ts:59](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/modules/admin/admin.types.ts#L59)

Ledger number where the transaction was confirmed

***

### txHash

> **txHash**: `string`

Defined in: [modules/admin/admin.types.ts:57](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/modules/admin/admin.types.ts#L57)

Transaction hash on the Stellar network
