[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / EventSubscriptionHandle

# Interface: EventSubscriptionHandle

Defined in: [network/event-subscription.ts:34](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/network/event-subscription.ts#L34)

## Methods

### getLastProcessedEventId()

> **getLastProcessedEventId**(): `string` \| `undefined`

Defined in: [network/event-subscription.ts:39](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/network/event-subscription.ts#L39)

Id of the last event delivered to `onEvent`.

#### Returns

`string` \| `undefined`

***

### getResumeCursor()

> **getResumeCursor**(): `string`

Defined in: [network/event-subscription.ts:37](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/network/event-subscription.ts#L37)

Cursor that will be used on the next getEvents call.

#### Returns

`string`

***

### stop()

> **stop**(): `void`

Defined in: [network/event-subscription.ts:35](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/network/event-subscription.ts#L35)

#### Returns

`void`

## Properties

### done

> **done**: `Promise`\<`void`\>

Defined in: [network/event-subscription.ts:41](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/network/event-subscription.ts#L41)

Resolves when the poll loop exits after `stop()`.
