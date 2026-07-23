[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / TransactionLifecycle

# Class: TransactionLifecycle

Defined in: [contract/lifecycle.ts:191](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/contract/lifecycle.ts#L191)

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

Defined in: [contract/lifecycle.ts:192](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/contract/lifecycle.ts#L192)

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

Defined in: [contract/lifecycle.ts:442](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/contract/lifecycle.ts#L442)

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

Defined in: [contract/lifecycle.ts:347](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/contract/lifecycle.ts#L347)

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

Defined in: [contract/lifecycle.ts:204](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/contract/lifecycle.ts#L204)

#### Parameters

##### id

`string`

#### Returns

`void`

***

### setWallet()

> **setWallet**(`adapter`): `void`

Defined in: [contract/lifecycle.ts:200](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/contract/lifecycle.ts#L200)

#### Parameters

##### adapter

[`WalletAdapter`](WalletAdapter.md) \| `undefined`

#### Returns

`void`

***

### sign()

> **sign**(`assembledXdr`, `networkPassphrase?`): `Promise`\<`string`\>

Defined in: [contract/lifecycle.ts:270](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/contract/lifecycle.ts#L270)

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

Defined in: [contract/lifecycle.ts:218](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/contract/lifecycle.ts#L218)

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

Defined in: [contract/lifecycle.ts:316](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/contract/lifecycle.ts#L316)

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
