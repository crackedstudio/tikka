# Contract event schema versioning

Every Tikka contract event carries an explicit schema version so that future
contract changes do not break ingestion of events emitted by older contract
builds. Version handling lives in `schema-version.ts`.

## Constants & mappers

- `CURRENT_SCHEMA_VERSION` â€” the version emitted by the current contract build.
- `SUPPORTED_SCHEMA_VERSIONS` â€” every version this indexer build can decode.
- `isSupportedSchemaVersion(v)` â€” guard used before dispatch.
- `resolveSchemaVersion(rawEvent)` â€” the single place version detection lives.
  Prefers an explicit `schemaVersion` / `schema_version` field on the raw
  event; otherwise defaults to `CURRENT_SCHEMA_VERSION`.
- `assertSupportedSchemaVersion(v)` / `UnsupportedSchemaVersionError` â€” throw an
  actionable error for unknown versions.

## Flow

1. **Parse** â€” `EventParserService` resolves the version with
   `resolveSchemaVersion` (replacing the old, buggy "read topic[1]" logic) and
   passes it to the registry.
2. **Tag** — `BaseEventHandler.parse` (the single template method every
   handler inherits) tags each event with the resolved version, so the typed
   `DomainEvent` union *requires* a `schemaVersion` on every variant. Legacy
   events with no explicit version resolve to v1 and still parse. The registry
   keeps the handler-set version, falling back to the routing version so
   events from untyped third-party handlers also carry a version.
3. **Dispatch** — `IngestionDispatcherService` checks
   `isSupportedSchemaVersion(event.schemaVersion)` before running any handler.
   Unsupported versions are dead-lettered with reason `SCHEMA_UNSUPPORTED` and
   are never mis-parsed.
4. **Store** â€” the parsed version is persisted consistently in `raffle_events`
   (`schema_version` column) by the raffle processors and the dispatcher's admin
   event rows, instead of a hard-coded `1`.

## Dead-letter records

In-memory DLQ records (`DeadLetterEvent`) now include:

- `schemaVersion` â€” the version of the failed event;
- `reason` â€” a `DlqReason` (`SCHEMA_UNSUPPORTED`, `HANDLER_ERROR`, â€¦),

so operators can triage failures by version and cause.

## Adding a new schema version

1. Bump `CURRENT_SCHEMA_VERSION` and add the previous version to
   `SUPPORTED_SCHEMA_VERSIONS`.
2. Register a version-specific handler (the registry routes by
   `(contract, event, schemaVersion)`), or update the existing handler to branch
   on `rawEvent` version.
3. Add decode tests covering both the old and new versions.

Events with versions outside `SUPPORTED_SCHEMA_VERSIONS` are dead-lettered, not
dropped â€” see `schema-version.spec.ts` and the dispatcher spec.
