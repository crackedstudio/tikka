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
  Module,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { BaseExceptionFilter } from '../src/common/filters/base-exception.filter';
import { REQUEST_ID_HEADER } from '../src/middleware/request-id.middleware';

// Test controller to trigger various exceptions
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
    throw 'String error';
  }

  @Get('null-exception')
  throwNullException() {
    throw null;
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

describe('BaseExceptionFilter (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [TestModule],
    }).compile();

    // Using 'as any' bypasses the type mismatch error between Fastify versions
    // @ts-ignore
    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter() as any,
    ) as any;
    app.useGlobalFilters(new BaseExceptionFilter());

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('HttpException handling', () => {
    it('should catch HttpException and return proper error response', () => {
      return request(app.getHttpServer())
        .get('/test-errors/http-exception')
        .set('x-request-id', 'test-request-id')
        .expect(400)
        .expect((res) => {
          expect(res.body).toHaveProperty('statusCode', 400);
          expect(res.body).toHaveProperty('error', 'Bad Request');
          expect(res.body).toHaveProperty('message', 'Bad request');
          expect(res.body).toHaveProperty('error', 'BAD_REQUEST');
          expect(res.body).toHaveProperty('requestId', 'test-request-id');
          expect(res.body).toHaveProperty('timestamp');
          expect(res.body).toHaveProperty('path', '/test-errors/http-exception');
          expect(res.body).toHaveProperty(REQUEST_ID_HEADER, 'req-123');
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
          expect(res.body).toHaveProperty('timestamp');
          expect(res.body).toHaveProperty('path', '/test-errors/not-found');
          expect(res.body).toHaveProperty(REQUEST_ID_HEADER, 'req-404');
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
  });

  describe('Unexpected error handling', () => {
    it('should catch unexpected errors and return 500', () => {
      return request(app.getHttpServer())
        .get('/test-errors/internal-error')
        .set(REQUEST_ID_HEADER, 'req-500')
        .expect(500)
        .expect((res) => {
          expect(res.body).toHaveProperty('statusCode', 500);
          expect(res.body).toHaveProperty('error', 'INTERNAL_ERROR');
          expect(res.body).toHaveProperty(
            'message',
            'Internal server error',
          );
          expect(res.body).toHaveProperty('timestamp');
          expect(res.body).toHaveProperty('path', '/test-errors/internal-error');
          expect(res.body).toHaveProperty(REQUEST_ID_HEADER, 'req-500');
          expect(res.body.timestamp).toBeTruthy();
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
          expect(res.body).toHaveProperty(
            'message',
            'Internal server error',
          );
          expect(res.body).toHaveProperty('path', '/test-errors/string-exception');
        });
    });

    it('should handle null errors', () => {
      return request(app.getHttpServer())
        .get('/test-errors/null-exception')
        .expect(500)
        .expect((res) => {
          expect(res.body).toHaveProperty('statusCode', 500);
          expect(res.body).toHaveProperty('error', 'INTERNAL_ERROR');
          expect(res.body).toHaveProperty(
            'message',
            'Internal server error',
          );
          expect(res.body).toHaveProperty('path', '/test-errors/null-exception');
        });
    });
  });

  describe('Response format validation', () => {
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
          expect(typeof res.body.error).toBe('string');
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
          // Should be valid ISO 8601 format
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
  });

  describe('Success responses (no filter interference)', () => {
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
});
