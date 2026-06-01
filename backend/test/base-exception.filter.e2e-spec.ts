import { Test, TestingModule } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import * as request from 'supertest';
import { Controller, Get, HttpException, HttpStatus, Module } from '@nestjs/common';
import { BaseExceptionFilter } from '../src/common/filters/base-exception.filter';

// Test controller to trigger various exceptions
@Controller('test-errors')
class TestErrorController {
  @Get('http-exception')
  throwHttpException() {
    throw new HttpException('Bad request', HttpStatus.BAD_REQUEST);
  }

  @Get('not-found')
  throwNotFoundException() {
    throw new HttpException('Not found', HttpStatus.NOT_FOUND);
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
        .expect(400)
        .expect((res) => {
          expect(res.body).toHaveProperty('statusCode', 400);
          expect(res.body).toHaveProperty('message', 'Bad request');
          expect(res.body).toHaveProperty('timestamp');
          expect(res.body).toHaveProperty('path', '/test-errors/http-exception');
          expect(res.body.timestamp).toBeTruthy();
        });
    });

    it('should handle different HTTP status codes', () => {
      return request(app.getHttpServer())
        .get('/test-errors/not-found')
        .expect(404)
        .expect((res) => {
          expect(res.body).toHaveProperty('statusCode', 404);
          expect(res.body).toHaveProperty('message', 'Not found');
          expect(res.body).toHaveProperty('timestamp');
          expect(res.body).toHaveProperty('path', '/test-errors/not-found');
        });
    });
  });

  describe('Unexpected error handling', () => {
    it('should catch unexpected errors and return 500', () => {
      return request(app.getHttpServer())
        .get('/test-errors/internal-error')
        .expect(500)
        .expect((res) => {
          expect(res.body).toHaveProperty('statusCode', 500);
          expect(res.body).toHaveProperty(
            'message',
            'Internal server error',
          );
          expect(res.body).toHaveProperty('timestamp');
          expect(res.body).toHaveProperty('path', '/test-errors/internal-error');
          expect(res.body.timestamp).toBeTruthy();
        });
    });

    it('should handle string errors', () => {
      return request(app.getHttpServer())
        .get('/test-errors/string-exception')
        .expect(500)
        .expect((res) => {
          expect(res.body).toHaveProperty('statusCode', 500);
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
        .expect(400)
        .expect((res) => {
          const requiredFields = ['statusCode', 'message', 'timestamp', 'path'];
          requiredFields.forEach((field) => {
            expect(res.body).toHaveProperty(field);
          });
          expect(typeof res.body.statusCode).toBe('number');
          expect(typeof res.body.message).toBe('string');
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
