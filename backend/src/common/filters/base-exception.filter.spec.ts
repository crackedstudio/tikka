/**
 * BaseExceptionFilter Tests
 *
 * The filter is registered globally in main.ts, so it shapes every error
 * response the API produces. These unit tests pin down the resolution rules
 * (Nest HttpException, the global ValidationPipe shape, TypeORM/unknown
 * failures, thrown non-Errors), the single sanitised envelope they all share,
 * production-mode redaction, the request-id sources, and the interaction with
 * ErrorResponseInterceptor so the two never double-wrap.
 */

import {
  ArgumentsHost,
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { throwError } from 'rxjs';
import * as Sentry from '@sentry/node';
import {
  BaseExceptionFilter,
  ErrorCode,
  type ApiErrorResponse,
} from './base-exception.filter';
import { ErrorResponseInterceptor } from '../../middleware/error-response.interceptor';
import { REQUEST_ID_HEADER } from '../../middleware/request-id.middleware';
import { getRequestId } from '../../middleware/request-context';

jest.mock('@sentry/node', () => ({ captureException: jest.fn() }));
jest.mock('../../middleware/request-context', () => ({ getRequestId: jest.fn() }));

const mockGetRequestId = getRequestId as jest.MockedFunction<typeof getRequestId>;
const mockCaptureException = Sentry.captureException as jest.Mock;

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

interface HostHarness {
  host: ArgumentsHost;
  header: jest.Mock;
  status: jest.Mock;
  sent: () => ApiErrorResponse;
}

/**
 * Minimal Fastify ArgumentsHost double: `reply.status(code).send(body)` plus the
 * `reply.header` used for Retry-After.
 */
function createHost(
  options: { url?: string; headers?: Record<string, string> } = {},
): HostHarness {
  const send = jest.fn();
  const status = jest.fn(() => ({ send }));
  const header = jest.fn();
  const reply = { status, send, header };
  const request = {
    url: options.url ?? '/test-path',
    headers: options.headers ?? {},
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => reply,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;

  return {
    host,
    header,
    status,
    sent: () => {
      expect(status).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledTimes(1);
      return send.mock.calls[0][0] as ApiErrorResponse;
    },
  };
}

function createFilter(nodeEnv: string = 'test'): BaseExceptionFilter {
  process.env.NODE_ENV = nodeEnv;
  return new BaseExceptionFilter();
}

/** Mirrors the error TypeORM's QueryFailedError exposes to the filter. */
function queryFailedError(): Error {
  const error = new Error('insert into "raffles" ("id") values ($1) returning "id"');
  Object.assign(error, {
    name: 'QueryFailedError',
    code: '23505',
    driverError: {
      code: '23505',
      detail: 'Key (id)=(1) already exists.',
      query: 'insert into "raffles" ("id") values ($1)',
    },
  });
  return error;
}

describe('BaseExceptionFilter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    mockGetRequestId.mockReturnValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (ORIGINAL_NODE_ENV === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    }
  });

  describe('Nest HttpException resolution', () => {
    it('maps an HttpException to the canonical envelope', () => {
      const filter = createFilter();
      const host = createHost({
        url: '/raffles/1',
        headers: { [REQUEST_ID_HEADER]: 'req-1' },
      });

      filter.catch(new HttpException('Bad request', HttpStatus.BAD_REQUEST), host.host);

      expect(host.status).toHaveBeenCalledWith(400);
      expect(host.sent()).toEqual({
        statusCode: 400,
        error: ErrorCode.BAD_REQUEST,
        message: 'Bad request',
        requestId: 'req-1',
        timestamp: expect.any(String),
        path: '/raffles/1',
      });
    });

    it('maps each HTTP status to its error code', () => {
      const cases: Array<[HttpException, number, ErrorCode]> = [
        [new NotFoundException('raffle missing'), 404, ErrorCode.NOT_FOUND],
        [new UnauthorizedException('no token'), 401, ErrorCode.UNAUTHORIZED],
        [new ForbiddenException('not yours'), 403, ErrorCode.FORBIDDEN],
        [new ConflictException('duplicate'), 409, ErrorCode.CONFLICT],
        [
          new ServiceUnavailableException('maintenance'),
          503,
          ErrorCode.SERVICE_UNAVAILABLE,
        ],
        [new HttpException('slow down', 429), 429, ErrorCode.RATE_LIMIT_EXCEEDED],
        [new HttpException('teapot', 418), 418, ErrorCode.BAD_REQUEST],
        [new HttpException('kaboom', 500), 500, ErrorCode.INTERNAL_ERROR],
      ];

      for (const [exception, expectedStatus, expectedCode] of cases) {
        const filter = createFilter();
        const host = createHost();

        filter.catch(exception, host.host);

        const body = host.sent();
        expect(body.statusCode).toBe(expectedStatus);
        expect(body.error).toBe(expectedCode);
      }
    });

    it('copies retryAfter from a throttler HttpException onto the Retry-After header', () => {
      const filter = createFilter();
      const host = createHost();

      filter.catch(
        new HttpException({ message: 'Too many requests', retryAfter: 30 }, 429),
        host.host,
      );

      expect(host.header).toHaveBeenCalledWith('Retry-After', '30');
      expect(host.sent()).toMatchObject({
        statusCode: 429,
        error: ErrorCode.RATE_LIMIT_EXCEEDED,
        message: 'Too many requests',
      });
    });

    it('does not set Retry-After for ordinary exceptions', () => {
      const filter = createFilter();
      const host = createHost();

      filter.catch(new NotFoundException('nope'), host.host);

      expect(host.header).not.toHaveBeenCalled();
    });
  });

  describe('global ValidationPipe failures', () => {
    it('joins the ValidationPipe message array and keeps BAD_REQUEST', () => {
      const filter = createFilter();
      const host = createHost();

      // Exactly what Nest's global ValidationPipe throws before the filter.
      filter.catch(
        new BadRequestException({
          message: [
            'title must be a string',
            'totalTickets must be a positive integer',
          ],
          error: 'Bad Request',
          statusCode: 400,
        }),
        host.host,
      );

      const body = host.sent();
      expect(body).toMatchObject({
        statusCode: 400,
        error: ErrorCode.BAD_REQUEST,
        message: 'title must be a string; totalTickets must be a positive integer',
      });
      expect(body.details).toBeUndefined();
    });

    it('marks a structured errors array as VALIDATION_ERROR and preserves it', () => {
      const filter = createFilter();
      const host = createHost();
      const errors = [
        { code: 'too_small', path: ['totalTickets'], message: 'Must be at least 1' },
      ];

      filter.catch(
        new BadRequestException({ message: 'Validation failed', errors }),
        host.host,
      );

      const body = host.sent();
      expect(body.error).toBe(ErrorCode.VALIDATION_ERROR);
      expect(body.details).toEqual(errors);
    });
  });

  describe('TypeORM and unknown failures', () => {
    it('sanitises a TypeORM QueryFailedError in production', () => {
      const filter = createFilter('production');
      const host = createHost({ headers: { [REQUEST_ID_HEADER]: 'req-typeorm' } });
      const error = queryFailedError();

      filter.catch(error, host.host);

      const body = host.sent();
      expect(body.statusCode).toBe(500);
      expect(body.error).toBe(ErrorCode.INTERNAL_ERROR);
      expect(body.message).toBe('Internal server error');
      expect(body.details).toBeUndefined();
      expect(body.requestId).toBe('req-typeorm');

      const serialized = JSON.stringify(body);
      expect(serialized).not.toContain('QueryFailedError');
      expect(serialized).not.toContain('23505');
      expect(serialized).not.toContain('raffles');
      expect(serialized).not.toContain('already exists');
    });

    it('never leaks a stack trace, source path or internal message in production', () => {
      const filter = createFilter('production');
      const host = createHost();
      const secret = new Error('Failed to fetch user by email');
      secret.stack = [
        'Error: Failed to fetch user by email',
        '    at UsersService.findOne (/app/src/users/users.service.ts:42:5)',
        '    at processTicksAndRejections (node:internal/process/task_queues:95:5)',
      ].join('\n');

      filter.catch(secret, host.host);

      const serialized = JSON.stringify(host.sent());
      expect(serialized).not.toContain('Failed to fetch user by email');
      expect(serialized).not.toContain('users.service.ts');
      expect(serialized).not.toContain('/app/src');
      expect(serialized).not.toContain('at UsersService');
    });

    it('handles a thrown string', () => {
      const filter = createFilter();
      const host = createHost();

      filter.catch('something exploded', host.host);

      const body = host.sent();
      expect(body.statusCode).toBe(500);
      expect(body.error).toBe(ErrorCode.INTERNAL_ERROR);
      expect(body.message).toBe('Internal server error');
      expect(JSON.stringify(body)).not.toContain('something exploded');
    });

    it('handles a non-Error object', () => {
      const filter = createFilter();
      const host = createHost();

      filter.catch({ status: 500, reason: 'driver exploded', sql: 'SELECT 1' }, host.host);

      const body = host.sent();
      expect(body.statusCode).toBe(500);
      expect(body.error).toBe(ErrorCode.INTERNAL_ERROR);
      expect(body.message).toBe('Internal server error');
      expect(JSON.stringify(body)).not.toContain('driver exploded');
      expect(JSON.stringify(body)).not.toContain('SELECT 1');
    });

    it.each([[null], [undefined], [42]])(
      'handles a thrown %p as an internal error',
      (value) => {
        const filter = createFilter();
        const host = createHost();

        filter.catch(value, host.host);

        expect(host.sent()).toMatchObject({
          statusCode: 500,
          error: ErrorCode.INTERNAL_ERROR,
          message: 'Internal server error',
        });
      },
    );

    it('reports unknown failures to Sentry', () => {
      const filter = createFilter();
      const host = createHost();

      filter.catch(new Error('boom'), host.host);

      expect(mockCaptureException).toHaveBeenCalledTimes(1);
    });
  });

  describe('Supabase and Stellar failures', () => {
    it('marks a Supabase-shaped error as SUPABASE_ERROR', () => {
      const filter = createFilter();
      const host = createHost();
      const supabaseError = Object.assign(
        new Error('new row violates row-level security policy for table "raffles"'),
        { code: '42501', details: 'RLS policy violation', hint: 'enable a policy' },
      );

      filter.catch(supabaseError, host.host);

      const body = host.sent();
      expect(body.statusCode).toBe(502);
      expect(body.error).toBe(ErrorCode.SUPABASE_ERROR);
      expect(body.message).toContain('row-level security');
      expect(body.details).toEqual({ code: '42501', hint: 'enable a policy' });
    });

    it('marks a Stellar error and surfaces the response detail', () => {
      const filter = createFilter();
      const host = createHost();
      const stellarError = Object.assign(new Error('stellar request failed'), {
        response: { status: 400, data: { detail: 'tx_bad_seq' } },
      });

      filter.catch(stellarError, host.host);

      const body = host.sent();
      expect(body.statusCode).toBe(400);
      expect(body.error).toBe(ErrorCode.STELLAR_ERROR);
      expect(body.message).toBe('tx_bad_seq');
      expect(body.details).toEqual({ response: { detail: 'tx_bad_seq' } });
    });

    it('defaults a Stellar error without a numeric status to 502', () => {
      const filter = createFilter();
      const host = createHost();
      const stellarError = Object.assign(new Error('stellar timed out'), {
        response: { data: { message: 'horizon unavailable' } },
      });

      filter.catch(stellarError, host.host);

      const body = host.sent();
      expect(body.statusCode).toBe(HttpStatus.BAD_GATEWAY);
      expect(body.error).toBe(ErrorCode.STELLAR_ERROR);
      expect(body.message).toBe('horizon unavailable');
    });
  });

  describe('response envelope consistency', () => {
    it('returns the same key set and request id for every error class', () => {
      const filter = createFilter();
      const requiredKeys = [
        'statusCode',
        'error',
        'message',
        'requestId',
        'timestamp',
        'path',
      ];
      const exceptions: unknown[] = [
        new HttpException('bad', 400),
        new NotFoundException('missing'),
        new UnauthorizedException(),
        new ForbiddenException(),
        new ConflictException(),
        new ServiceUnavailableException(),
        new Error('unexpected'),
        'a string',
        { weird: true },
        42,
        null,
      ];

      for (const exception of exceptions) {
        const host = createHost({
          url: '/envelope',
          headers: { [REQUEST_ID_HEADER]: 'req-shape' },
        });

        filter.catch(exception, host.host);

        const body = host.sent();
        expect(requiredKeys.every((key) => key in body)).toBe(true);
        expect(
          Object.keys(body).filter((key) => !requiredKeys.includes(key)),
        ).toEqual([]);
        expect(body.requestId).toBe('req-shape');
        expect(body.path).toBe('/envelope');
        expect(typeof body.statusCode).toBe('number');
        expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
      }
    });

    it('adds details only when the error carries them', () => {
      const filter = createFilter();
      const plain = createHost();
      const validation = createHost();

      filter.catch(new Error('boom'), plain.host);
      filter.catch(
        new BadRequestException({ message: 'bad', errors: [{ code: 'x' }] }),
        validation.host,
      );

      expect(plain.sent().details).toBeUndefined();
      expect(validation.sent().details).toEqual([{ code: 'x' }]);
    });
  });

  describe('request id resolution', () => {
    it('prefers the AsyncLocalStorage request id over the header', () => {
      const filter = createFilter();
      const host = createHost({ headers: { [REQUEST_ID_HEADER]: 'header-id' } });
      mockGetRequestId.mockReturnValue('context-id');

      filter.catch(new NotFoundException(), host.host);

      expect(host.sent().requestId).toBe('context-id');
    });

    it('falls back to the x-request-id header', () => {
      const filter = createFilter();
      const host = createHost({ headers: { [REQUEST_ID_HEADER]: 'header-id' } });

      filter.catch(new NotFoundException(), host.host);

      expect(host.sent().requestId).toBe('header-id');
    });

    it('leaves requestId undefined when neither source is present', () => {
      const filter = createFilter();
      const host = createHost();

      filter.catch(new NotFoundException(), host.host);

      const body = host.sent();
      expect('requestId' in body).toBe(true);
      expect(body.requestId).toBeUndefined();
    });
  });

  describe('interaction with ErrorResponseInterceptor', () => {
    const runInterceptor = (error: unknown) => {
      const interceptor = new ErrorResponseInterceptor();
      const executionContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { [REQUEST_ID_HEADER]: 'req-interceptor' },
          }),
        }),
      } as unknown as ExecutionContext;
      const next = { handle: () => throwError(() => error) } as CallHandler;

      let caught: unknown = undefined;
      interceptor.intercept(executionContext, next).subscribe({
        error: (err) => {
          caught = err;
        },
      });
      return caught;
    };

    it('does not double-wrap a Nest HttpException after the interceptor enriched it', () => {
      const filter = createFilter();
      const caught = runInterceptor(new BadRequestException('Invalid input'));

      // The interceptor mutates the exception response; the filter must still
      // emit one flat envelope rather than nesting that response.
      expect((caught as HttpException).getResponse()).toMatchObject({
        requestId: 'req-interceptor',
      });

      const host = createHost({
        headers: { [REQUEST_ID_HEADER]: 'req-interceptor' },
      });
      filter.catch(caught, host.host);

      const body = host.sent();
      expect(body).toMatchObject({
        statusCode: 400,
        error: ErrorCode.BAD_REQUEST,
        message: 'Invalid input',
        requestId: 'req-interceptor',
      });
      expect('response' in body).toBe(false);
      expect(typeof body.error).toBe('string');
      // requestId appears exactly once — a double wrap would duplicate it.
      expect(JSON.stringify(body).match(/req-interceptor/g)).toHaveLength(1);
    });

    it('does not expose the raw error after the interceptor wrapped a plain Error', () => {
      const filter = createFilter();
      const caught = runInterceptor(new Error('db exploded'));

      expect(caught).toHaveProperty('response');
      expect((caught as { response?: { requestId?: string } }).response?.requestId).toBe(
        'req-interceptor',
      );

      const host = createHost({
        headers: { [REQUEST_ID_HEADER]: 'req-interceptor' },
      });
      filter.catch(caught, host.host);

      const body = host.sent();
      expect(body).toMatchObject({
        statusCode: 500,
        error: ErrorCode.INTERNAL_ERROR,
        message: 'Internal server error',
        requestId: 'req-interceptor',
      });
      const serialized = JSON.stringify(body);
      expect(serialized).not.toContain('db exploded');
      expect(serialized.match(/req-interceptor/g)).toHaveLength(1);
    });
  });
});
