[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / RetryOptions

# Interface: RetryOptions

Defined in: [utils/retry.ts:1](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/utils/retry.ts#L1)

## Properties

### baseDelayMs?

> `optional` **baseDelayMs?**: `number`

Defined in: [utils/retry.ts:3](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/utils/retry.ts#L3)

***

### maxAttempts?

> `optional` **maxAttempts?**: `number`

Defined in: [utils/retry.ts:2](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/utils/retry.ts#L2)

***

### maxDelayMs?

> `optional` **maxDelayMs?**: `number`

Defined in: [utils/retry.ts:4](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/utils/retry.ts#L4)

***

### onRetry?

> `optional` **onRetry?**: (`attempt`, `error`, `delay`) => `void`

Defined in: [utils/retry.ts:6](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/utils/retry.ts#L6)

#### Parameters

##### attempt

`number`

##### error

`any`

##### delay

`number`

#### Returns

`void`

***

### retryOn?

> `optional` **retryOn?**: (`string` \| `number`)[]

Defined in: [utils/retry.ts:5](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/utils/retry.ts#L5)
