[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / RpcConfig

# Interface: RpcConfig

Defined in: [network/network.config.ts:18](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/network/network.config.ts#L18)

Low-level RPC configuration (customization layer)

## Properties

### circuitBreakerFailureThreshold?

> `optional` **circuitBreakerFailureThreshold?**: `number`

Defined in: [network/network.config.ts:42](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/network/network.config.ts#L42)

Consecutive failures to trip the circuit breaker (default: 5)

***

### circuitBreakerResetTimeoutMs?

> `optional` **circuitBreakerResetTimeoutMs?**: `number`

Defined in: [network/network.config.ts:44](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/network/network.config.ts#L44)

Cooldown time in ms before transitioning from open to half-open (default: 10_000)

***

### enableRetries?

> `optional` **enableRetries?**: `boolean`

Defined in: [network/network.config.ts:30](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/network/network.config.ts#L30)

Enable retry strategy for transient errors

***

### endpoint?

> `optional` **endpoint?**: `string`

Defined in: [network/network.config.ts:20](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/network/network.config.ts#L20)

Primary RPC endpoint URL

***

### failoverEndpoints?

> `optional` **failoverEndpoints?**: `string`[]

Defined in: [network/network.config.ts:24](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/network/network.config.ts#L24)

Ordered list of fallback endpoints

***

### fetchClient?

> `optional` **fetchClient?**: \{(`input`, `init?`): `Promise`\<`Response`\>; (`input`, `init?`): `Promise`\<`Response`\>; \}

Defined in: [network/network.config.ts:26](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/network/network.config.ts#L26)

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

Defined in: [network/network.config.ts:22](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/network/network.config.ts#L22)

Custom HTTP headers (e.g. API keys)

***

### maxRetryAttempts?

> `optional` **maxRetryAttempts?**: `number`

Defined in: [network/network.config.ts:32](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/network/network.config.ts#L32)

Max retry attempts per endpoint

***

### maxRetryDelayMs?

> `optional` **maxRetryDelayMs?**: `number`

Defined in: [network/network.config.ts:38](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/network/network.config.ts#L38)

Maximum retry delay in ms (default: 8000)

***

### retryableStatusCodes?

> `optional` **retryableStatusCodes?**: (`string` \| `number`)[]

Defined in: [network/network.config.ts:40](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/network/network.config.ts#L40)

HTTP status codes that should trigger retry

***

### retryBackoffFactor?

> `optional` **retryBackoffFactor?**: `number`

Defined in: [network/network.config.ts:36](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/network/network.config.ts#L36)

Exponential backoff factor

***

### retryBaseDelayMs?

> `optional` **retryBaseDelayMs?**: `number`

Defined in: [network/network.config.ts:34](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/network/network.config.ts#L34)

Initial retry delay in milliseconds

***

### timeoutMs?

> `optional` **timeoutMs?**: `number`

Defined in: [network/network.config.ts:28](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/network/network.config.ts#L28)

Per-request timeout in ms (default: 30_000)
