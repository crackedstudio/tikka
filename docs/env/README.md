# Environment Variables

This catalog reflects variables read by each service's config loader, startup
validation, and explicitly documented operational scripts. `Required` describes
what must be supplied for the relevant startup path; `Conditional` means a
setting is required only for a selected provider or fallback mode. Defaults
are those applied by code when a variable is omitted.

| Service | Reference | Example |
| --- | --- | --- |
| Backend | [Backend environment](backend.md) | [`backend/.env.example`](../../backend/.env.example) |
| Indexer | [Indexer environment](indexer.md) | [`indexer/.env.example`](../../indexer/.env.example) |
| Oracle | [Oracle environment](oracle.md) | [`oracle/.env.example`](../../oracle/.env.example) |
| Client | [Client environment](client.md) | [`client/.env.example`](../../client/.env.example) |

The root [`.env.example`](../../.env.example) is for Docker Compose's local
PostgreSQL container. The SDK example has task-specific settings in
[`sdk/examples/.env.example`](../../sdk/examples/.env.example).
