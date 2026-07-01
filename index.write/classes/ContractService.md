[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index.write](../README.md) / ContractService

# Class: ContractService

Defined in: [contract/contract.service.ts:83](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/contract/contract.service.ts#L83)

## Constructors

### Constructor

> **new ContractService**(`rpc`, `horizon`, `networkConfig`, `wallet?`): `ContractService`

Defined in: [contract/contract.service.ts:87](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/contract/contract.service.ts#L87)

#### Parameters

##### rpc

[`RpcService`](../../index/classes/RpcService.md)

##### horizon

[`HorizonService`](../../index/classes/HorizonService.md)

##### networkConfig

[`NetworkConfig`](../../index/interfaces/NetworkConfig.md)

##### wallet?

[`WalletAdapter`](../../index/classes/WalletAdapter.md)

#### Returns

`ContractService`

## Methods

### batchBuyTickets()

> **batchBuyTickets**(`raffleId`, `count`, `options?`): `Promise`\<[`TxResponse`](../../index/type-aliases/TxResponse.md)\<`number`[]\>\>

Defined in: [contract/contract.service.ts:331](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/contract/contract.service.ts#L331)

#### Parameters

##### raffleId

`number`

##### count

`number`

##### options?

[`InvokeOptions`](../interfaces/InvokeOptions.md) = `{}`

#### Returns

`Promise`\<[`TxResponse`](../../index/type-aliases/TxResponse.md)\<`number`[]\>\>

***

### buildUnsigned()

> **buildUnsigned**\<`T`\>(`method`, `params`, `sourcePublicKey`, `feeOverride?`): `Promise`\<[`UnsignedTxResult`](../interfaces/UnsignedTxResult.md)\<`T`\>\>

Defined in: [contract/contract.service.ts:288](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/contract/contract.service.ts#L288)

Builds a fully-prepared (simulated + auth-populated) unsigned transaction XDR.

#### Type Parameters

##### T

`T` = `any`

#### Parameters

##### method

`string`

##### params

`any`[]

##### sourcePublicKey

`string`

##### feeOverride?

`number`

#### Returns

`Promise`\<[`UnsignedTxResult`](../interfaces/UnsignedTxResult.md)\<`T`\>\>

***

### getPublicKey()

> **getPublicKey**(): `Promise`\<`string`\>

Defined in: [contract/contract.service.ts:117](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/contract/contract.service.ts#L117)

Returns the public key of the currently connected wallet.

#### Returns

`Promise`\<`string`\>

#### Throws

TikkaSdkError(WalletNotConnected) if no wallet is connected

***

### invoke()

> **invoke**\<`T`\>(`method`, `params`, `options?`): `Promise`\<[`TxResponse`](../../index/type-aliases/TxResponse.md)\<`T`\>\>

Defined in: [contract/contract.service.ts:239](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/contract/contract.service.ts#L239)

#### Type Parameters

##### T

`T` = `any`

#### Parameters

##### method

`string`

##### params

`any`[]

##### options?

[`InvokeOptions`](../interfaces/InvokeOptions.md) = `{}`

#### Returns

`Promise`\<[`TxResponse`](../../index/type-aliases/TxResponse.md)\<`T`\>\>

***

### poll()

> **poll**\<`T`\>(`txHash`, `config?`): `Promise`\<[`SubmitResult`](../../index/interfaces/SubmitResult.md)\<`T`\>\>

Defined in: [contract/contract.service.ts:168](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/contract/contract.service.ts#L168)

Phase 4 — Poll for transaction confirmation.
Returns the on-chain return value, tx hash, and ledger.

#### Type Parameters

##### T

`T` = `unknown`

#### Parameters

##### txHash

`string`

##### config?

[`PollConfig`](../../index/interfaces/PollConfig.md)

#### Returns

`Promise`\<[`SubmitResult`](../../index/interfaces/SubmitResult.md)\<`T`\>\>

***

### setContractId()

> **setContractId**(`id`): `void`

Defined in: [contract/contract.service.ts:103](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/contract/contract.service.ts#L103)

#### Parameters

##### id

`string`

#### Returns

`void`

***

### setWallet()

> **setWallet**(`adapter`): `void`

Defined in: [contract/contract.service.ts:108](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/contract/contract.service.ts#L108)

#### Parameters

##### adapter

[`WalletAdapter`](../../index/classes/WalletAdapter.md)

#### Returns

`void`

***

### sign()

> **sign**(`assembledXdr`, `networkPassphrase?`): `Promise`\<`string`\>

Defined in: [contract/contract.service.ts:149](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/contract/contract.service.ts#L149)

Phase 2 — Sign an assembled transaction XDR via the connected wallet.
Returns the signed XDR string.

#### Parameters

##### assembledXdr

`string`

##### networkPassphrase?

`string`

#### Returns

`Promise`\<`string`\>

***

### simulate()

> **simulate**\<`T`\>(`method`, `params`, `options?`): `Promise`\<[`SimulateResult`](../../index/interfaces/SimulateResult.md)\<`T`\>\>

Defined in: [contract/contract.service.ts:134](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/contract/contract.service.ts#L134)

Phase 1 — Build and simulate a transaction.
Returns the assembled XDR, decoded return value, fee, and network passphrase.
Safe to call without a wallet (uses anonymous fallback key).

#### Type Parameters

##### T

`T` = `unknown`

#### Parameters

##### method

`string`

##### params

`any`[]

##### options?

`Pick`\<[`InvokeLifecycleOptions`](../../index/interfaces/InvokeLifecycleOptions.md), `"sourcePublicKey"` \| `"fee"` \| `"memo"`\> = `{}`

#### Returns

`Promise`\<[`SimulateResult`](../../index/interfaces/SimulateResult.md)\<`T`\>\>

***

### simulateReadOnly()

> **simulateReadOnly**\<`T`\>(`method`, `params`): `Promise`\<[`TxResponse`](../../index/type-aliases/TxResponse.md)\<`T`\>\>

Defined in: [contract/contract.service.ts:177](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/contract/contract.service.ts#L177)

#### Type Parameters

##### T

`T`

#### Parameters

##### method

`string`

##### params

`any`[]

#### Returns

`Promise`\<[`TxResponse`](../../index/type-aliases/TxResponse.md)\<`T`\>\>

***

### submit()

> **submit**(`signedXdr`): `Promise`\<`string`\>

Defined in: [contract/contract.service.ts:160](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/contract/contract.service.ts#L160)

Phase 3 — Submit a signed transaction XDR to the network.
Returns the transaction hash.

#### Parameters

##### signedXdr

`string`

#### Returns

`Promise`\<`string`\>

***

### submitSigned()

> **submitSigned**\<`T`\>(`signedXdr`): `Promise`\<[`TxResponse`](../../index/type-aliases/TxResponse.md)\<`T`\>\>

Defined in: [contract/contract.service.ts:316](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/contract/contract.service.ts#L316)

Submits a signed transaction XDR that was previously built with buildUnsigned().

#### Type Parameters

##### T

`T` = `any`

#### Parameters

##### signedXdr

`string`

#### Returns

`Promise`\<[`TxResponse`](../../index/type-aliases/TxResponse.md)\<`T`\>\>
