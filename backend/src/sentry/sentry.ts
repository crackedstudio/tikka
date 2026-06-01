import * as Sentry from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { Logger } from '@nestjs/common';
import { createHash } from 'crypto';

// ---------------------------------------------------------------------------
// Sensitive field redaction
// ---------------------------------------------------------------------------

/**
 * Header and body field names that must never appear in Sentry events.
 * Matched case-insensitively against object keys.
 */
export const REDACTED_FIELDS = [
  'authorization',
  'x-admin-token',
  'x-api-key',
  'token',
  'accesstoken',
  'refreshtoken',
  'access_token',
  'refresh_token',
  'signature',
  'privatekey',
  'private_key',
  'secret',
  'password',
  'mnemonic',
  'seed',
] as const;

const MAX_REDACT_DEPTH = 10;

/**
 * Recursively redact sensitive keys from an object before it is sent to Sentry.
 * Arrays are walked element-by-element. Primitives are returned as-is.
 * Depth is capped at MAX_REDACT_DEPTH to prevent stack overflows on deeply
 * nested or circular-adjacent structures from third-party libraries.
 */
export function redactSensitive(value: unknown, depth = 0): unknown {
  if (depth >= MAX_REDACT_DEPTH) return '[DEPTH_LIMIT]';
  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    return value.map((v) => redactSensitive(v, depth + 1));
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = REDACTED_FIELDS.includes(k.toLowerCase() as any)
        ? '[REDACTED]'
        : redactSensitive(v, depth + 1);
    }
    return result;
  }

  return value;
}

// ---------------------------------------------------------------------------
// Wallet hashing
// ---------------------------------------------------------------------------

/**
 * One-way hash of a wallet address for safe attachment to Sentry events.
 * Returns null when the address is absent or blank.
 */
export function hashWallet(address: string | undefined | null): string | null {
  if (!address?.trim()) return null;
  return createHash('sha256').update(address.trim().toLowerCase()).digest('hex').slice(0, 16);
}

// ---------------------------------------------------------------------------
// Sentry init
// ---------------------------------------------------------------------------

export interface IngestionErrorContext {
  /** Stellar ledger sequence number. Omitted from tags if undefined. */
  ledger?: number;
  /** Contract version string. Omitted from tags if undefined. */
  contractVersion?: string;
  /** Blockchain event type (e.g. "ticket_purchased"). Omitted from tags if undefined. */
  eventType?: string;
  /** Raw event payload attached as Sentry context. */
  eventPayload?: unknown;
  /** Raw ledger payload attached as Sentry context. */
  ledgerPayload?: unknown;
}

/**
 * Build the Sentry init options from environment variables.
 * Exported as a pure function so it can be unit-tested without side effects.
 */
export function buildSentryOptions(env: {
  SENTRY_DSN?: string;
  NODE_ENV?: string;
  SENTRY_TRACES_SAMPLE_RATE?: string | number;
}): Sentry.NodeOptions | null {
  const dsn = env.SENTRY_DSN?.trim();
  if (!dsn) return null;

  const tracesSampleRate =
    env.SENTRY_TRACES_SAMPLE_RATE !== undefined
      ? Number(env.SENTRY_TRACES_SAMPLE_RATE)
      : 0.1;

  return {
    dsn,
    environment: env.NODE_ENV ?? 'development',
    tracesSampleRate,
    sendDefaultPii: false,
    integrations: [nodeProfilingIntegration() as any],
    profilesSampleRate: 1.0,
    /**
     * Strip sensitive data from every event before it leaves the process.
     * This is a defence-in-depth measure on top of per-scope redaction.
     */
    beforeSend(event) {
      // Redact request headers
      if (event.request?.headers) {
        event.request.headers = redactSensitive(event.request.headers) as Record<string, string>;
      }
      // Drop request body entirely — may contain signatures, tokens, or PII
      if (event.request) {
        delete event.request.data;
      }
      // Redact query string params
      if (event.request?.query_string) {
        event.request.query_string = redactSensitive(event.request.query_string) as
          | string
          | Record<string, string>;
      }
      return event;
    },
  };
}

/**
 * Initialize Sentry. Call once in main.ts before NestFactory.create.
 * Safe to call when DSN is absent — logs a warning and returns.
 */
export function initSentry(logger: Logger): void {
  const options = buildSentryOptions(process.env as Record<string, string>);
  if (!options) {
    logger.warn('SENTRY_DSN not set — Sentry is disabled');
    return;
  }
  Sentry.init(options);
  logger.log(`Sentry initialized (env=${options.environment})`);
}

// ---------------------------------------------------------------------------
// Per-request context
// ---------------------------------------------------------------------------

export interface RequestSentryContext {
  /** Unique request identifier (e.g. from x-request-id header or generated). */
  requestId?: string | null;
  /** Matched route pattern, e.g. /raffles/:id */
  route?: string | null;
  /** HTTP status code of the response. */
  statusCode?: number | null;
  /** Raw wallet address — will be hashed before attaching. */
  walletAddress?: string | null;
}

/**
 * Attach safe request metadata to the current Sentry scope.
 * Call this inside an interceptor or filter that has access to the request/response.
 *
 * - requestId, route, and statusCode are attached as tags for easy filtering.
 * - walletAddress is one-way hashed (SHA-256, first 16 hex chars) before attaching.
 *   The raw address is never sent to Sentry.
 */
export function setSentryRequestContext(scope: Sentry.Scope, ctx: RequestSentryContext): void {
  if (ctx.requestId) {
    scope.setTag('request_id', ctx.requestId);
  }
  if (ctx.route) {
    scope.setTag('route', ctx.route);
  }
  if (ctx.statusCode != null) {
    scope.setTag('http.status_code', String(ctx.statusCode));
  }
  const walletHash = hashWallet(ctx.walletAddress);
  if (walletHash) {
    scope.setTag('wallet_hash', walletHash);
  }
}

// ---------------------------------------------------------------------------
// Ingestion error capture
// ---------------------------------------------------------------------------

/**
 * Capture an ingestion error with structured tags and context.
 * When Sentry is not initialized this is a no-op (captureException is safe
 * to call without an active client — it returns an empty event id).
 *
 * Tag values that are null or undefined are omitted from the Sentry event.
 */
export function captureIngestionError(
  error: unknown,
  context: IngestionErrorContext,
): void {
  Sentry.withScope((scope) => {
    if (context.ledger !== undefined && context.ledger !== null) {
      scope.setTag('ledger', String(context.ledger));
    }
    if (context.contractVersion !== undefined && context.contractVersion !== null) {
      scope.setTag('contract_version', context.contractVersion);
    }
    if (context.eventType !== undefined && context.eventType !== null) {
      scope.setTag('event_type', context.eventType);
    }
    if (context.eventPayload !== undefined) {
      scope.setContext('event_payload', { data: context.eventPayload });
    }
    if (context.ledgerPayload !== undefined) {
      scope.setContext('ledger_payload', { data: context.ledgerPayload });
    }
    Sentry.captureException(error);
  });
}
