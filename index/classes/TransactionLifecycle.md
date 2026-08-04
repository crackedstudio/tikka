[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / TransactionLifecycle

# Class: TransactionLifecycle

Defined in: [contract/lifecycle.ts:193](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/contract/lifecycle.ts#L193)

TransactionLifecycle manages the four-phase Soroban transaction lifecycle.

## Phase overview

```
simulate()   — build tx, call simulateTransaction, assemble fee+auth
  ↓
sign()       — pass assembledXdr to wallet; get signedXdr back
  ↓
submit()     — call sendTransaction with signedXdr
  ↓
poll()       — call getTransaction until SUCCESS / FAILED / timeout
```

`invoke()` runs all four phases in sequence and is the most convenient
entry point for standard write operations.

## Constructors

### Constructor

> **new TransactionLifecycle**(`rpc`, `horizon`, `networkConfig`, `wallet`, `contractId`): `TransactionLifecycle`

Defined in: [contract/lifecycle.ts:194](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/contract/lifecycle.ts#L194)

#### Parameters

##### rpc

[`RpcService`](RpcService.md)

##### horizon

[`HorizonService`](HorizonService.md)

##### networkConfig

[`NetworkConfig`](../interfaces/NetworkConfig.md)

##### wallet

[`WalletAdapter`](WalletAdapter.md) \| `undefined`

##### contractId

`string`

#### Returns

`TransactionLifecycle`

## Methods

### invoke()

> **invoke**\<`T`\>(`method`, `params`, `options?`): `Promise`\<[`SubmitResult`](../interfaces/SubmitResult.md)\<`T`\>\>

Defined in: [contract/lifecycle.ts:443](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/contract/lifecycle.ts#L443)

Convenience method that runs all four phases in sequence:
simulate → sign → submit → poll.

#### Type Parameters

##### T

`T` = `unknown`

#### Parameters

##### method

`string`

##### params

`any`[]

##### options?

[`InvokeLifecycleOptions`](../interfaces/InvokeLifecycleOptions.md) = `{}`

#### Returns

`Promise`\<[`SubmitResult`](../interfaces/SubmitResult.md)\<`T`\>\>

#### Throws

Any of the per-phase errors.

***

### poll()

> **poll**\<`T`\>(`txHash`, `config?`): `Promise`\<[`SubmitResult`](../interfaces/SubmitResult.md)\<`T`\>\>

Defined in: [contract/lifecycle.ts:348](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/contract/lifecycle.ts#L348)

Polls the RPC for the transaction status until it reaches SUCCESS or FAILED,
applying exponential backoff between attempts.

#### Type Parameters

##### T

`T` = `unknown`

#### Parameters

##### txHash

`string`

Transaction hash returned by `submit()`.

##### config?

[`PollConfig`](../interfaces/PollConfig.md) = `{}`

Optional polling configuration.

#### Returns

`Promise`\<[`SubmitResult`](../interfaces/SubmitResult.md)\<`T`\>\>

#### Throws

`TikkaSdkError(Timeout)` if the timeout is exceeded.

#### Throws

`TikkaSdkError(ContractError)` if the transaction failed on-chain.

#### Throws

`TikkaSdkError(ExternalContractError)` if a cross-contract call failed.

***

### setContractId()

> **setContractId**(`id`): `void`

Defined in: [contract/lifecycle.ts:206](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/contract/lifecycle.ts#L206)

#### Parameters

##### id

`string`

#### Returns

`void`

***

### setWallet()

> **setWallet**(`adapter`): `void`

Defined in: [contract/lifecycle.ts:202](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/contract/lifecycle.ts#L202)

#### Parameters

##### adapter

[`WalletAdapter`](WalletAdapter.md) \| `undefined`

#### Returns

`void`

***

### sign()

> **sign**(`assembledXdr`, `networkPassphrase?`): `Promise`\<`string`\>

Defined in: [contract/lifecycle.ts:272](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/contract/lifecycle.ts#L272)

Passes `assembledXdr` to the connected wallet adapter and returns the signed XDR.

#### Parameters

##### assembledXdr

`string`

##### networkPassphrase?

`string`

#### Returns

`Promise`\<`string`\>

#### Throws

`TikkaSdkError(WalletNotInstalled)` if no wallet adapter is set.

#### Throws

`TikkaSdkError(UserRejected)` if the wallet reports a rejection.

***

### simulate()

> **simulate**\<`T`\>(`method`, `params`, `options?`): `Promise`\<[`SimulateResult`](../interfaces/SimulateResult.md)\<`T`\>\>

Defined in: [contract/lifecycle.ts:220](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/contract/lifecycle.ts#L220)

Builds a transaction for `method` + `params`, simulates it, assembles the
final fee-bumped XDR, and returns the result including the decoded return value.

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

`Pick`\<[`InvokeLifecycleOptions`](../interfaces/InvokeLifecycleOptions.md), `"sourcePublicKey"` \| `"fee"` \| `"memo"`\> = `{}`

#### Returns

`Promise`\<[`SimulateResult`](../interfaces/SimulateResult.md)\<`T`\>\>

#### Throws

`TikkaSdkError(SimulationFailed)` if the RPC returns an error.

***

### submit()

> **submit**(`signedXdr`): `Promise`\<`string`\>

Defined in: [contract/lifecycle.ts:318](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/contract/lifecycle.ts#L318)

Submits a signed transaction XDR to the network and returns the transaction hash.

#### Parameters

##### signedXdr

`string`

#### Returns

`Promise`\<`string`\>

#### Throws

`TikkaSdkError(SubmissionFailed)` if the RPC rejects the submission.

#### Throws

`TikkaSdkError(NetworkError)` if the RPC is unreachable.
