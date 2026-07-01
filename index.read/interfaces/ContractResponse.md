[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index.read](../README.md) / ContractResponse

# Interface: ContractResponse\<T\>

Defined in: [contract/response.ts:24](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/contract/response.ts#L24)

Wrapper type for all contract operation responses.

Represents the result of a contract invocation or simulation.
Operations return this generic interface to provide uniform
error handling across the SDK.

## Example

```ts
const response: ContractResponse<RaffleData> = await raffleService.getRaffle(raffleId);

if (response.success) {
  // Access the typed value
  const raffle = response.value;
  console.log(`Raffle title: ${raffle.title}`);
} else {
  // Handle error
  console.error(`Failed: ${response.error}`);
}
```

## Type Parameters

### T

`T` = `any`

The type of the response value on success

## Properties

### error?

> `optional` **error?**: `string`

Defined in: [contract/response.ts:32](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/contract/response.ts#L32)

Error message describing what went wrong (undefined if succeeded)

***

### feeCharged?

> `optional` **feeCharged?**: `string`

Defined in: [contract/response.ts:40](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/contract/response.ts#L40)

Fee aliases used by different SDK modules.

***

### feePaid?

> `optional` **feePaid?**: `string`

Defined in: [contract/response.ts:41](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/contract/response.ts#L41)

***

### ledger?

> `optional` **ledger?**: `number`

Defined in: [contract/response.ts:38](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/contract/response.ts#L38)

Ledger number where transaction was confirmed if applicable

***

### resultXdr?

> `optional` **resultXdr?**: `string`

Defined in: [contract/response.ts:42](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/contract/response.ts#L42)

***

### status?

> `optional` **status?**: `"SUCCESS"` \| `"ERROR"`

Defined in: [contract/response.ts:28](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/contract/response.ts#L28)

Legacy string status used by parts of the SDK.

***

### success?

> `optional` **success?**: `boolean`

Defined in: [contract/response.ts:26](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/contract/response.ts#L26)

Legacy boolean success flag used by parts of the SDK.

***

### transactionHash?

> `optional` **transactionHash?**: `string`

Defined in: [contract/response.ts:34](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/contract/response.ts#L34)

Transaction hash if this was a write operation

***

### txHash?

> `optional` **txHash?**: `string`

Defined in: [contract/response.ts:36](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/contract/response.ts#L36)

Legacy transaction hash alias used by write flows.

***

### value?

> `optional` **value?**: `T`

Defined in: [contract/response.ts:30](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/contract/response.ts#L30)

The result value on success (undefined if failed)

***

### warnings?

> `optional` **warnings?**: `string`[]

Defined in: [contract/response.ts:43](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/contract/response.ts#L43)
