import * as Sentry from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { env } from '../config/env.config';

// ---------------------------------------------------------------------------
// Redaction utilities
// ---------------------------------------------------------------------------

/**
 * Sensitive field names that should be redacted from telemetry.
 * Case-insensitive matching.
 */
export const REDACTED_FIELDS = [
  'authorization',
  'token',
  'signature',
  'mnemonic', 
  'seed',
  'password',
  'privatekey',
  'secret',
  'x-api-key',
  'cookie',
  'session',
  'jwt',
  'bearer',
] as const;

/**
 * Recursively redact sensitive fields from an object or array.
 * Returns a new object/array without mutating the original.
 * Prevents infinite recursion with depth limiting.
 */
export function redactSensitive(input: unknown, depth = 0): unknown {
  // Prevent infinite recursion
  if (depth >= 10) {
    return '[DEPTH_LIMIT]';
  }

  if (input === null || input === undefined) {
    return input;
  }

  if (Array.isArray(input)) {
    return input.map(item => redactSensitive(item, depth + 1));
  }

  if (typeof input === 'object') {
    const result: Record<string, unknown> = {};
    const redactSet = new Set(REDACTED_FIELDS.map(f => f.toLowerCase()));
    
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (redactSet.has(key.toLowerCase())) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = redactSensitive(value, depth + 1);
      }
    }
    return result;
  }

  return input;
}

/**
 * Hash a wallet address for safe telemetry.
 * Returns the first 16 characters of SHA-256 hash in lowercase hex.
 * Returns null if input is null/undefined/blank.
 */
export function hashWallet(address: string | null | undefined): string | null {
  if (!address || typeof address !== 'string') {
    return null;
  }
  
  const trimmed = address.trim();
  if (!trimmed) {
    return null;
  }
  
  // Normalize to lowercase for consistent hashing
  const normalized = trimmed.toLowerCase();
  const hash = createHash('sha256').update(normalized).digest('hex');
  return hash.substring(0, 16);
}

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
export function buildSentryOptions(envInput: {
  SENTRY_DSN?: string;
  NODE_ENV?: string;
  SENTRY_TRACES_SAMPLE_RATE?: string | number;
}): Sentry.NodeOptions | null {
  const dsn = envInput.SENTRY_DSN?.trim();
  if (!dsn) return null;

  const tracesSampleRate =
    envInput.SENTRY_TRACES_SAMPLE_RATE !== undefined
      ? Number(envInput.SENTRY_TRACES_SAMPLE_RATE)
      : 0.1;

  return {
    dsn,
    environment: envInput.NODE_ENV ?? 'development',
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
  const options = buildSentryOptions({
    SENTRY_DSN: env.sentry.dsn,
    NODE_ENV: env.server.nodeEnv,
    SENTRY_TRACES_SAMPLE_RATE: env.sentry.tracesSampleRate,
  });
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
