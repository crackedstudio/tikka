import { CallHandler, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { firstValueFrom, of } from 'rxjs';
import { WebhookSignatureVerificationInterceptor } from './webhook-signature-verification.interceptor';

jest.mock('crypto', () => {
  const actual = jest.requireActual<typeof import('crypto')>('crypto');
  return { ...actual, timingSafeEqual: jest.fn(actual.timingSafeEqual) };
});

const SECRET = 'indexer-webhook-secret';
const NOW = new Date('2026-09-25T12:00:00.000Z');

type RequestHeaders = Record<string, unknown>;

describe('WebhookSignatureVerificationInterceptor', () => {
  let interceptor: WebhookSignatureVerificationInterceptor;
  let configService: jest.Mocked<Pick<ConfigService, 'get'>>;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    configService = {
      get: jest.fn((key: string) => (key === 'INDEXER_WEBHOOK_SECRET' ? SECRET : undefined)),
    } as unknown as jest.Mocked<Pick<ConfigService, 'get'>>;
    interceptor = new WebhookSignatureVerificationInterceptor(
      configService as unknown as ConfigService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  function createContext(rawBody: string | null, headers: RequestHeaders): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          rawBody: rawBody === null ? undefined : Buffer.from(rawBody),
          headers,
        }),
      }),
    } as unknown as ExecutionContext;
  }

  function createHandler(): CallHandler & { handle: jest.Mock } {
    return {
      handle: jest.fn(() => of({ accepted: true })),
    };
  }

  function sign(rawBody: string): string {
    return crypto.createHmac('sha256', SECRET).update(rawBody).digest('hex');
  }

  function currentBody(overrides: Record<string, unknown> = {}): string {
    return JSON.stringify({
      event: 'raffle.finalized',
      timestamp: NOW.toISOString(),
      data: { raffleId: 42 },
      ...overrides,
    });
  }

  it('accepts a valid HMAC-SHA256 signature over the raw body', async () => {
    const rawBody = currentBody();
    const handler = createHandler();

    const result = await firstValueFrom(
      interceptor.intercept(
        createContext(rawBody, { 'x-webhook-signature': sign(rawBody) }),
        handler,
      ),
    );

    expect(result).toEqual({ accepted: true });
    expect(handler.handle).toHaveBeenCalledTimes(1);
  });

  it('rejects a signature for a different body', () => {
    const rawBody = currentBody();
    const handler = createHandler();

    expect(() =>
      interceptor.intercept(
        createContext(rawBody, { 'x-webhook-signature': sign(`${rawBody} `) }),
        handler,
      ),
    ).toThrow(UnauthorizedException);
    expect(handler.handle).not.toHaveBeenCalled();
  });

  it('fails closed when the raw request body is unavailable', () => {
    const handler = createHandler();

    expect(() =>
      interceptor.intercept(
        createContext(null, { 'x-webhook-signature': '00'.repeat(32) }),
        handler,
      ),
    ).toThrow(new UnauthorizedException('Missing webhook signature'));
    expect(handler.handle).not.toHaveBeenCalled();
  });

  it('rejects a missing signature header', () => {
    const handler = createHandler();

    expect(() => interceptor.intercept(createContext(currentBody(), {}), handler)).toThrow(
      new UnauthorizedException('Missing webhook signature'),
    );
    expect(handler.handle).not.toHaveBeenCalled();
  });

  it('fails closed when the source secret is missing', () => {
    const rawBody = currentBody();
    const handler = createHandler();
    configService.get.mockReturnValue(undefined);

    expect(() =>
      interceptor.intercept(
        createContext(rawBody, { 'x-webhook-signature': sign(rawBody) }),
        handler,
      ),
    ).toThrow(UnauthorizedException);
    expect(handler.handle).not.toHaveBeenCalled();
  });

  it('rejects an invalid source identifier', () => {
    const rawBody = currentBody();
    const handler = createHandler();

    expect(() =>
      interceptor.intercept(
        createContext(rawBody, {
          'x-webhook-signature': sign(rawBody),
          'x-tikka-webhook-source': 'indexer.secret',
        }),
        handler,
      ),
    ).toThrow(UnauthorizedException);
    expect(handler.handle).not.toHaveBeenCalled();
  });

  it('rejects a non-sha256 algorithm', () => {
    const rawBody = currentBody();
    const handler = createHandler();

    expect(() =>
      interceptor.intercept(
        createContext(rawBody, {
          'x-webhook-signature': sign(rawBody),
          'x-webhook-signature-algorithm': 'sha512',
        }),
        handler,
      ),
    ).toThrow(UnauthorizedException);
    expect(handler.handle).not.toHaveBeenCalled();
  });

  it('rejects a prefixed signature using an unsupported algorithm', () => {
    const rawBody = currentBody();
    const handler = createHandler();

    expect(() =>
      interceptor.intercept(
        createContext(rawBody, {
          'x-webhook-signature': `sha512=${sign(rawBody)}`,
        }),
        handler,
      ),
    ).toThrow(UnauthorizedException);
    expect(handler.handle).not.toHaveBeenCalled();
  });

  it('accepts a sha256-prefixed signature', async () => {
    const rawBody = currentBody();
    const handler = createHandler();

    const result = await firstValueFrom(
      interceptor.intercept(
        createContext(rawBody, {
          'x-webhook-signature': `sha256=${sign(rawBody)}`,
        }),
        handler,
      ),
    );

    expect(result).toEqual({ accepted: true });
  });

  it('rejects a replay with an old timestamp', () => {
    const rawBody = currentBody({
      timestamp: new Date(NOW.getTime() - 6 * 60 * 1000).toISOString(),
    });
    const handler = createHandler();

    expect(() =>
      interceptor.intercept(
        createContext(rawBody, { 'x-webhook-signature': sign(rawBody) }),
        handler,
      ),
    ).toThrow(UnauthorizedException);
    expect(handler.handle).not.toHaveBeenCalled();
  });

  it('rejects mismatched body and header timestamps', () => {
    const rawBody = currentBody();
    const handler = createHandler();

    expect(() =>
      interceptor.intercept(
        createContext(rawBody, {
          'x-webhook-signature': sign(rawBody),
          'x-webhook-timestamp': new Date(NOW.getTime() + 1000).toISOString(),
        }),
        handler,
      ),
    ).toThrow(UnauthorizedException);
    expect(handler.handle).not.toHaveBeenCalled();
  });

  it('rejects a missing timestamp', () => {
    const rawBody = JSON.stringify({ event: 'raffle.finalized' });
    const handler = createHandler();

    expect(() =>
      interceptor.intercept(
        createContext(rawBody, { 'x-webhook-signature': sign(rawBody) }),
        handler,
      ),
    ).toThrow(UnauthorizedException);
    expect(handler.handle).not.toHaveBeenCalled();
  });

  it('rejects malformed hexadecimal signatures', () => {
    const rawBody = currentBody();
    const handler = createHandler();

    expect(() =>
      interceptor.intercept(createContext(rawBody, { 'x-webhook-signature': 'not-hex' }), handler),
    ).toThrow(UnauthorizedException);
    expect(handler.handle).not.toHaveBeenCalled();
  });

  it('uses constant-time comparison for invalid signatures', () => {
    const rawBody = currentBody();
    const handler = createHandler();
    const timingSafeEqual = crypto.timingSafeEqual as jest.Mock;
    timingSafeEqual.mockClear();

    expect(() =>
      interceptor.intercept(
        createContext(rawBody, { 'x-webhook-signature': '00'.repeat(32) }),
        handler,
      ),
    ).toThrow(UnauthorizedException);
    expect(timingSafeEqual).toHaveBeenCalledTimes(1);
  });

  it('accepts the signed body and metadata emitted by the delivery worker', async () => {
    const rawBody = currentBody();
    const timestamp = NOW.toISOString();
    const handler = createHandler();

    const result = await firstValueFrom(
      interceptor.intercept(
        createContext(rawBody, {
          'x-tikka-signature': sign(rawBody),
          'x-tikka-signature-algorithm': 'sha256',
          'x-tikka-timestamp': timestamp,
        }),
        handler,
      ),
    );

    expect(result).toEqual({ accepted: true });
  });

  it('accepts a timestamp header when the signature covers the timestamp and body', async () => {
    const rawBody = 'raw webhook bytes';
    const timestamp = NOW.toISOString();
    const signature = crypto
      .createHmac('sha256', SECRET)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');
    const handler = createHandler();

    const result = await firstValueFrom(
      interceptor.intercept(
        createContext(rawBody, {
          'x-webhook-signature': signature,
          'x-webhook-timestamp': timestamp,
        }),
        handler,
      ),
    );

    expect(result).toEqual({ accepted: true });
  });
});
