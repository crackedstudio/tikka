# Client Sentry Error Telemetry

Browser counterpart of `backend/src/sentry/`. It reports uncaught client errors
so a broken route cannot sit unnoticed behind a clean backend dashboard.

## Wiring

| Call site | What it reports |
|---|---|
| `src/main.tsx` → `initClientSentry()` | initialises the sink before first render |
| `src/main.tsx` → `installGlobalErrorHandlers()` | `error` and `unhandledrejection` listeners |
| `components/ui/ErrorBoundary.tsx` → `componentDidCatch` | every route-level render error, with its component stack |
| `services/sdkClient.ts` → pipeline failures | failed create / buy / claim transactions |

All of them funnel through `captureClientError(error, context)`, which tags the
event with `source` (`error-boundary`, `unhandled-rejection`, `window-error`,
`sdk-transaction`, `manual`).

## Correlation

Every backend response carries the request id set by `RequestIdMiddleware`
(`x-request-id` header, plus `requestId` in error bodies). `apiClient` records
it via `extractCorrelationId`, and `captureClientError` tags the event with the
most recent id as `request_id` — the same tag the backend attaches in
`setSentryRequestContext`. A client error therefore joins its server trace and
the backend's own Sentry events. The last five ids are attached as the
`client_request_ids` context so concurrent requests stay inspectable.

## What is redacted

| Data | Treatment |
|---|---|
| `Authorization`, `cookie`, `x-api-key`, `token`, `signature` | `[REDACTED]` |
| `email`, `phone`, `name` PII fields | `[REDACTED]` |
| XDR fields (`signedXdr`, `assembledXdr`, `envelope`, `xdr`, …) | `[REDACTED_XDR]` |
| Long base64 blobs (≥ 120 chars) in free text | `[REDACTED_XDR]` |
| Stellar addresses / secret seeds (`G…`, `S…`) in strings | 16-char fingerprint |
| Request bodies | dropped entirely |
| Strings longer than 2048 chars | truncated |
| `sendDefaultPii` | `false` |

### Wallet fingerprints

`hashWallet` uses a synchronous FNV-1a hash (16 hex chars) because
`crypto.subtle.digest` is async-only and a scrubber that awaited would leak the
raw address into the event first. The fingerprint is stable per wallet for
grouping, but it is **not** byte-comparable with the backend's SHA-256
`wallet_hash`; join client and server errors on `request_id`, not on
`wallet_hash`.

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `VITE_SENTRY_DSN` | Prod only | (empty) | Empty = sink disabled, no events sent |
| `VITE_SENTRY_SAMPLE_RATE` | No | `0.25` | Fraction of error events sent |
| `VITE_SENTRY_TRACES_SAMPLE_RATE` | No | `0.05` | Fraction of transactions traced |
| `VITE_SENTRY_ENVIRONMENT` | No | `VITE_APP_ENV` / `development` | Event environment tag |

## Local development

Leave `VITE_SENTRY_DSN` blank. `initClientSentry` logs a warning and returns
without importing `@sentry/react`, so local runs neither download the SDK chunk
nor send anything.

## Tests

`redaction.spec.ts`, `correlation.spec.ts` and `sentry.spec.ts` cover the
scrubbing rules, the correlation window and `captureClientError` tagging.
