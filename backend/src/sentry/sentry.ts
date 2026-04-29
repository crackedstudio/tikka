import * as Sentry from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { Logger } from '@nestjs/common';

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
    integrations: [nodeProfilingIntegration()],
    profilesSampleRate: 1.0,
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
