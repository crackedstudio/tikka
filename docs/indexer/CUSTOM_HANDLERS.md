# Custom event handlers

The indexer decodes Soroban events into first-party domain events. Each event
type is handled by a class that implements `IEventHandler`, and every handler
that should run in production is listed in
`indexer/src/ingestor/handlers/all-handlers.ts`.

This page is the contract; `indexer/examples/third-party-raffle.handler.ts` is a
worked example of a handler for a third-party contract with a different event
schema.

## The contract

A handler has one job: turn one raw Soroban event into the domain event the rest
of the system already understands.

1. **Declare the event name it claims.** `BaseEventHandler` takes it in the
   constructor (`super("DrawTriggered")`). The registry dispatches by that name, so
   two handlers claiming the same one is a bug — `event-coverage.spec.ts` guards
   it.
2. **Decode through `decode-utils`.** Topics and the event body arrive as
   `xdr`/`scVal` values. `asNumber`, `asString`, `asRecord`, `pickString`,
   `pickNumber`, `pickBoolean` and `toNativeValue` exist so the decoding stays
   readable and consistent across handlers. Do not hand-roll `scValToNative`
   calls in a handler.
3. **Return a first-party event, not a new shape.** A third-party contract with a
   different schema still produces the same `RaffleCreatedEvent`, `TicketPurchased`
   and so on. Downstream consumers (processors, persistence, caches) are typed
   against those, so mapping happens here rather than spreading a second schema
   through the codebase.
4. **Stay pure.** No database writes, no network calls, no clock or randomness:
   decoding only. Everything downstream of a handler assumes it can be replayed
   over historical events.
5. **Fail loudly on unexpected input.** If required fields are missing or a type
   does not match, throw — the ingestor records the failure and the event is
   visible in the dead-letter path. A handler that silently returns a partial
   event hides data problems.

## Registering a handler

Add the class to the `handlers` array in
`indexer/src/ingestor/handlers/all-handlers.ts`. Nothing else registers
handlers, and a handler that is not in that list never runs — an example class
left under `src/` is compiled into the build without being registered, which is
exactly the confusion this page exists to prevent.

## Where example code lives

Worked examples live **outside `src/`**, in `indexer/examples/` (and
`oracle/examples/`), and `tsconfig.build.json` excludes `**/examples/**` and
`**/*.example.ts` from the compiled output. They stay inside the package, so
`pnpm --filter tikka-indexer typecheck` still checks them against the real
interfaces — an example that no longer compiles is a broken page, and the
typecheck says so.

`indexer/examples/third-party-raffle.handler.ts` is not registered anywhere: it
is never loaded by `all-handlers.ts`, and a test can therefore treat it purely as
documentation.

## Testing a handler

Handlers are tested directly — construct the handler, hand it a raw event shaped
like the chain produces, assert on the returned domain event. Existing coverage
worth reading before writing new tests:

- `indexer/src/ingestor/handlers/event-coverage.spec.ts` — every event name has
  exactly one handler.
- `indexer/src/ingestor/handlers/raffle-cancelled.handler.spec.ts` — a handler
  spec with real event fixtures.
- `indexer/src/test/integration/migration-smoke.integration.spec.ts` — the
  end-to-end path from events to storage.
