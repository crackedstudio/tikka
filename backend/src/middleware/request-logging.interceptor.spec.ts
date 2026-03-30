import {
  CallHandler,
  ExecutionContext,
  Logger,
} from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { RequestLoggingInterceptor } from './request-logging.interceptor';

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

describe('RequestLoggingInterceptor', () => {
  afterEach(() => {
    jest.restoreAllMocks();
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

    await expect(lastValueFrom(interceptor.intercept(context, next))).resolves.toBe(
      'ok',
    );

    expect(logSpy).toHaveBeenCalledWith('GET /health 200 15ms');
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

    const [message] = logSpy.mock.calls.at(-1) ?? [];

    expect(message).toBe('POST /auth/verify 401 40ms');
    expect(message).not.toContain('secret-token');
    expect(message).not.toContain('super-secret');
    expect(message).not.toContain('user@example.com');
    expect(message).not.toContain('sensitive-query-token');
  });
});
