[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / EventSubscriptionOptions

# Interface: EventSubscriptionOptions

Defined in: [network/event-subscription.ts:13](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/network/event-subscription.ts#L13)

## Properties

### filters

> **filters**: `EventFilter`[]

Defined in: [network/event-subscription.ts:16](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/network/event-subscription.ts#L16)

***

### getEvents

> **getEvents**: (`request`) => `Promise`\<`GetEventsResponse`\>

Defined in: [network/event-subscription.ts:15](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/network/event-subscription.ts#L15)

Soroban RPC getEvents (typically `server.getEvents.bind(server)`).

#### Parameters

##### request

`GetEventsRequest`

#### Returns

`Promise`\<`GetEventsResponse`\>

***

### initialCursor?

> `optional` **initialCursor?**: `string`

Defined in: [network/event-subscription.ts:22](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/network/event-subscription.ts#L22)

Resume cursor; omit to start from `startLedger` (default: 1).

***

### limit?

> `optional` **limit?**: `number`

Defined in: [network/event-subscription.ts:20](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/network/event-subscription.ts#L20)

Page size for getEvents (default 100).

***

### onError?

> `optional` **onError?**: (`error`) => `void`

Defined in: [network/event-subscription.ts:26](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/network/event-subscription.ts#L26)

#### Parameters

##### error

`unknown`

#### Returns

`void`

***

### onEvent

> **onEvent**: (`event`) => `void` \| `Promise`\<`void`\>

Defined in: [network/event-subscription.ts:25](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/network/event-subscription.ts#L25)

#### Parameters

##### event

`EventResponse`

#### Returns

`void` \| `Promise`\<`void`\>

***

### onGapWarning?

> `optional` **onGapWarning?**: (`warning`) => `void`

Defined in: [network/event-subscription.ts:28](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/network/event-subscription.ts#L28)

#### Parameters

##### warning

[`EventGapWarning`](EventGapWarning.md)

#### Returns

`void`

***

### onReconnect?

> `optional` **onReconnect?**: (`attempt`, `delayMs`, `error`) => `void`

Defined in: [network/event-subscription.ts:27](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/network/event-subscription.ts#L27)

#### Parameters

##### attempt

`number`

##### delayMs

`number`

##### error

`unknown`

#### Returns

`void`

***

### pollIntervalMs?

> `optional` **pollIntervalMs?**: `number`

Defined in: [network/event-subscription.ts:18](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/network/event-subscription.ts#L18)

Polling interval between successful fetches (default 5000).

***

### retry?

> `optional` **retry?**: `Pick`\<[`RetryOptions`](RetryOptions.md), `"baseDelayMs"` \| `"maxDelayMs"`\>

Defined in: [network/event-subscription.ts:29](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/network/event-subscription.ts#L29)

***

### sleep?

> `optional` **sleep?**: (`ms`) => `Promise`\<`void`\>

Defined in: [network/event-subscription.ts:31](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/network/event-subscription.ts#L31)

Injectable sleep (tests).

#### Parameters

##### ms

`number`

#### Returns

`Promise`\<`void`\>

***

### startLedger?

> `optional` **startLedger?**: `number`

Defined in: [network/event-subscription.ts:24](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/network/event-subscription.ts#L24)

Used when no cursor is available (default: 1). Prefer a recent ledger in production.
