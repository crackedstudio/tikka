import type * as Sentry from '@sentry/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sentryMock = vi.hoisted(() => {
  const scope = {
    setTag: vi.fn(),
    setContext: vi.fn(),
    setUser: vi.fn(),
    setLevel: vi.fn(),
  };

  return {
    scope,
    captureException: vi.fn(),
    init: vi.fn(),
    withScope: vi.fn((callback: (activeScope: typeof scope) => void) => callback(scope)),
  };
});

vi.mock('@sentry/react', () => ({
  init: sentryMock.init,
  captureException: sentryMock.captureException,
  withScope: sentryMock.withScope,
}));

import {
  DEFAULT_ERROR_SAMPLE_RATE,
  DEFAULT_TRACES_SAMPLE_RATE,
  buildSentryOptions,
  captureClientError,
  initClientSentry,
  installGlobalErrorHandlers,
} from './sentry';
import { clearCorrelationIds, setCorrelationId } from './correlation';
import {
  REDACTED_PLACEHOLDER,
  REDACTED_TRANSACTION_PLACEHOLDER,
} from './redaction';

const WALLET = 'GBRFDEK53ZB2TEJNDA223GK5C45XZS7K2V3N4M5P6Q7R7S7T7U7V7W7X';
const XDR_BLOB = `AAAAAgAAAAB${'Ab1Cd2Ef3Gh4Ij5Kl6Mn7Op8Qr9St0Uv1Wx2Yz3'.repeat(3)}`;
const TEST_DSN = 'https://example.ingest.sentry.io/1';

const asErrorEvent = (value: Record<string, unknown>): Sentry.ErrorEvent =>
  value as unknown as Sentry.ErrorEvent;

/** `captureClientError` reports on a promise chain; wait for it to settle. */
const flushCapture = () => vi.waitFor(() => expect(sentryMock.withScope).toHaveBeenCalled());

beforeEach(() => {
  vi.clearAllMocks();
  clearCorrelationIds();
});

describe('buildSentryOptions', () => {
  it('returns null when no DSN is configured', () => {
    expect(buildSentryOptions({})).toBeNull();
    expect(buildSentryOptions({ VITE_SENTRY_DSN: '' })).toBeNull();
    expect(buildSentryOptions({ VITE_SENTRY_DSN: '   ' })).toBeNull();
  });

  it('samples errors and traces aggressively by default', () => {
    const options = buildSentryOptions({ VITE_SENTRY_DSN: TEST_DSN });
    expect(options).not.toBeNull();
    expect(options?.sampleRate).toBe(DEFAULT_ERROR_SAMPLE_RATE);
    expect(options?.tracesSampleRate).toBe(DEFAULT_TRACES_SAMPLE_RATE);
    expect(options?.sendDefaultPii).toBe(false);
  });

  it('parses numeric sample rates from strings', () => {
    const options = buildSentryOptions({
      VITE_SENTRY_DSN: TEST_DSN,
      VITE_SENTRY_SAMPLE_RATE: '0.5',
      VITE_SENTRY_TRACES_SAMPLE_RATE: '0.02',
    });
    expect(options?.sampleRate).toBe(0.5);
    expect(options?.tracesSampleRate).toBe(0.02);
  });

  it('clamps out-of-range rates and falls back on unparseable ones', () => {
    expect(
      buildSentryOptions({ VITE_SENTRY_DSN: TEST_DSN, VITE_SENTRY_SAMPLE_RATE: '7' })?.sampleRate,
    ).toBe(1);
    expect(
      buildSentryOptions({ VITE_SENTRY_DSN: TEST_DSN, VITE_SENTRY_SAMPLE_RATE: '-2' })?.sampleRate,
    ).toBe(0);
    expect(
      buildSentryOptions({ VITE_SENTRY_DSN: TEST_DSN, VITE_SENTRY_SAMPLE_RATE: 'abc' })?.sampleRate,
    ).toBe(DEFAULT_ERROR_SAMPLE_RATE);
  });

  it('prefers VITE_SENTRY_ENVIRONMENT over VITE_APP_ENV and defaults to development', () => {
    expect(
      buildSentryOptions({
        VITE_SENTRY_DSN: TEST_DSN,
        VITE_SENTRY_ENVIRONMENT: 'staging',
        VITE_APP_ENV: 'production',
      })?.environment,
    ).toBe('staging');
    expect(
      buildSentryOptions({ VITE_SENTRY_DSN: TEST_DSN, VITE_APP_ENV: 'production' })?.environment,
    ).toBe('production');
    expect(buildSentryOptions({ VITE_SENTRY_DSN: TEST_DSN })?.environment).toBe('development');
  });
});

describe('beforeSend scrubbing', () => {
  const beforeSend = () => {
    const options = buildSentryOptions({ VITE_SENTRY_DSN: TEST_DSN });
    if (!options) {
      throw new Error('expected options');
    }
    return options.beforeSend;
  };

  it('redacts the authorization header', () => {
    const result = beforeSend()(
      asErrorEvent({ request: { headers: { authorization: 'Bearer secret' } } }),
    );
    expect(result?.request?.headers?.authorization).toBe(REDACTED_PLACEHOLDER);
  });

  it('drops the request body', () => {
    const result = beforeSend()(
      asErrorEvent({ request: { method: 'POST', data: { signedXdr: XDR_BLOB } } }),
    );
    expect(result?.request?.data).toBeUndefined();
    expect(result?.request?.method).toBe('POST');
  });

  it('hashes wallet addresses in tags', () => {
    const result = beforeSend()(asErrorEvent({ tags: { wallet: WALLET } }));
    expect(result?.tags?.wallet).not.toBe(WALLET);
    expect(result?.tags?.wallet).toMatch(/^[0-9a-f]{16}$/);
  });

  it('redacts XDR payloads in extra', () => {
    const result = beforeSend()(asErrorEvent({ extra: { signedXdr: XDR_BLOB } }));
    expect(result?.extra?.signedXdr).toBe(REDACTED_TRANSACTION_PLACEHOLDER);
  });
});

describe('initClientSentry', () => {
  it('does not initialize when the DSN is missing', async () => {
    const initialized = await initClientSentry({ VITE_SENTRY_DSN: '' });
    expect(initialized).toBe(false);
    expect(sentryMock.init).not.toHaveBeenCalled();
  });

  it('initializes Sentry with the built options when a DSN is present', async () => {
    const initialized = await initClientSentry({
      VITE_SENTRY_DSN: TEST_DSN,
      VITE_APP_ENV: 'production',
    });

    expect(initialized).toBe(true);
    expect(sentryMock.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: TEST_DSN,
        environment: 'production',
        sampleRate: DEFAULT_ERROR_SAMPLE_RATE,
        tracesSampleRate: DEFAULT_TRACES_SAMPLE_RATE,
        sendDefaultPii: false,
        beforeSend: expect.any(Function),
      }),
    );
  });
});

describe('captureClientError', () => {
  beforeEach(async () => {
    await initClientSentry({ VITE_SENTRY_DSN: TEST_DSN });
  });

  it('tags the event with its source and the latest backend request id', async () => {
    setCorrelationId('req-from-backend');

    captureClientError(new Error('boom'), { source: 'error-boundary' });
    await flushCapture();

    expect(sentryMock.captureException).toHaveBeenCalledTimes(1);
    expect(sentryMock.scope.setTag).toHaveBeenCalledWith('source', 'error-boundary');
    expect(sentryMock.scope.setTag).toHaveBeenCalledWith('request_id', 'req-from-backend');
    expect(sentryMock.scope.setLevel).toHaveBeenCalledWith('error');
  });

  it('lets an explicit correlation id override the ambient one', async () => {
    setCorrelationId('ambient-id');

    captureClientError(new Error('boom'), {
      source: 'sdk-transaction',
      correlationId: 'explicit-id',
    });
    await flushCapture();

    expect(sentryMock.scope.setTag).toHaveBeenCalledWith('request_id', 'explicit-id');
  });

  it('attaches the correlation window as context', async () => {
    setCorrelationId('older-id');
    setCorrelationId('newer-id');

    captureClientError(new Error('boom'), { source: 'manual' });
    await flushCapture();

    expect(sentryMock.scope.setContext).toHaveBeenCalledWith('client_request_ids', {
      recent: ['newer-id', 'older-id'],
    });
  });

  it('hashes the wallet and never attaches the raw address', async () => {
    captureClientError(new Error('boom'), {
      source: 'sdk-transaction',
      walletAddress: WALLET,
    });
    await flushCapture();

    const walletTag = sentryMock.scope.setTag.mock.calls.find(
      (call) => call[0] === 'wallet_hash',
    );
    expect(walletTag?.[1]).toMatch(/^[0-9a-f]{16}$/);
    expect(walletTag?.[1]).not.toBe(WALLET);
    expect(sentryMock.scope.setUser).toHaveBeenCalledWith({ id: walletTag?.[1] });
  });

  it('scrubs structured context before attaching it', async () => {
    captureClientError(new Error('boom'), {
      source: 'sdk-transaction',
      tags: { pipeline_code: 'SUBMISSION_FAILED' },
      extra: {
        operation: 'buyTickets',
        signedXdr: XDR_BLOB,
        email: 'alice@example.com',
        params: { wallet: WALLET },
      },
    });
    await flushCapture();

    expect(sentryMock.scope.setTag).toHaveBeenCalledWith(
      'pipeline_code',
      'SUBMISSION_FAILED',
    );

    const contextCall = sentryMock.scope.setContext.mock.calls.find(
      (call) => call[0] === 'client_context',
    );
    const scrubbed = contextCall?.[1] as Record<string, unknown>;
    expect(scrubbed.operation).toBe('buyTickets');
    expect(scrubbed.signedXdr).toBe(REDACTED_TRANSACTION_PLACEHOLDER);
    expect(scrubbed.email).toBe(REDACTED_PLACEHOLDER);
    expect((scrubbed.params as Record<string, unknown>).wallet).toMatch(/^[0-9a-f]{16}$/);
  });

  it('never throws on non-Error reasons', async () => {
    expect(() => captureClientError({ weird: true }, { source: 'manual' })).not.toThrow();
    expect(() => captureClientError(undefined, { source: 'manual' })).not.toThrow();
    expect(() => captureClientError('plain string', { source: 'manual' })).not.toThrow();

    await flushCapture();
    await vi.waitFor(() => expect(sentryMock.captureException).toHaveBeenCalledTimes(3));
  });
});

describe('installGlobalErrorHandlers', () => {
  beforeEach(async () => {
    await initClientSentry({ VITE_SENTRY_DSN: TEST_DSN });
  });

  it('reports unhandled promise rejections', async () => {
    const dispose = installGlobalErrorHandlers();

    const event = new Event('unhandledrejection') as unknown as PromiseRejectionEvent;
    Object.defineProperty(event, 'reason', { value: new Error('rejected') });
    window.dispatchEvent(event);

    await flushCapture();
    expect(sentryMock.scope.setTag).toHaveBeenCalledWith('source', 'unhandled-rejection');
    dispose();
  });

  it('reports uncaught window errors', async () => {
    const dispose = installGlobalErrorHandlers();

    const event = new Event('error') as unknown as ErrorEvent;
    Object.defineProperty(event, 'error', { value: new Error('uncaught') });
    Object.defineProperty(event, 'message', { value: 'uncaught' });
    window.dispatchEvent(event);

    await flushCapture();
    expect(sentryMock.scope.setTag).toHaveBeenCalledWith('source', 'window-error');
    dispose();
  });

  it('stops reporting once disposed', async () => {
    const dispose = installGlobalErrorHandlers();
    dispose();
    vi.clearAllMocks();

    const event = new Event('unhandledrejection') as unknown as PromiseRejectionEvent;
    Object.defineProperty(event, 'reason', { value: new Error('after dispose') });
    window.dispatchEvent(event);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sentryMock.withScope).not.toHaveBeenCalled();
    expect(sentryMock.captureException).not.toHaveBeenCalled();
  });
});

describe('captureClientError before the sink is initialised', () => {
  it('is a no-op rather than an error', async () => {
    vi.resetModules();
    const fresh = await import('./sentry');

    expect(fresh.isClientSentryEnabled()).toBe(false);
    expect(() => fresh.captureClientError(new Error('early'), { source: 'manual' })).not.toThrow();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sentryMock.captureException).not.toHaveBeenCalled();
  });
});
