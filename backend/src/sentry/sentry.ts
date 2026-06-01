import * as Sentry from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { Logger } from '@nestjs/common';
import { env } from '../config/env.config';

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

import * as crypto from 'crypto';

// Fields that should always be redacted (case-insensitive)
export const REDACTED_FIELDS = [
  'authorization',
  'token',
  'signature',
  'mnemonic',
  'seed',
  'password',
];

/**
 * Redact sensitive fields from objects/arrays recursively.
 * - Returns primitives untouched
 * - Returns null/undefined unchanged
 * - Does not mutate the original object
 * - Replaces values for fields in REDACTED_FIELDS with '[REDACTED]'
 * - At depth >= 10 returns the sentinel '[DEPTH_LIMIT]'
 */
export function redactSensitive<T>(input: T, depth = 0): T {
  const MAX_DEPTH = 10;
  if (input === null || input === undefined) return input;
  if (typeof input !== 'object') return input;
  if (depth >= MAX_DEPTH) return ('[DEPTH_LIMIT]' as unknown) as T;

  if (Array.isArray(input)) {
    return input.map((item) => redactSensitive(item as any, depth + 1)) as unknown as T;
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as any)) {
    if (REDACTED_FIELDS.includes(k.toLowerCase())) {
      out[k] = '[REDACTED]';
    } else {
      out[k] = redactSensitive(v as any, depth + 1);
    }
  }
  return out as T;
}

export function hashWallet(address?: string | null): string | null {
  if (address === undefined || address === null) return null;
  const trimmed = String(address).trim();
  if (!trimmed) return null;
  const normalized = trimmed.toLowerCase();
  const digest = crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
  return digest;
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
