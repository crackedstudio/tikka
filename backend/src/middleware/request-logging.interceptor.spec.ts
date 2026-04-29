import {
  CallHandler,
  ExecutionContext,
  Logger,
} from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { RequestLoggingInterceptor, redact } from './request-logging.interceptor';

function createExecutionContext(
  request: Record<string, unknown>,
  response: Record<string, unknown>,
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as ExecutionContext;
}

describe('redact()', () => {
  const fields = ['authorization', 'token', 'privatekey', 'secret', 'password', 'x-api-key'];

  it('redacts top-level sensitive keys', () => {
    const result = redact({ authorization: 'Bearer abc', name: 'John' }, fields);
    expect(result).toEqual({ authorization: '[REDACTED]', name: 'John' });
  });

  it('redacts nested sensitive keys', () => {
    const result = redact(
      { user: { password: 'hunter2', token: 'tok123', email: 'a@b.com' } },
      fields,
    );
    expect(result).toEqual({
      user: { password: '[REDACTED]', token: '[REDACTED]', email: 'a@b.com' },
    });
  });

  it('redacts keys case-insensitively', () => {
    const result = redact({ Authorization: 'Bearer xyz', X_API_KEY: 'key' }, fields);
    expect((result as Record<string, unknown>)['Authorization']).toBe('[REDACTED]');
  });

  it('handles arrays by redacting each element', () => {
    const result = redact([{ password: 'p1' }, { password: 'p2', safe: true }], fields);
    expect(result).toEqual([
      { password: '[REDACTED]' },
      { password: '[REDACTED]', safe: true },
    ]);
  });

  it('returns primitives unchanged', () => {
    expect(redact('hello', fields)).toBe('hello');
    expect(redact(42, fields)).toBe(42);
    expect(redact(null, fields)).toBeNull();
  });

  it('does not mutate the original object', () => {
    const original = { authorization: 'Bearer secret', name: 'Alice' };
    redact(original, fields);
    expect(original.authorization).toBe('Bearer secret');
  });
});

describe('RequestLoggingInterceptor', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.LOG_REDACT_FIELDS;
  });

  it('logs method, url, status code, and duration', async () => {
    const interceptor = new RequestLoggingInterceptor();
    const context = createExecutionContext(
      { method: 'GET', url: '/health' },
      { statusCode: 200 },
    );
    const next: CallHandler = { handle: () => of('ok') };

    jest.spyOn(Date, 'now').mockReturnValueOnce(100).mockReturnValueOnce(115);
    const logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);

    await expect(lastValueFrom(interceptor.intercept(context, next))).resolves.toBe('ok');

    expect(logSpy).toHaveBeenCalledWith('GET /health 200 15ms', expect.any(Object));
  });

  it('does not log sensitive request data', async () => {
    const interceptor = new RequestLoggingInterceptor();
    const context = createExecutionContext(
      {
        method: 'POST',
        url: '/auth/verify?token=sensitive-query-token',
        headers: { authorization: 'Bearer secret-token' },
        body: { password: 'super-secret', email: 'user@example.com' },
        query: { token: 'sensitive-query-token' },
      },
      { statusCode: 401 },
    );
    const next: CallHandler = { handle: () => of('denied') };

    jest.spyOn(Date, 'now').mockReturnValueOnce(200).mockReturnValueOnce(240);
    const logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);

    await lastValueFrom(interceptor.intercept(context, next));

    const [message, meta] = logSpy.mock.calls.at(-1) ?? [];

    expect(message).toBe('POST /auth/verify 401 40ms');
    expect(message).not.toContain('secret-token');
    expect(message).not.toContain('super-secret');
    expect(message).not.toContain('sensitive-query-token');

    // headers and body are passed as metadata — sensitive values must be redacted
    expect((meta as Record<string, unknown>).headers).toEqual({
      authorization: '[REDACTED]',
    });
    expect((meta as Record<string, unknown>).body).toEqual({
      password: '[REDACTED]',
      email: 'user@example.com',
    });
  });

  it('redacts authorization header', async () => {
    const interceptor = new RequestLoggingInterceptor();
    const context = createExecutionContext(
      {
        method: 'GET',
        url: '/protected',
        headers: { authorization: 'Bearer jwt.token.here', 'content-type': 'application/json' },
        body: {},
      },
      { statusCode: 200 },
    );
    const next: CallHandler = { handle: () => of(null) };

    const logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);

    await lastValueFrom(interceptor.intercept(context, next));

    const [, meta] = logSpy.mock.calls.at(-1) ?? [];
    const headers = (meta as Record<string, unknown>).headers as Record<string, unknown>;
    expect(headers['authorization']).toBe('[REDACTED]');
    expect(headers['content-type']).toBe('application/json');
  });

  it('respects LOG_REDACT_FIELDS env variable', async () => {
    process.env.LOG_REDACT_FIELDS = 'customSecret,internalKey';

    const interceptor = new RequestLoggingInterceptor();
    const context = createExecutionContext(
      {
        method: 'POST',
        url: '/api/data',
        headers: { 'content-type': 'application/json' },
        body: { customSecret: 'should-be-gone', internalKey: 'also-gone', safe: 'visible' },
      },
      { statusCode: 200 },
    );
    const next: CallHandler = { handle: () => of(null) };

    const logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);

    await lastValueFrom(interceptor.intercept(context, next));

    const [, meta] = logSpy.mock.calls.at(-1) ?? [];
    const body = (meta as Record<string, unknown>).body as Record<string, unknown>;
    expect(body['customSecret']).toBe('[REDACTED]');
    expect(body['internalKey']).toBe('[REDACTED]');
    expect(body['safe']).toBe('visible');
  });

  it('redacts nested token and secret fields in body', async () => {
    const interceptor = new RequestLoggingInterceptor();
    const context = createExecutionContext(
      {
        method: 'POST',
        url: '/api/nested',
        headers: {},
        body: {
          user: { token: 'nested-token', secret: 'nested-secret', name: 'Alice' },
        },
      },
      { statusCode: 200 },
    );
    const next: CallHandler = { handle: () => of(null) };

    const logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);

    await lastValueFrom(interceptor.intercept(context, next));

    const [, meta] = logSpy.mock.calls.at(-1) ?? [];
    const body = (meta as Record<string, unknown>).body as Record<string, unknown>;
    const user = body['user'] as Record<string, unknown>;
    expect(user['token']).toBe('[REDACTED]');
    expect(user['secret']).toBe('[REDACTED]');
    expect(user['name']).toBe('Alice');
  });
});
