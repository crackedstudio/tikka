[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / AdminWriteOptions

# Interface: AdminWriteOptions

Defined in: [modules/admin/admin.types.ts:94](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/modules/admin/admin.types.ts#L94)

Optional parameters for admin write operations.

## Example

```ts
const options: AdminWriteOptions = {
  memo: 'pause_during_maintenance'
};
const result = await adminService.pause(options);
```

## Properties

### memo?

> `optional` **memo?**: [`TxMemo`](../type-aliases/TxMemo.md)

Defined in: [modules/admin/admin.types.ts:100](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/modules/admin/admin.types.ts#L100)

Optional transaction memo for tracking or external integrations.
Supports text (≤28 bytes), numeric id, or 32-byte hash.
Useful for on-chain record-keeping and audit trails.
