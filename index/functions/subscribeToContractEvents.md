[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / subscribeToContractEvents

# Function: subscribeToContractEvents()

> **subscribeToContractEvents**(`server`, `options`): [`EventSubscriptionHandle`](../interfaces/EventSubscriptionHandle.md)

Defined in: [network/event-subscription.ts:180](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/network/event-subscription.ts#L180)

Convenience wrapper around rpc.Server.getEvents.

## Parameters

### server

`RpcServer`

### options

`Omit`\<[`EventSubscriptionOptions`](../interfaces/EventSubscriptionOptions.md), `"getEvents"`\>

## Returns

[`EventSubscriptionHandle`](../interfaces/EventSubscriptionHandle.md)
