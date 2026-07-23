[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / PollConfig

# Interface: PollConfig

Defined in: [contract/lifecycle.ts:75](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/contract/lifecycle.ts#L75)

Configures the polling loop that waits for transaction confirmation.

## Properties

### backoffFactor?

> `optional` **backoffFactor?**: `number`

Defined in: [contract/lifecycle.ts:91](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/contract/lifecycle.ts#L91)

Exponential backoff factor applied to `intervalMs` after each retry.
1.0 = no backoff (constant interval). 1.5 = 50% longer each time.

#### Default

```ts
1.5
```

***

### intervalMs?

> `optional` **intervalMs?**: `number`

Defined in: [contract/lifecycle.ts:85](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/contract/lifecycle.ts#L85)

Initial interval (ms) between poll attempts.

#### Default

```ts
2_000
```

***

### maxIntervalMs?

> `optional` **maxIntervalMs?**: `number`

Defined in: [contract/lifecycle.ts:96](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/contract/lifecycle.ts#L96)

Maximum interval (ms) between poll attempts — caps the backoff growth.

#### Default

```ts
10_000
```

***

### timeoutMs?

> `optional` **timeoutMs?**: `number`

Defined in: [contract/lifecycle.ts:80](https://github.com/crackedstudio/tikka/blob/45e0910a5f258fdf29f73775ec17ee305c47952b/sdk/src/contract/lifecycle.ts#L80)

Maximum time (ms) to wait for the transaction to leave NOT_FOUND status.

#### Default

```ts
60_000
```
