# Sentry Error Telemetry

## What is captured
Every unhandled exception is sent to Sentry with:
- `request_id` — correlation ID for cross-referencing logs
- `route` — route template (e.g. `POST /api/raffles/:id`), never raw URL
- `status` — HTTP response status code
- `wallet_hash` — SHA-256 of the authenticated wallet address, first 16 hex chars
- `error_class` — exception constructor name

## What is redacted
| Data | Treatment |
|----------------------------|------------------------------------|
| `Authorization` header | Fully replaced with `[REDACTED]` |
| `x-api-key` header | Fully replaced with `[REDACTED]` |
| `x-wallet-signature` header| Fully replaced with `[REDACTED]` |
| `cookie` / `set-cookie` | Fully replaced with `[REDACTED]` |
| `token`, `signature`, `privateKey`, `seed`, `mnemonic` body fields | `[REDACTED]` |
| `email`, `phone`, `name` PII fields | `[REDACTED]` |
| `walletAddress`, `publicKey`, `address` fields | `[wallet-hash:<16hex>]` |
| Raw request body | Never attached to Sentry scope |
| `sendDefaultPii` | `false` — Sentry default PII off |

## Wallet hashing
Raw wallet addresses are never sent to Sentry. Instead, a deterministic SHA-256
hash (first 16 hex characters) is attached as the `wallet_hash` tag. This allows
correlating errors for a specific wallet in the Sentry dashboard without storing
the address. The hash cannot feasibly be reversed to recover the original address.

## Adding new sensitive fields
To redact a new field, add it to the appropriate list in `redaction.constants.ts`:
- Auth headers → `REDACTED_HEADERS`
- Token/key body fields → `REDACTED_BODY_FIELDS`
- Wallet address fields → `HASHED_WALLET_FIELDS`
- PII fields → `REDACTED_PII_FIELDS`

The `redactObject` function recurses into nested objects and arrays, so adding a
field name to the constants is sufficient — no other code changes are needed.

## Environment variables
| Variable | Required | Default | Description |
|-----------------------------|----------|---------------|---------------------------|
| `SENTRY_DSN` | Prod only| (empty) | Empty = Sentry disabled |
| `SENTRY_ENVIRONMENT` | No | development | Event environment tag |
| `SENTRY_TRACES_SAMPLE_RATE` | No | 0.1 | Fraction of traced reqs |

## Local development
Leave `SENTRY_DSN` blank. `beforeSend` returns `null` when DSN is absent,
so no events are sent and no errors occur during local development.
