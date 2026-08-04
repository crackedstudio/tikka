[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / RpcService

# Class: RpcService

Defined in: [network/rpc.service.ts:27](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/network/rpc.service.ts#L27)

RpcService
Combines Stellar RPC SDK with configurable transport (timeouts, headers, failover).

## Constructors

### Constructor

> **new RpcService**(`networkConfig`, `rpcConfig?`): `RpcService`

Defined in: [network/rpc.service.ts:34](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/network/rpc.service.ts#L34)

#### Parameters

##### networkConfig

[`NetworkConfig`](../interfaces/NetworkConfig.md)

##### rpcConfig?

[`RpcConfig`](../interfaces/RpcConfig.md)

#### Returns

`RpcService`

## Methods

### addFailoverEndpoint()

> **addFailoverEndpoint**(`url`): `void`

Defined in: [network/rpc.service.ts:68](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/network/rpc.service.ts#L68)

Add fallback RPC endpoint

#### Parameters

##### url

`string`

#### Returns

`void`

***

### configure()

> **configure**(`config`): `void`

Defined in: [network/rpc.service.ts:55](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/network/rpc.service.ts#L55)

Update RPC config at runtime

#### Parameters

##### config

`Partial`\<[`RpcConfig`](../interfaces/RpcConfig.md)\>

#### Returns

`void`

***

### estimateFee()

> **estimateFee**(`_operation?`): `Promise`\<\{ `minFee`: `number`; `suggestedFee`: `number`; \}\>

Defined in: [network/rpc.service.ts:124](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/network/rpc.service.ts#L124)

Estimate fee using Horizon's fee stats endpoint.

#### Parameters

##### \_operation?

`Operation2`\<`OperationRecord`\>

#### Returns

`Promise`\<\{ `minFee`: `number`; `suggestedFee`: `number`; \}\>

***

### getCircuitState()

> **getCircuitState**(): `"closed"` \| `"open"` \| `"half-open"`

Defined in: [network/rpc.service.ts:143](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/network/rpc.service.ts#L143)

Get the current state of the circuit breaker

#### Returns

`"closed"` \| `"open"` \| `"half-open"`

***

### getLedger()

> **getLedger**(`options?`): `Promise`\<`GetLatestLedgerResponse`\>

Defined in: [network/rpc.service.ts:102](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/network/rpc.service.ts#L102)

Fetch latest ledger from Soroban RPC

#### Parameters

##### options?

`RequestOptions` = `{}`

#### Returns

`Promise`\<`GetLatestLedgerResponse`\>

***

### getServer()

> **getServer**(): `RpcServer`

Defined in: [network/rpc.service.ts:50](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/network/rpc.service.ts#L50)

Get underlying rpc.Server

#### Returns

`RpcServer`

***

### getTransaction()

> **getTransaction**(`hash`): `Promise`\<`GetTransactionResponse`\>

Defined in: [network/rpc.service.ts:115](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/network/rpc.service.ts#L115)

Get a single transaction status from the RPC node (single-shot).
Returns NOT_FOUND if the tx is not yet indexed — caller owns the retry loop.
Transient transport errors (429, 5xx) are still retried by `executeRequest()`.

#### Parameters

##### hash

`string`

#### Returns

`Promise`\<`GetTransactionResponse`\>

***

### isDegraded()

> **isDegraded**(): `boolean`

Defined in: [network/rpc.service.ts:159](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/network/rpc.service.ts#L159)

Returns true if the service is operating in a degraded mode:
- Circuit breaker is open or half-open, OR
- Currently experiencing consecutive failures (> 0)

#### Returns

`boolean`

***

### sendTransaction()

> **sendTransaction**(`tx`, `options?`): `Promise`\<`SendTransactionResponse`\>

Defined in: [network/rpc.service.ts:94](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/network/rpc.service.ts#L94)

Send transaction with automatic failover

#### Parameters

##### tx

`any`

##### options?

`RequestOptions` = `{}`

#### Returns

`Promise`\<`SendTransactionResponse`\>

***

### setEndpoint()

> **setEndpoint**(`url`): `void`

Defined in: [network/rpc.service.ts:60](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/network/rpc.service.ts#L60)

Override RPC endpoint

#### Parameters

##### url

`string`

#### Returns

`void`

***

### setFetchClient()

> **setFetchClient**(`client`): `void`

Defined in: [network/rpc.service.ts:76](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/network/rpc.service.ts#L76)

Set custom fetch-compatible client

#### Parameters

##### client

`any`

#### Returns

`void`

***

### setHeaders()

> **setHeaders**(`headers`): `void`

Defined in: [network/rpc.service.ts:81](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/network/rpc.service.ts#L81)

Set default HTTP headers (e.g. API keys)

#### Parameters

##### headers

`Record`\<`string`, `string`\>

#### Returns

`void`

***

### simulateTransaction()

> **simulateTransaction**(`tx`, `options?`): `Promise`\<`SimulateTransactionResponse`\>

Defined in: [network/rpc.service.ts:86](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/network/rpc.service.ts#L86)

Simulate transaction with automatic failover

#### Parameters

##### tx

`any`

##### options?

`RequestOptions` = `{}`

#### Returns

`Promise`\<`SimulateTransactionResponse`\>
