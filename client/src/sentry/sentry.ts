/**
 * sentry.ts — browser error-reporting sink for the Tikka client.
 *
 * Mirrors `backend/src/sentry/sentry.ts`: the options builder is a pure
 * function so it can be unit-tested without side effects, `beforeSend` scrubs
 * every event, and reporting is a no-op unless a DSN is configured.
 *
 * Wiring:
 *  - `initClientSentry()` is called from `src/main.tsx` before the app renders.
 *  - `installGlobalErrorHandlers()` reports uncaught exceptions and unhandled
 *    promise rejections.
 *  - `ErrorBoundary` and `services/sdkClient.ts` call `captureClientError`.
 *
 * `@sentry/react` is imported lazily: when `VITE_SENTRY_DSN` is blank (local
 * development, vitest) the SDK chunk is never fetched and nothing is sent.
 */

import type * as Sentry from '@sentry/react';
import { logger } from '../utils/logger';
import { getCorrelationId, getRecentCorrelationIds } from './correlation';
import { hashWallet, scrubPii, scrubSentryEvent } from './redaction';

type SentryModule = typeof import('@sentry/react');

/** Default share of error events forwarded to Sentry. */
export const DEFAULT_ERROR_SAMPLE_RATE = 0.25;

/** Default share of performance transactions traced. */
export const DEFAULT_TRACES_SAMPLE_RATE = 0.05;

/**
 * Once initialised this holds the in-flight `@sentry/react` import. When it is
 * null the sink is disabled and `captureClientError` is a no-op — that keeps
 * the Sentry chunk out of the network graph unless a DSN is actually set.
 */
let sentryModulePromise: Promise<SentryModule> | null = null;

/** Environment variables the client sink reads (a subset of `import.meta.env`). */
export interface ClientSentryEnv {
  VITE_SENTRY_DSN?: string;
  VITE_SENTRY_ENVIRONMENT?: string;
  VITE_APP_ENV?: string;
  VITE_SENTRY_SAMPLE_RATE?: string | number;
  VITE_SENTRY_TRACES_SAMPLE_RATE?: string | number;
  MODE?: string;
}

export interface ClientSentryOptions {
  dsn: string;
  environment: string;
  sampleRate: number;
  tracesSampleRate: number;
  sendDefaultPii: boolean;
  beforeSend: (event: Sentry.ErrorEvent) => Sentry.ErrorEvent | null;
}

/** Clamp a raw sample-rate value into [0, 1], falling back when not a number. */
function toSampleRate(value: string | number | undefined, fallback: number): number {
  if (value === undefined || value === '') {
    return fallback;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(1, Math.max(0, parsed));
}

/**
 * Build the Sentry init options from environment variables.
 * Exported as a pure function so it can be unit-tested without side effects.
 * Returns null when no DSN is configured — the caller then skips `init`.
 */
export function buildSentryOptions(
  envInput: ClientSentryEnv,
): ClientSentryOptions | null {
  const dsn = envInput.VITE_SENTRY_DSN?.trim();
  if (!dsn) {
    return null;
  }

  const environment =
    envInput.VITE_SENTRY_ENVIRONMENT?.trim() ||
    envInput.VITE_APP_ENV?.trim() ||
    'development';

  return {
    dsn,
    environment,
    // Errors are sampled to bound ingest volume; traces are sampled hard.
    sampleRate: toSampleRate(envInput.VITE_SENTRY_SAMPLE_RATE, DEFAULT_ERROR_SAMPLE_RATE),
    tracesSampleRate: toSampleRate(
      envInput.VITE_SENTRY_TRACES_SAMPLE_RATE,
      DEFAULT_TRACES_SAMPLE_RATE,
    ),
    sendDefaultPii: false,
    /**
     * Strip sensitive data from every event before it leaves the browser.
     * Defence-in-depth on top of the per-scope scrubbing in `captureClientError`.
     */
    beforeSend: (event: Sentry.ErrorEvent) =>
      scrubSentryEvent(event as Sentry.Event) as Sentry.ErrorEvent,
  };
}

/** True in a real browser (jsdom counts); false in Node/SSR. */
export function isBrowserEnvironment(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

/**
 * Initialize the client sink. Call once from `src/main.tsx` before rendering.
 * Safe to call when the DSN is absent — logs and returns false.
 */
export async function initClientSentry(
  env: ClientSentryEnv = import.meta.env as unknown as ClientSentryEnv,
): Promise<boolean> {
  if (!isBrowserEnvironment()) {
    logger.log('Client Sentry skipped: non-browser environment');
    return false;
  }

  const options = buildSentryOptions(env);
  if (!options) {
    logger.warn('VITE_SENTRY_DSN not set — client Sentry is disabled');
    return false;
  }

  if (!sentryModulePromise) {
    sentryModulePromise = import('@sentry/react');
  }

  try {
    const sentry = await sentryModulePromise;
    sentry.init(options);
  } catch (error) {
    sentryModulePromise = null;
    logger.warn('Client Sentry failed to initialize', error);
    return false;
  }

  logger.log(`Client Sentry initialized (env=${options.environment})`);
  return true;
}

/** True once `initClientSentry` has installed a client. */
export function isClientSentryEnabled(): boolean {
  return sentryModulePromise !== null;
}

/** Where a reported error came from — attached as the `source` tag. */
export type ClientErrorSource =
  | 'error-boundary'
  | 'unhandled-rejection'
  | 'window-error'
  | 'sdk-transaction'
  | 'manual';

export interface ClientErrorContext {
  source: ClientErrorSource;
  /** Overrides the ambient correlation id (rarely needed). */
  correlationId?: string | null;
  /** Raw wallet address — hashed before attaching; never sent as-is. */
  walletAddress?: string | null;
  /** Extra structured context, scrubbed before attaching. */
  extra?: Record<string, unknown>;
  /** Additional tags. */
  tags?: Record<string, string>;
}

/** Coerce anything thrown into an Error without leaking raw payloads. */
export function toClientError(value: unknown): Error {
  if (value instanceof Error) {
    return value;
  }

  if (typeof value === 'string') {
    return new Error(value);
  }

  try {
    const scrubbed = scrubPii(value);
    const serialized = typeof scrubbed === 'string' ? scrubbed : JSON.stringify(scrubbed);
    return new Error(serialized ?? 'Unknown client error');
  } catch {
    return new Error('Unknown client error');
  }
}

/**
 * Report an error to the client sink.
 *
 * Attaches the `source` tag, the backend `request_id` (from the most recent
 * API response), a hashed `wallet_hash` when a wallet is known, and scrubbed
 * structured context. Never throws — telemetry must not break the app.
 */
export function captureClientError(error: unknown, context: ClientErrorContext): void {
  const pending = sentryModulePromise;
  if (!pending) {
    logger.debug('Client Sentry not initialized; error not reported', error);
    return;
  }

  const normalized = toClientError(error);

  void pending
    .then((sentry) => {
      sentry.withScope((scope) => {
        scope.setTag('source', context.source);
        scope.setTag('client', 'true');

        const correlationId = context.correlationId ?? getCorrelationId();
        if (correlationId) {
          scope.setTag('request_id', correlationId);
        }

        const recentCorrelationIds = getRecentCorrelationIds();
        if (recentCorrelationIds.length > 0) {
          scope.setContext('client_request_ids', {
            recent: [...recentCorrelationIds],
          });
        }

        const walletHash = hashWallet(context.walletAddress);
        if (walletHash) {
          scope.setTag('wallet_hash', walletHash);
          scope.setUser({ id: walletHash });
        }

        for (const [key, value] of Object.entries(context.tags ?? {})) {
          scope.setTag(key, value);
        }

        if (context.extra && Object.keys(context.extra).length > 0) {
          scope.setContext('client_context', scrubPii(context.extra) as Record<string, unknown>);
        }

        scope.setLevel('error');
        sentry.captureException(normalized);
      });
    })
    .catch((captureError: unknown) => {
      logger.warn('Client Sentry capture failed', captureError);
    });
}

export interface GlobalErrorHandlersOptions {
  /** Override the event target (tests pass a stub window). */
  target?: Window;
}

/**
 * Listen for uncaught exceptions and unhandled promise rejections and feed
 * them to `captureClientError`. Returns a disposer that removes the listeners.
 */
export function installGlobalErrorHandlers(
  options: GlobalErrorHandlersOptions = {},
): () => void {
  const target = options.target ?? (typeof window !== 'undefined' ? window : undefined);
  if (!target) {
    return () => {};
  }

  // React error boundaries and window listeners can both observe the same
  // failure; report each error object once.
  const reported = new WeakSet<object>();

  const onUnhandledRejection = (event: PromiseRejectionEvent): void => {
    const reason: unknown = event.reason;
    const error = toClientError(reason);
    if (reported.has(error)) {
      return;
    }
    reported.add(error);
    captureClientError(error, {
      source: 'unhandled-rejection',
      extra: { reasonType: reason instanceof Error ? reason.name : typeof reason },
    });
  };

  const onWindowError = (event: ErrorEvent): void => {
    const candidate: unknown = event.error;
    // Ignore resource-load `error` events (missing image/script) — they carry no
    // Error and would flood the sink with noise.
    if (!(candidate instanceof Error) && !event.message) {
      return;
    }

    const error = candidate instanceof Error ? candidate : toClientError(event.message);
    if (reported.has(error)) {
      return;
    }
    reported.add(error);
    captureClientError(error, {
      source: 'window-error',
      extra: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    });
  };

  target.addEventListener('unhandledrejection', onUnhandledRejection);
  target.addEventListener('error', onWindowError);

  return () => {
    target.removeEventListener('unhandledrejection', onUnhandledRejection);
    target.removeEventListener('error', onWindowError);
  };
}
