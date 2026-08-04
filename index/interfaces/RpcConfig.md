[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / RpcConfig

# Interface: RpcConfig

Defined in: [network/network.config.ts:19](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/network/network.config.ts#L19)

Low-level RPC configuration (customization layer)

## Properties

### circuitBreakerFailureThreshold?

> `optional` **circuitBreakerFailureThreshold?**: `number`

Defined in: [network/network.config.ts:43](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/network/network.config.ts#L43)

Consecutive failures to trip the circuit breaker (default: 5)

***

### circuitBreakerResetTimeoutMs?

> `optional` **circuitBreakerResetTimeoutMs?**: `number`

Defined in: [network/network.config.ts:45](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/network/network.config.ts#L45)

Cooldown time in ms before transitioning from open to half-open (default: 10_000)

***

### enableRetries?

> `optional` **enableRetries?**: `boolean`

Defined in: [network/network.config.ts:31](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/network/network.config.ts#L31)

Enable retry strategy for transient errors

***

### endpoint?

> `optional` **endpoint?**: `string`

Defined in: [network/network.config.ts:21](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/network/network.config.ts#L21)

Primary RPC endpoint URL

***

### failoverEndpoints?

> `optional` **failoverEndpoints?**: `string`[]

Defined in: [network/network.config.ts:25](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/network/network.config.ts#L25)

Ordered list of fallback endpoints

***

### fetchClient?

> `optional` **fetchClient?**: \{(`input`, `init?`): `Promise`\<`Response`\>; (`input`, `init?`): `Promise`\<`Response`\>; \}

Defined in: [network/network.config.ts:27](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/network/network.config.ts#L27)

Custom fetch-compatible client (e.g. node-fetch, undici)

#### Call Signature

> (`input`, `init?`): `Promise`\<`Response`\>

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Window/fetch)

##### Parameters

###### input

`RequestInfo` \| `URL`

###### init?

`RequestInit`

##### Returns

`Promise`\<`Response`\>

#### Call Signature

> (`input`, `init?`): `Promise`\<`Response`\>

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Window/fetch)

##### Parameters

###### input

`string` \| `Request` \| `URL`

###### init?

`RequestInit`

##### Returns

`Promise`\<`Response`\>

***

### headers?

> `optional` **headers?**: `Record`\<`string`, `string`\>

Defined in: [network/network.config.ts:23](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/network/network.config.ts#L23)

Custom HTTP headers (e.g. API keys)

***

### maxRetryAttempts?

> `optional` **maxRetryAttempts?**: `number`

Defined in: [network/network.config.ts:33](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/network/network.config.ts#L33)

Max retry attempts per endpoint

***

### maxRetryDelayMs?

> `optional` **maxRetryDelayMs?**: `number`

Defined in: [network/network.config.ts:39](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/network/network.config.ts#L39)

Maximum retry delay in ms (default: 8000)

***

### retryableStatusCodes?

> `optional` **retryableStatusCodes?**: (`string` \| `number`)[]

Defined in: [network/network.config.ts:41](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/network/network.config.ts#L41)

HTTP status codes that should trigger retry

***

### retryBackoffFactor?

> `optional` **retryBackoffFactor?**: `number`

Defined in: [network/network.config.ts:37](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/network/network.config.ts#L37)

Exponential backoff factor

***

### retryBaseDelayMs?

> `optional` **retryBaseDelayMs?**: `number`

Defined in: [network/network.config.ts:35](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/network/network.config.ts#L35)

Initial retry delay in milliseconds

***

### timeoutMs?

> `optional` **timeoutMs?**: `number`

Defined in: [network/network.config.ts:29](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/network/network.config.ts#L29)

Per-request timeout in ms (default: 30_000)
