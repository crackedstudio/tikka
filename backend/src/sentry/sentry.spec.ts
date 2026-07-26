import * as fc from 'fast-check';
import * as Sentry from '@sentry/nestjs';
import { Logger } from '@nestjs/common';
import {
  buildSentryOptions,
  captureIngestionError,
  initSentry,
  IngestionErrorContext,
} from './sentry';

fc.configureGlobal({ numRuns: 20 });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Arbitrary for a non-empty, non-whitespace-only DSN string (no leading/trailing whitespace) */
const nonEmptyString = fc
  .string({ minLength: 1 })
  .filter((s) => s.trim().length > 0 && s === s.trim());

/** Arbitrary for a nullable/undefinable string tag value */
const nullableString = fc.oneof(
  fc.string(),
  fc.constant(null as null),
  fc.constant(undefined as undefined),
);

/** Arbitrary for a nullable/undefinable number tag value */
const nullableNumber = fc.oneof(
  fc.integer({ min: 1, max: 1_000_000 }),
  fc.constant(null as null),
  fc.constant(undefined as undefined),
);

/** Arbitrary for an IngestionErrorContext with independently nullable tag fields */
const ingestionContextArb = fc.record({
  ledger: nullableNumber,
  contractVersion: nullableString,
  eventType: nullableString,
  eventPayload: fc.oneof(fc.anything(), fc.constant(undefined as undefined)),
  ledgerPayload: fc.oneof(fc.anything(), fc.constant(undefined as undefined)),
}) as fc.Arbitrary<IngestionErrorContext>;

// ---------------------------------------------------------------------------
// Property-Based Tests
// ---------------------------------------------------------------------------

describe('sentry — property-based tests', () => {
  // Feature: sentry-integration, Property 1: Sentry config is built correctly from environment variables
  describe('Property 1: Sentry config is built correctly from environment variables', () => {
    it('returns config with correct dsn, environment, and tracesSampleRate', () => {
      fc.assert(
        fc.property(
          nonEmptyString,
          fc.string(),
          fc.float({ min: 0, max: 1, noNaN: true }),
          (dsn, nodeEnv, sampleRate) => {
            const result = buildSentryOptions({
              SENTRY_DSN: dsn,
              NODE_ENV: nodeEnv,
              SENTRY_TRACES_SAMPLE_RATE: sampleRate,
            });
            expect(result).not.toBeNull();
            expect(result!.dsn).toBe(dsn);
            expect(result!.environment).toBe(nodeEnv);
            expect(result!.tracesSampleRate).toBe(sampleRate);
          },
        ),
      );
    });

    it('defaults tracesSampleRate to 0.1 when SENTRY_TRACES_SAMPLE_RATE is absent', () => {
      fc.assert(
        fc.property(nonEmptyString, fc.string(), (dsn, nodeEnv) => {
          const result = buildSentryOptions({ SENTRY_DSN: dsn, NODE_ENV: nodeEnv });
          expect(result).not.toBeNull();
          expect(result!.tracesSampleRate).toBe(0.1);
        }),
      );
    });
  });

  // Feature: sentry-integration, Property 2: Present tags are attached; null or undefined tags are omitted
  describe('Property 2: Present tags are attached; null or undefined tags are omitted', () => {
    it('setTag is called for non-null/non-undefined fields and never for null/undefined fields', () => {
      fc.assert(
        fc.property(ingestionContextArb, (context) => {
          const setTagMock = jest.fn();
          const setContextMock = jest.fn();
          const scopeMock = { setTag: setTagMock, setContext: setContextMock };

          jest.spyOn(Sentry, 'withScope').mockImplementation(((cb: (scope: any) => void) => {
            cb(scopeMock);
          }) as any);
          jest.spyOn(Sentry, 'captureException').mockImplementation(() => '');

          captureIngestionError(new Error('test'), context);

          const tagCalls = setTagMock.mock.calls.map((c: [string, string]) => c[0]);

          if (context.ledger !== undefined && context.ledger !== null) {
            expect(tagCalls).toContain('ledger');
          } else {
            expect(tagCalls).not.toContain('ledger');
          }

          if (context.contractVersion !== undefined && context.contractVersion !== null) {
            expect(tagCalls).toContain('contract_version');
          } else {
            expect(tagCalls).not.toContain('contract_version');
          }

          if (context.eventType !== undefined && context.eventType !== null) {
            expect(tagCalls).toContain('event_type');
          } else {
            expect(tagCalls).not.toContain('event_type');
          }

          jest.restoreAllMocks();
        }),
      );
    });
  });

  // Feature: sentry-integration, Property 3: captureException is called with the original error
  describe('Property 3: captureException is called with the original error', () => {
    it('captureException is called exactly once with the same error reference', () => {
      fc.assert(
        fc.property(
          fc.string().map((msg) => new Error(msg)),
          ingestionContextArb,
          (error, context) => {
            const captureExceptionMock = jest.fn().mockReturnValue('');
            jest.spyOn(Sentry, 'captureException').mockImplementation(captureExceptionMock);
            jest.spyOn(Sentry, 'withScope').mockImplementation(((cb: (scope: any) => void) => {
              cb({ setTag: jest.fn(), setContext: jest.fn() });
            }) as any);

            captureIngestionError(error, context);

            expect(captureExceptionMock).toHaveBeenCalledTimes(1);
            expect(captureExceptionMock).toHaveBeenCalledWith(error);

            jest.restoreAllMocks();
          },
        ),
      );
    });
  });

  // Feature: sentry-integration, Property 4: Context payloads are attached under the correct keys
  describe('Property 4: Context payloads are attached under the correct keys', () => {
    it('setContext is called with correct keys when payloads are present', () => {
      const contextWithPayloadsArb = fc.record({
        ledger: fc.constant(undefined as undefined),
        contractVersion: fc.constant(undefined as undefined),
        eventType: fc.constant(undefined as undefined),
        eventPayload: fc.oneof(fc.anything(), fc.constant(undefined as undefined)),
        ledgerPayload: fc.oneof(fc.anything(), fc.constant(undefined as undefined)),
      }) as fc.Arbitrary<IngestionErrorContext>;

      fc.assert(
        fc.property(contextWithPayloadsArb, (context) => {
          const setContextMock = jest.fn();
          jest.spyOn(Sentry, 'withScope').mockImplementation(((cb: (scope: any) => void) => {
            cb({ setTag: jest.fn(), setContext: setContextMock });
          }) as any);
          jest.spyOn(Sentry, 'captureException').mockImplementation(() => '');

          captureIngestionError(new Error('test'), context);

          const contextKeys = setContextMock.mock.calls.map((c: [string, unknown]) => c[0]);

          if (context.eventPayload !== undefined) {
            expect(contextKeys).toContain('event_payload');
          } else {
            expect(contextKeys).not.toContain('event_payload');
          }

          if (context.ledgerPayload !== undefined) {
            expect(contextKeys).toContain('ledger_payload');
          } else {
            expect(contextKeys).not.toContain('ledger_payload');
          }

          jest.restoreAllMocks();
        }),
      );
    });
  });

  // Feature: sentry-integration, Property 5: Graceful degradation when Sentry is not initialized
  describe('Property 5: Graceful degradation when Sentry is not initialized', () => {
    it('captureIngestionError never throws when Sentry has no active client', () => {
      // Use the real SDK without mocking — no DSN is set so no active client
      const errorArb = fc.oneof(
        fc.string().map((msg) => new Error(msg)),
        fc.string(),
        fc.integer(),
        fc.constant(null),
        fc.constant(undefined),
      );

      fc.assert(
        fc.property(errorArb, ingestionContextArb, (error, context) => {
          expect(() => captureIngestionError(error, context)).not.toThrow();
        }),
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe('buildSentryOptions — unit tests', () => {
  it('returns null when SENTRY_DSN is absent', () => {
    expect(buildSentryOptions({})).toBeNull();
  });

  it('returns null when SENTRY_DSN is an empty string', () => {
    expect(buildSentryOptions({ SENTRY_DSN: '' })).toBeNull();
  });

  it('returns null when SENTRY_DSN is whitespace only', () => {
    expect(buildSentryOptions({ SENTRY_DSN: '   ' })).toBeNull();
  });

  it('returns correct config when all fields are present', () => {
    const result = buildSentryOptions({
      SENTRY_DSN: 'https://abc@sentry.io/123',
      NODE_ENV: 'production',
      SENTRY_TRACES_SAMPLE_RATE: '0.5',
    });
    expect(result).toEqual(
      expect.objectContaining({
        dsn: 'https://abc@sentry.io/123',
        environment: 'production',
        tracesSampleRate: 0.5,
        integrations: expect.any(Array),
        profilesSampleRate: 1.0,
        sendDefaultPii: false,
      }),
    );
  });

  it('defaults tracesSampleRate to 0.1 when SENTRY_TRACES_SAMPLE_RATE is absent', () => {
    const result = buildSentryOptions({
      SENTRY_DSN: 'https://abc@sentry.io/123',
      NODE_ENV: 'staging',
    });
    expect(result).not.toBeNull();
    expect(result!.tracesSampleRate).toBe(0.1);
  });

  it('defaults environment to "development" when NODE_ENV is absent', () => {
    const result = buildSentryOptions({ SENTRY_DSN: 'https://abc@sentry.io/123' });
    expect(result).not.toBeNull();
    expect(result!.environment).toBe('development');
  });

  it('accepts numeric SENTRY_TRACES_SAMPLE_RATE', () => {
    const result = buildSentryOptions({
      SENTRY_DSN: 'https://abc@sentry.io/123',
      SENTRY_TRACES_SAMPLE_RATE: 0.25,
    });
    expect(result!.tracesSampleRate).toBe(0.25);
  });
});

describe('beforeSend — PII scrubbing', () => {
  const VALID_WALLET = 'GBRFDEK53ZB2TEJNDA223GK5C45XZS7K2V3N4M5P6Q7R8S9T0U1V2W3X4';

  function getBeforeSend() {
    const opts = buildSentryOptions({
      SENTRY_DSN: 'https://abc@sentry.io/123',
      NODE_ENV: 'test',
    });
    return (opts as any).beforeSend as (event: any) => any;
  }

  it('redacts authorization header', () => {
    const beforeSend = getBeforeSend();
    const event = { request: { headers: { authorization: 'Bearer sk-secret' } } };
    const result = beforeSend(event);
    expect(result.request.headers.authorization).toBe('[REDACTED]');
  });

  it('redacts cookie header', () => {
    const beforeSend = getBeforeSend();
    const event = { request: { headers: { cookie: 'session=abc123' } } };
    const result = beforeSend(event);
    expect(result.request.headers.cookie).toBe('[REDACTED]');
  });

  it('redacts email fields in user object', () => {
    const beforeSend = getBeforeSend();
    const event = { user: { email: 'alice@corp.com', id: '42' } };
    const result = beforeSend(event);
    expect(result.user.email).toBe('[REDACTED]');
    expect(result.user.id).toBe('42');
  });

  it('deletes request body (data)', () => {
    const beforeSend = getBeforeSend();
    const event = { request: { method: 'POST', data: { password: 'hunter2' } } };
    const result = beforeSend(event);
    expect(result.request.data).toBeUndefined();
    expect(result.request.method).toBe('POST');
  });

  it('redacts query string containing sensitive fields', () => {
    const beforeSend = getBeforeSend();
    const event = { request: { query_string: { token: 'abc', q: 'search' } } };
    const result = beforeSend(event);
    expect(result.request.query_string).toEqual({ token: '[REDACTED]', q: 'search' });
  });

  it('hashes wallet addresses in tags', () => {
    const beforeSend = getBeforeSend();
    const event = { tags: { wallet: VALID_WALLET } };
    const result = beforeSend(event);
    expect(result.tags.wallet).not.toBe(VALID_WALLET);
    expect(result.tags.wallet).toMatch(/^[0-9a-f]{16}$/);
  });

  it('handles a complete event with all PII vectors', () => {
    const beforeSend = getBeforeSend();
    const event = {
      request: {
        method: 'POST',
        headers: { authorization: 'Bearer token', cookie: 'sid=xyz' },
        query_string: { email: 'bob@test.com' },
        data: { secret: 'private' },
      },
      user: { email: 'bob@test.com' },
      tags: { wallet: VALID_WALLET },
      extra: { debug: true },
    };
    const result = beforeSend(event);

    expect(result.request.headers.authorization).toBe('[REDACTED]');
    expect(result.request.headers.cookie).toBe('[REDACTED]');
    expect(result.request.query_string.email).toBe('[REDACTED]');
    expect(result.request.data).toBeUndefined();
    expect(result.user.email).toBe('[REDACTED]');
    expect(result.tags.wallet).toMatch(/^[0-9a-f]{16}$/);
    expect(result.extra.debug).toBe(true);
  });
});

describe('initSentry — unit tests', () => {
  let warnMock: jest.Mock;
  let logMock: jest.Mock;
  let logger: Logger;

  beforeEach(() => {
    warnMock = jest.fn();
    logMock = jest.fn();
    logger = { warn: warnMock, log: logMock } as unknown as Logger;
    // Ensure SENTRY_DSN is not set from environment
    delete process.env.SENTRY_DSN;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.SENTRY_DSN;
  });

  it('logs a warning when SENTRY_DSN is absent', () => {
    initSentry(logger);
    expect(warnMock).toHaveBeenCalledWith('SENTRY_DSN not set — Sentry is disabled');
  });

  it('does not call Sentry.init when SENTRY_DSN is absent', () => {
    const initSpy = jest.spyOn(Sentry, 'init').mockImplementation(() => undefined);
    initSentry(logger);
    expect(initSpy).not.toHaveBeenCalled();
  });

  it('calls Sentry.init when SENTRY_DSN is present', () => {
    process.env.SENTRY_DSN = 'https://abc@sentry.io/123';
    process.env.NODE_ENV = 'test';
    const initSpy = jest.spyOn(Sentry, 'init').mockImplementation(() => undefined);

    initSentry(logger);

    expect(initSpy).toHaveBeenCalledWith(
      expect.objectContaining({ dsn: 'https://abc@sentry.io/123' }),
    );
    expect(logMock).toHaveBeenCalledWith(expect.stringContaining('Sentry initialized'));
  });
});
