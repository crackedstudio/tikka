import { rpc } from '@stellar/stellar-sdk';
import { RetryConfig } from './network.config';

/** Emitted when the RPC retention window no longer includes our resume cursor. */
export interface EventGapWarning {
  message: string;
  resumeCursor: string;
  oldestLedger: number;
  latestLedger: number;
  lastProcessedLedger?: number;
}

export interface EventSubscriptionOptions {
  /** Soroban RPC getEvents (typically `server.getEvents.bind(server)`). */
  getEvents: (request: rpc.Api.GetEventsRequest) => Promise<rpc.Api.GetEventsResponse>;
  filters: rpc.Api.EventFilter[];
  /** Polling interval between successful fetches (default 5000). */
  pollIntervalMs?: number;
  /** Page size for getEvents (default 100). */
  limit?: number;
  /** Resume cursor; omit to start from `startLedger` (default: 1). */
  initialCursor?: string;
  /** Used when no cursor is available (default: 1). Prefer a recent ledger in production. */
  startLedger?: number;
  onEvent: (event: rpc.Api.EventResponse) => void | Promise<void>;
  onError?: (error: unknown) => void;
  onReconnect?: (attempt: number, delayMs: number, error: unknown) => void;
  onGapWarning?: (warning: EventGapWarning) => void;
  retry?: Pick<RetryConfig, 'baseDelayMs' | 'maxDelayMs'>;
  /** Injectable sleep (tests). */
  sleep?: (ms: number) => Promise<void>;
}

export interface EventSubscriptionHandle {
  stop(): void;
  /** Cursor that will be used on the next getEvents call. */
  getResumeCursor(): string;
  /** Id of the last event delivered to `onEvent`. */
  getLastProcessedEventId(): string | undefined;
  /** Resolves when the poll loop exits after `stop()`. */
  done: Promise<void>;
}

function computeReconnectDelay(
  attempt: number,
  retry: Pick<RetryConfig, 'baseDelayMs' | 'maxDelayMs'> = {},
): number {
  const baseDelayMs = retry.baseDelayMs ?? 500;
  const maxDelayMs = retry.maxDelayMs ?? 8000;
  const backoff = Math.pow(2, attempt - 1);
  const jitter = 0.5 + Math.random();
  return Math.min(maxDelayMs, baseDelayMs * backoff * jitter);
}

function buildGapWarning(
  resumeCursor: string,
  response: rpc.Api.GetEventsResponse,
  lastProcessedLedger?: number,
): EventGapWarning {
  const ledgerHint =
    lastProcessedLedger !== undefined
      ? ` RPC oldest ledger ${response.oldestLedger} is after last processed ledger ${lastProcessedLedger}.`
      : ` oldest ledger ${response.oldestLedger}.`;
  return {
    message: `Cannot resume from cursor "${resumeCursor}": cursor is outside the RPC retention window.${ledgerHint} Events may have been missed.`,
    resumeCursor,
    oldestLedger: response.oldestLedger,
    latestLedger: response.latestLedger,
    lastProcessedLedger,
  };
}

function shouldWarnGap(
  resumeCursor: string,
  response: rpc.Api.GetEventsResponse,
  lastProcessedLedger?: number,
): boolean {
  if (!resumeCursor) return false;
  if (lastProcessedLedger !== undefined && response.oldestLedger > lastProcessedLedger) {
    return true;
  }
  return false;
}

function isCursorRetentionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /oldest ledger|before oldest|retention|startLedger/i.test(message);
}

/**
 * Polls Soroban contract events with automatic reconnect (exponential backoff)
 * and resume from the last processed cursor/event id.
 */
export function subscribeToEvents(options: EventSubscriptionOptions): EventSubscriptionHandle {
  let running = true;
  let cursor = options.initialCursor ?? '';
  let lastProcessedEventId: string | undefined;
  let lastProcessedLedger: number | undefined;
  let reconnectAttempt = 0;
  let gapWarnedForCursor: string | undefined;

  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const pollIntervalMs = options.pollIntervalMs ?? 5000;
  const limit = options.limit ?? 100;

  const done = (async () => {
    while (running) {
      try {
        const request: rpc.Api.GetEventsRequest = cursor
          ? { filters: options.filters, cursor, limit }
          : {
              filters: options.filters,
              startLedger: options.startLedger ?? 1,
              limit,
            };

        const response = await options.getEvents(request);

        if (
          shouldWarnGap(cursor, response, lastProcessedLedger) &&
          gapWarnedForCursor !== cursor
        ) {
          gapWarnedForCursor = cursor;
          options.onGapWarning?.(buildGapWarning(cursor, response, lastProcessedLedger));
        }

        for (const event of response.events) {
          if (!running) return;
          await options.onEvent(event);
          lastProcessedEventId = event.id;
          lastProcessedLedger = event.ledger;
          cursor = event.id;
        }

        if (response.events.length > 0 && response.cursor) {
          cursor = response.cursor;
        }

        reconnectAttempt = 0;

        if (!running) return;
        await sleep(pollIntervalMs);
      } catch (error) {
        if (!running) return;

        if (cursor && isCursorRetentionError(error)) {
          options.onGapWarning?.({
            message: `Cannot resume from cursor "${cursor}": ${error instanceof Error ? error.message : String(error)}`,
            resumeCursor: cursor,
            oldestLedger: lastProcessedLedger ?? 0,
            latestLedger: lastProcessedLedger ?? 0,
            lastProcessedLedger,
          });
        }

        reconnectAttempt++;
        const delayMs = computeReconnectDelay(reconnectAttempt, options.retry);
        options.onReconnect?.(reconnectAttempt, delayMs, error);
        options.onError?.(error);
        await sleep(delayMs);
      }
    }
  })();

  return {
    stop() {
      running = false;
    },
    getResumeCursor() {
      return cursor;
    },
    getLastProcessedEventId() {
      return lastProcessedEventId;
    },
    done,
  };
}

/** Convenience wrapper around {@link rpc.Server.getEvents}. */
export function subscribeToContractEvents(
  server: rpc.Server,
  options: Omit<EventSubscriptionOptions, 'getEvents'>,
): EventSubscriptionHandle {
  return subscribeToEvents({
    ...options,
    getEvents: (request) => server.getEvents(request),
  });
}
