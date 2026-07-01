[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / RpcService

# Class: RpcService

Defined in: [network/rpc.service.ts:26](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/network/rpc.service.ts#L26)

RpcService
Combines Stellar RPC SDK with configurable transport (timeouts, headers, failover).

## Constructors

### Constructor

> **new RpcService**(`networkConfig`, `rpcConfig?`): `RpcService`

Defined in: [network/rpc.service.ts:33](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/network/rpc.service.ts#L33)

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

Defined in: [network/rpc.service.ts:67](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/network/rpc.service.ts#L67)

Add fallback RPC endpoint

#### Parameters

##### url

`string`

#### Returns

`void`

***

### configure()

> **configure**(`config`): `void`

Defined in: [network/rpc.service.ts:54](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/network/rpc.service.ts#L54)

Update RPC config at runtime

#### Parameters

##### config

`Partial`\<[`RpcConfig`](../interfaces/RpcConfig.md)\>

#### Returns

`void`

***

### estimateFee()

> **estimateFee**(`_operation?`): `Promise`\<\{ `minFee`: `number`; `suggestedFee`: `number`; \}\>

Defined in: [network/rpc.service.ts:121](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/network/rpc.service.ts#L121)

Estimate fee using Horizon's fee stats endpoint.

#### Parameters

##### \_operation?

`Operation2`\<`Operation`\>

#### Returns

`Promise`\<\{ `minFee`: `number`; `suggestedFee`: `number`; \}\>

***

### getCircuitState()

> **getCircuitState**(): `"closed"` \| `"open"` \| `"half-open"`

Defined in: [network/rpc.service.ts:140](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/network/rpc.service.ts#L140)

Get the current state of the circuit breaker

#### Returns

`"closed"` \| `"open"` \| `"half-open"`

***

### getLedger()

> **getLedger**(`options?`): `Promise`\<`GetLatestLedgerResponse`\>

Defined in: [network/rpc.service.ts:101](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/network/rpc.service.ts#L101)

Fetch latest ledger from Soroban RPC

#### Parameters

##### options?

`RequestOptions` = `{}`

#### Returns

`Promise`\<`GetLatestLedgerResponse`\>

***

### getServer()

> **getServer**(): `RpcServer`

Defined in: [network/rpc.service.ts:49](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/network/rpc.service.ts#L49)

Get underlying rpc.Server

#### Returns

`RpcServer`

***

### getTransaction()

> **getTransaction**(`hash`): `Promise`\<`GetTransactionResponse`\>

Defined in: [network/rpc.service.ts:112](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/network/rpc.service.ts#L112)

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

Defined in: [network/rpc.service.ts:156](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/network/rpc.service.ts#L156)

Returns true if the service is operating in a degraded mode:
- Circuit breaker is open or half-open, OR
- Currently experiencing consecutive failures (> 0)

#### Returns

`boolean`

***

### sendTransaction()

> **sendTransaction**(`tx`, `options?`): `Promise`\<`SendTransactionResponse`\>

Defined in: [network/rpc.service.ts:93](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/network/rpc.service.ts#L93)

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

Defined in: [network/rpc.service.ts:59](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/network/rpc.service.ts#L59)

Override RPC endpoint

#### Parameters

##### url

`string`

#### Returns

`void`

***

### setFetchClient()

> **setFetchClient**(`client`): `void`

Defined in: [network/rpc.service.ts:75](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/network/rpc.service.ts#L75)

Set custom fetch-compatible client

#### Parameters

##### client

`any`

#### Returns

`void`

***

### setHeaders()

> **setHeaders**(`headers`): `void`

Defined in: [network/rpc.service.ts:80](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/network/rpc.service.ts#L80)

Set default HTTP headers (e.g. API keys)

#### Parameters

##### headers

`Record`\<`string`, `string`\>

#### Returns

`void`

***

### simulateTransaction()

> **simulateTransaction**(`tx`, `options?`): `Promise`\<`SimulateTransactionResponse`\>

Defined in: [network/rpc.service.ts:85](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/network/rpc.service.ts#L85)

Simulate transaction with automatic failover

#### Parameters

##### tx

`any`

##### options?

`RequestOptions` = `{}`

#### Returns

`Promise`\<`SimulateTransactionResponse`\>
