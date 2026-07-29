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
  'email',
  'emailaddress',
  'user_email',
  'useremail',
] as const;

/** Regex matching Stellar public keys (G…) or secret seeds (S…), 56 base32 chars. */
const STELLAR_ADDRESS_RE = /\b[GS][A-Z2-7]{55}\b/g;

/** Non-global variant for single-match testing without mutating lastIndex. */
const STELLAR_ADDRESS_TEST = /\b[GS][A-Z2-7]{55}\b/;

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

/**
 * Replace Stellar wallet addresses (G…/S…, 56 base32 chars) found in a string
 * with their hashed representation via `hashWallet`.
 */
export function redactWalletAddresses(value: string): string {
  return value.replace(STELLAR_ADDRESS_RE, (match) => hashWallet(match) ?? match);
}

/**
 * Recursively walk an object/array, redacting sensitive field values and
 * hashing any Stellar wallet address strings found.
 * Returns a new structure without mutating the original.
 */
export function scrubPii(input: unknown, depth = 0): unknown {
  if (depth >= 10) {
    return '[DEPTH_LIMIT]';
  }

  if (input === null || input === undefined) {
    return input;
  }

  if (typeof input === 'string') {
    return typeof input === 'string' && STELLAR_ADDRESS_TEST.test(input)
      ? redactWalletAddresses(input)
      : input;
  }

  if (Array.isArray(input)) {
    return input.map((item) => scrubPii(item, depth + 1));
  }

  if (typeof input === 'object') {
    const redactSet = new Set(REDACTED_FIELDS.map((f) => f.toLowerCase()));
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (redactSet.has(key.toLowerCase())) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = scrubPii(value, depth + 1);
      }
    }
    return result;
  }

  return input;
}

/**
 * Walk a Sentry event and redact PII:
 *  - sensitive fields (authorization, cookies, emails, …) → [REDACTED]
 *  - Stellar wallet addresses → first 16 hex chars of SHA-256
 */
export function scrubSentryEvent(event: Sentry.Event): Sentry.Event {
  const e = { ...event };

  if (e.request?.headers) {
    e.request = { ...e.request, headers: scrubPii(e.request.headers) as Record<string, string> };
  }
  if (e.request?.query_string) {
    e.request = {
      ...e.request,
      query_string: scrubPii(e.request.query_string) as string | Record<string, string>,
    };
  }
  // Drop request body — may contain signatures, tokens, or PII
  if (e.request?.data !== undefined) {
    const { data: _, ...rest } = e.request;
    e.request = rest;
  }

  if (e.user) {
    e.user = scrubPii(e.user) as Sentry.Event['user'];
  }
  if (e.tags) {
    e.tags = scrubPii(e.tags) as Sentry.Event['tags'];
  }
  if (e.contexts) {
    e.contexts = scrubPii(e.contexts) as Sentry.Event['contexts'];
  }
  if (e.extra) {
    e.extra = scrubPii(e.extra) as Sentry.Event['extra'];
  }

  return e;
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
    beforeSend(event: any): any {
      return scrubSentryEvent(event);
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
