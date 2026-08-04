[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / subscribeToEvents

# Function: subscribeToEvents()

> **subscribeToEvents**(`options`): [`EventSubscriptionHandle`](../interfaces/EventSubscriptionHandle.md)

Defined in: [network/event-subscription.ts:94](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/network/event-subscription.ts#L94)

Polls Soroban contract events with automatic reconnect (exponential backoff)
and resume from the last processed cursor/event id.

## Parameters

### options

[`EventSubscriptionOptions`](../interfaces/EventSubscriptionOptions.md)

## Returns

[`EventSubscriptionHandle`](../interfaces/EventSubscriptionHandle.md)
