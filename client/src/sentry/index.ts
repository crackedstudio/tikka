/**
 * Client error-reporting sink.
 *
 * Public surface for the browser-side Sentry integration. Mirror of
 * `backend/src/sentry/`, scoped to the client:
 *
 *  - `initClientSentry`           — call once from `src/main.tsx`
 *  - `installGlobalErrorHandlers` — uncaught errors + unhandled rejections
 *  - `captureClientError`         — report from error boundaries / SDK failures
 *  - redaction helpers            — `scrubPii`, `scrubSentryEvent`, `hashWallet`
 *  - correlation helpers          — `setCorrelationId`, `extractCorrelationId`
 */

export {
  initClientSentry,
  isClientSentryEnabled,
  isBrowserEnvironment,
  buildSentryOptions,
  captureClientError,
  installGlobalErrorHandlers,
  toClientError,
  DEFAULT_ERROR_SAMPLE_RATE,
  DEFAULT_TRACES_SAMPLE_RATE,
} from './sentry';
export type {
  ClientErrorContext,
  ClientErrorSource,
  ClientSentryEnv,
  ClientSentryOptions,
  GlobalErrorHandlersOptions,
} from './sentry';

export {
  hashWallet,
  redactWalletAddresses,
  scrubPii,
  scrubSentryEvent,
  REDACTED_FIELDS,
  REDACTED_TRANSACTION_FIELDS,
  REDACTED_PLACEHOLDER,
  REDACTED_TRANSACTION_PLACEHOLDER,
  DEPTH_LIMIT_PLACEHOLDER,
  MAX_STRING_LENGTH,
  MAX_DEPTH,
} from './redaction';

export {
  CORRELATION_ID_HEADER,
  MAX_RECENT_CORRELATION_IDS,
  clearCorrelationIds,
  extractCorrelationId,
  getCorrelationId,
  getRecentCorrelationIds,
  rememberResponseCorrelationId,
  sanitizeCorrelationId,
  setCorrelationId,
} from './correlation';
