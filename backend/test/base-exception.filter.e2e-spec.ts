import { Test, TestingModule } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import * as request from 'supertest';
import {
  BadRequestException,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  Module,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { BaseExceptionFilter } from '../src/common/filters/base-exception.filter';
import { REQUEST_ID_HEADER } from '../src/middleware/request-id.middleware';

// ---------------------------------------------------------------------------
// Fake infrastructure errors used in redaction tests
// ---------------------------------------------------------------------------

/** Mimics typeorm QueryFailedError (duck-typed, no typeorm dep needed). */
class FakeQueryFailedError extends Error {
  readonly query = 'SELECT * FROM users WHERE id = $1';
  readonly parameters = ['secret-id'];
  readonly driverError = { message: 'duplicate key value violates unique constraint "users_email_key"' };
  constructor() {
    super('duplicate key value violates unique constraint "users_email_key"');
    this.name = 'QueryFailedError';
  }
}

/** Mimics a Supabase PostgrestError. */
class FakeSupabaseError extends Error {
  readonly code = '23505';
  readonly details = 'Key (email)=(user@example.com) already exists.';
  readonly hint = 'Change the email or delete the conflicting row.';
  // Supabase errors include the project reference in the message
  constructor() {
    super('duplicate key value violates unique constraint (project-ref: abcxyz123)');
    this.name = 'PostgrestError';
  }
}

/** Mimics the Stellar SDK AxiosError-style error. */
class FakeStellarError extends Error {
  readonly response = {
    status: 400,
    data: {
      type: 'https://stellar.org/horizon-errors/transaction_failed',
      title: 'Transaction Failed',
      status: 400,
      detail: 'tx_bad_seq — sequence=9876543210987654321, account=GABC...XYZ',
      extras: {
        result_codes: { transaction: 'tx_bad_seq' },
      },
    },
  };
  constructor() {
    super('Request failed with status code 400');
    this.name = 'AxiosError';
  }
}

// ---------------------------------------------------------------------------
// Test controller
// ---------------------------------------------------------------------------

@Controller('test-errors')
class TestErrorController {
  @Get('http-exception')
  throwHttpException() {
    throw new HttpException('Bad request', HttpStatus.BAD_REQUEST);
  }

  @Get('not-found')
  throwNotFoundException() {
    throw new NotFoundException('Resource not found');
  }

  @Get('bad-request')
  throwBadRequest() {
    throw new BadRequestException('Invalid input');
  }

  @Get('unauthorized')
  throwUnauthorized() {
    throw new UnauthorizedException('Missing or invalid token');
  }

  @Get('forbidden')
  throwForbidden() {
    throw new ForbiddenException('Insufficient permissions');
  }

  @Get('conflict')
  throwConflict() {
    throw new ConflictException('Duplicate entry');
  }

  @Get('service-unavailable')
  throwServiceUnavailable() {
    throw new ServiceUnavailableException('Under maintenance');
  }

  @Get('validation-error')
  throwValidationError() {
    throw new BadRequestException({
      message: 'Validation failed',
      errors: [
        { code: 'invalid_type', path: ['email'], message: 'Expected string, received number' },
        { code: 'too_small', path: ['age'], message: 'Must be at least 18', expected: '18', received: '15' },
      ],
    });
  }

  @Get('internal-error')
  throwInternalError() {
    throw new Error('Unexpected error');
  }

  @Get('string-exception')
  throwStringException() {
    // eslint-disable-next-line @typescript-eslint/no-throw-literal
    throw 'String error';
  }

  @Get('null-exception')
  throwNullException() {
    // eslint-disable-next-line @typescript-eslint/no-throw-literal
    throw null;
  }

  // ---------- infrastructure error routes ----------

  @Get('db-query-failed')
  throwQueryFailedError() {
    throw new FakeQueryFailedError();
  }

  @Get('supabase-error')
  throwSupabaseError() {
    throw new FakeSupabaseError();
  }

  @Get('stellar-error')
  throwStellarError() {
    throw new FakeStellarError();
  }

  /** InternalServerErrorException whose message includes raw storage detail */
  @Get('storage-error')
  throwStorageError() {
    throw new InternalServerErrorException(
      'Failed to upload image to storage: StorageApiError: Bucket not found (bucket: raffle-images-prod)',
    );
  }

  @Get('success')
  success() {
    return { message: 'success' };
  }
}

@Module({
  controllers: [TestErrorController],
})
class TestModule {}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function buildApp(nodeEnv: string): Promise<NestFastifyApplication> {
  const savedEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = nodeEnv;

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [TestModule],
  }).compile();

  // @ts-ignore — FastifyAdapter version mismatch
  const app = moduleFixture.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter() as any,
  ) as any;

  // Instantiate the filter AFTER setting NODE_ENV so isProd is correct.
  app.useGlobalFilters(new BaseExceptionFilter());

  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  // Restore for safety in parallel test runs
  process.env.NODE_ENV = savedEnv;

  return app;
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe('BaseExceptionFilter (e2e)', () => {
  describe('development mode', () => {
    let app: NestFastifyApplication;

    beforeAll(async () => {
      app = await buildApp('development');
    });

    afterAll(async () => {
      await app.close();
    });

    // ---- HttpException handling ----

    it('should catch HttpException and return proper error response', () => {
      return request(app.getHttpServer())
        .get('/test-errors/http-exception')
        .set('x-request-id', 'test-request-id')
        .expect(400)
        .expect((res) => {
          expect(res.body).toHaveProperty('statusCode', 400);
          expect(res.body).toHaveProperty('error', 'BAD_REQUEST');
          expect(res.body).toHaveProperty('message', 'Bad request');
          expect(res.body).toHaveProperty('requestId', 'test-request-id');
          expect(res.body).toHaveProperty('timestamp');
          expect(res.body).toHaveProperty('path', '/test-errors/http-exception');
          expect(res.body.timestamp).toBeTruthy();
        });
    });

    it('should handle different HTTP status codes', () => {
      return request(app.getHttpServer())
        .get('/test-errors/not-found')
        .set('x-request-id', 'test-request-id')
        .expect(404)
        .expect((res) => {
          expect(res.body).toHaveProperty('statusCode', 404);
          expect(res.body).toHaveProperty('message', 'Resource not found');
          expect(res.body).toHaveProperty('error', 'NOT_FOUND');
          expect(res.body).toHaveProperty('requestId', 'test-request-id');
          expect(res.body).toHaveProperty('timestamp');
          expect(res.body).toHaveProperty('path', '/test-errors/not-found');
        });
    });

    it('should map 400 BadRequestException to BAD_REQUEST', () => {
      return request(app.getHttpServer())
        .get('/test-errors/bad-request')
        .set('x-request-id', 'test-request-id')
        .expect(400)
        .expect((res) => {
          expect(res.body).toHaveProperty('error', 'BAD_REQUEST');
        });
    });

    it('should map 401 UnauthorizedException to UNAUTHORIZED', () => {
      return request(app.getHttpServer())
        .get('/test-errors/unauthorized')
        .set('x-request-id', 'test-request-id')
        .expect(401)
        .expect((res) => {
          expect(res.body).toHaveProperty('error', 'UNAUTHORIZED');
          expect(res.body).toHaveProperty('message', 'Missing or invalid token');
        });
    });

    it('should map 403 ForbiddenException to FORBIDDEN', () => {
      return request(app.getHttpServer())
        .get('/test-errors/forbidden')
        .set('x-request-id', 'test-request-id')
        .expect(403)
        .expect((res) => {
          expect(res.body).toHaveProperty('error', 'FORBIDDEN');
        });
    });

    it('should map 409 ConflictException to CONFLICT', () => {
      return request(app.getHttpServer())
        .get('/test-errors/conflict')
        .set('x-request-id', 'test-request-id')
        .expect(409)
        .expect((res) => {
          expect(res.body).toHaveProperty('error', 'CONFLICT');
          expect(res.body).toHaveProperty('message', 'Duplicate entry');
        });
    });

    it('should map 503 ServiceUnavailableException to SERVICE_UNAVAILABLE', () => {
      return request(app.getHttpServer())
        .get('/test-errors/service-unavailable')
        .set('x-request-id', 'test-request-id')
        .expect(503)
        .expect((res) => {
          expect(res.body).toHaveProperty('error', 'SERVICE_UNAVAILABLE');
          expect(res.body).toHaveProperty('message', 'Under maintenance');
        });
    });

    it('should preserve Zod validation error details as VALIDATION_ERROR', () => {
      return request(app.getHttpServer())
        .get('/test-errors/validation-error')
        .set('x-request-id', 'test-request-id')
        .expect(400)
        .expect((res) => {
          expect(res.body).toHaveProperty('error', 'VALIDATION_ERROR');
          expect(res.body).toHaveProperty('details');
          expect(Array.isArray(res.body.details)).toBe(true);
          expect(res.body.details).toHaveLength(2);
          expect(res.body.details[0]).toHaveProperty('code', 'invalid_type');
          expect(res.body.details[0]).toHaveProperty('path');
          expect(res.body.details[1]).toHaveProperty('code', 'too_small');
        });
    });

    // ---- Unexpected error handling ----

    it('should catch unexpected errors and return 500', () => {
      return request(app.getHttpServer())
        .get('/test-errors/internal-error')
        .set(REQUEST_ID_HEADER, 'req-500')
        .expect(500)
        .expect((res) => {
          expect(res.body).toHaveProperty('statusCode', 500);
          expect(res.body).toHaveProperty('error', 'INTERNAL_ERROR');
          expect(res.body).toHaveProperty('requestId', 'req-500');
          expect(res.body).toHaveProperty('timestamp');
          expect(res.body).toHaveProperty('path', '/test-errors/internal-error');
          expect(res.body.timestamp).toBeTruthy();
          // Raw message must never appear even in dev for the unknown-error path
          expect(JSON.stringify(res.body)).not.toContain('Unexpected error');
        });
    });

    it('should handle string errors', () => {
      return request(app.getHttpServer())
        .get('/test-errors/string-exception')
        .expect(500)
        .expect((res) => {
          expect(res.body).toHaveProperty('statusCode', 500);
          expect(res.body).toHaveProperty('error', 'INTERNAL_ERROR');
          expect(res.body).toHaveProperty('path', '/test-errors/string-exception');
          expect(JSON.stringify(res.body)).not.toContain('String error');
        });
    });

    it('should handle null errors', () => {
      return request(app.getHttpServer())
        .get('/test-errors/null-exception')
        .expect(500)
        .expect((res) => {
          expect(res.body).toHaveProperty('statusCode', 500);
          expect(res.body).toHaveProperty('error', 'INTERNAL_ERROR');
          expect(res.body).toHaveProperty('path', '/test-errors/null-exception');
        });
    });

    // ---- Response format validation ----

    it('should include all required fields in error response', () => {
      return request(app.getHttpServer())
        .get('/test-errors/http-exception')
        .set('x-request-id', 'test-request-id')
        .expect(400)
        .expect((res) => {
          const requiredFields = ['statusCode', 'message', 'error', 'requestId', 'timestamp', 'path'];
          requiredFields.forEach((field) => {
            expect(res.body).toHaveProperty(field);
          });
          expect(typeof res.body.statusCode).toBe('number');
          expect(typeof res.body.error).toBe('string');
          expect(typeof res.body.message).toBe('string');
          expect(typeof res.body.requestId).toBe('string');
          expect(typeof res.body.timestamp).toBe('string');
          expect(typeof res.body.path).toBe('string');
        });
    });

    it('should format timestamp as ISO string', () => {
      return request(app.getHttpServer())
        .get('/test-errors/http-exception')
        .expect(400)
        .expect((res) => {
          expect(new Date(res.body.timestamp)).toBeInstanceOf(Date);
          expect(() => new Date(res.body.timestamp).toISOString()).not.toThrow();
        });
    });

    it('should include correct path in response', () => {
      const testPath = '/test-errors/http-exception';
      return request(app.getHttpServer())
        .get(testPath)
        .expect(400)
        .expect((res) => {
          expect(res.body.path).toBe(testPath);
        });
    });

    // ---- Success passthrough ----

    it('should not interfere with successful responses', () => {
      return request(app.getHttpServer())
        .get('/test-errors/success')
        .expect(200)
        .expect((res) => {
          expect(res.body).toEqual({ message: 'success' });
          expect(res.body).not.toHaveProperty('statusCode');
          expect(res.body).not.toHaveProperty('timestamp');
        });
    });
  });

  // -------------------------------------------------------------------------
  // Production-mode redaction tests
  // These are the acceptance criteria for issue #1570.
  // -------------------------------------------------------------------------

  describe('production mode — error detail redaction', () => {
    let app: NestFastifyApplication;

    beforeAll(async () => {
      app = await buildApp('production');
    });

    afterAll(async () => {
      await app.close();
    });

    it('redacts QueryFailedError: no SQL, no constraint name in response', () => {
      return request(app.getHttpServer())
        .get('/test-errors/db-query-failed')
        .set(REQUEST_ID_HEADER, 'rid-db')
        .expect(500)
        .expect((res) => {
          // Must return safe generic fields only
          expect(res.body).toHaveProperty('statusCode', 500);
          expect(res.body).toHaveProperty('error', 'INTERNAL_ERROR');
          expect(res.body).toHaveProperty('requestId', 'rid-db');
          expect(res.body).toHaveProperty('timestamp');
          expect(res.body).toHaveProperty('path');

          // Must NOT expose schema/infrastructure detail
          const body = JSON.stringify(res.body);
          expect(body).not.toContain('SELECT');
          expect(body).not.toContain('users_email_key');
          expect(body).not.toContain('duplicate key');
          expect(body).not.toContain('secret-id');
          expect(res.body).not.toHaveProperty('details');
        });
    });

    it('redacts Supabase error: no project reference, no constraint detail in response', () => {
      return request(app.getHttpServer())
        .get('/test-errors/supabase-error')
        .set(REQUEST_ID_HEADER, 'rid-supa')
        .expect(500)
        .expect((res) => {
          expect(res.body).toHaveProperty('statusCode', 500);
          expect(res.body).toHaveProperty('error', 'INTERNAL_ERROR');
          expect(res.body).toHaveProperty('requestId', 'rid-supa');

          const body = JSON.stringify(res.body);
          // Project reference must not leak
          expect(body).not.toContain('abcxyz123');
          // Postgres constraint must not leak
          expect(body).not.toContain('23505');
          // Internal hint must not leak
          expect(body).not.toContain('email');
          expect(res.body).not.toHaveProperty('details');
        });
    });

    it('redacts Stellar SDK error: no account address, no sequence number in response', () => {
      return request(app.getHttpServer())
        .get('/test-errors/stellar-error')
        .set(REQUEST_ID_HEADER, 'rid-stellar')
        .expect(500)
        .expect((res) => {
          expect(res.body).toHaveProperty('statusCode', 500);
          expect(res.body).toHaveProperty('error', 'INTERNAL_ERROR');
          expect(res.body).toHaveProperty('requestId', 'rid-stellar');

          const body = JSON.stringify(res.body);
          // Internal Stellar error detail must not leak
          expect(body).not.toContain('tx_bad_seq');
          expect(body).not.toContain('9876543210987654321');
          expect(body).not.toContain('GABC');
          expect(res.body).not.toHaveProperty('details');
        });
    });

    it('redacts InternalServerErrorException carrying raw storage error message', () => {
      return request(app.getHttpServer())
        .get('/test-errors/storage-error')
        .set(REQUEST_ID_HEADER, 'rid-storage')
        .expect(500)
        .expect((res) => {
          expect(res.body).toHaveProperty('statusCode', 500);
          expect(res.body).toHaveProperty('error', 'INTERNAL_ERROR');
          expect(res.body).toHaveProperty('requestId', 'rid-storage');

          const body = JSON.stringify(res.body);
          // Bucket name must not appear in the response
          expect(body).not.toContain('raffle-images-prod');
          expect(body).not.toContain('StorageApiError');
          expect(body).not.toContain('Bucket not found');
        });
    });

    it('production response contains only code, safe message, and request ID (no extra fields)', () => {
      return request(app.getHttpServer())
        .get('/test-errors/db-query-failed')
        .set(REQUEST_ID_HEADER, 'rid-fields')
        .expect(500)
        .expect((res) => {
          const allowedKeys = new Set(['statusCode', 'error', 'message', 'requestId', 'timestamp', 'path']);
          const actualKeys = Object.keys(res.body);
          for (const key of actualKeys) {
            expect(allowedKeys).toContain(key);
          }
          // No `details` field
          expect(res.body).not.toHaveProperty('details');
        });
    });

    it('4xx HttpExceptions still return their original message in production', () => {
      return request(app.getHttpServer())
        .get('/test-errors/not-found')
        .expect(404)
        .expect((res) => {
          expect(res.body).toHaveProperty('error', 'NOT_FOUND');
          expect(res.body).toHaveProperty('message', 'Resource not found');
        });
    });

    it('validation errors still return details in production', () => {
      return request(app.getHttpServer())
        .get('/test-errors/validation-error')
        .expect(400)
        .expect((res) => {
          expect(res.body).toHaveProperty('error', 'VALIDATION_ERROR');
          expect(res.body).toHaveProperty('details');
          expect(Array.isArray(res.body.details)).toBe(true);
        });
    });
  });
});
