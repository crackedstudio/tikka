[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / PauseResult

# Interface: PauseResult

Defined in: [modules/admin/admin.types.ts:15](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/modules/admin/admin.types.ts#L15)

Result returned from pausing the raffle contract.

## Example

```ts
const result = await adminService.pause();
if (result.success) {
  console.log(`Pause confirmed at ledger ${result.ledger} - tx: ${result.txHash}`);
}
```

## Properties

### ledger

> **ledger**: `number`

Defined in: [modules/admin/admin.types.ts:19](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/modules/admin/admin.types.ts#L19)

Ledger number where the transaction was confirmed

***

### txHash

> **txHash**: `string`

Defined in: [modules/admin/admin.types.ts:17](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/modules/admin/admin.types.ts#L17)

Transaction hash on the Stellar network
