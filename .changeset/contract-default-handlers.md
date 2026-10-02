---
'@tikka/sdk': patch
---

Add canonical contract event bindings for the indexer handler-registry check.

`ContractEvent` in `sdk/src/contract/bindings.ts` is now the single source of
truth for the topic names the raffle contract emits. The indexer's handler
tests parse that file and fail when a default handler is added or removed
without the binding being updated, so an event can no longer be silently
dropped. The binding stays off the SDK's public entry point, so the published
API surface is unchanged.
