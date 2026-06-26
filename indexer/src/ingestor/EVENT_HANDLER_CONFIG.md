# Event handler config validation

The external event handler config (`config/event-handlers.json`) is validated at
startup so that an invalid event name, unsupported version, or unknown handler
fails the boot loudly instead of silently disabling ingestion.

## What is validated

Validation runs in `EventHandlersModule.onModuleInit` against the handlers that
are actually registered, via `validateEventHandlerConfig` in
`event-handler-config.ts`.

Structural (all contracts):
- root is an object with a `contracts` array;
- each contract has a non-empty string `address`, a string `version`, and a
  boolean `enabled`;
- `eventHandlers` / `defaultHandlers`, when present, are objects.

Referential (enabled contracts and `defaultHandlers` only):
- `version` must be a supported schema version (`v1`, `v2`);
- each event name must be known (a canonical `DomainEvent` name or an event a
  registered handler declares);
- each handler class name must exist among the registered handlers;
- the named handler must actually handle the event it is mapped to.

Disabled contracts are only structurally validated, so inactive templates (for
handlers not yet wired in) do not block boot.

## Fail-fast behaviour

- Invalid config → `ConfigValidationError` is thrown with **every** issue listed
  in the message, and the process fails to boot. Bad config can never silently
  disable ingestion.
- Missing config file → a warning is logged and the built-in
  `DEFAULT_EVENT_HANDLER_CONFIG` (the standard raffle contract) is used, so
  ingestion still works out of the box.
- Malformed JSON → `ConfigValidationError` (the file exists but cannot be
  parsed).

The config path is read from `EVENT_HANDLER_CONFIG_PATH`
(default `config/event-handlers.json`), resolved against the working directory.

## Example error

```
ConfigValidationError: Invalid event handler config (2 issues):
  - contracts[0] (CDLZ...): version "v99" is not supported (supported: v1, v2)
  - contracts[0] (CDLZ...): handler "GhostHandler" for event "RaffleCreated" does not exist
```

## Tests

`event-handler-config.spec.ts` covers missing handler, unknown event, invalid
version, handler/event mismatch, structural errors, and valid config.
