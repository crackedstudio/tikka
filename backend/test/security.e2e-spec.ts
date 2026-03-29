import { Controller, Get, Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import * as request from 'supertest';
import { configureSecurity } from '../src/bootstrap';

@Controller()
class SecurityTestController {
  @Get('security-check')
  getSecurityCheck() {
    return { ok: true };
  }
}

@Module({
  controllers: [SecurityTestController],
})
class SecurityTestModule {}

describe('Security bootstrap (e2e)', () => {
  let app: NestFastifyApplication;
  const originalFrontendUrl = process.env.VITE_FRONTEND_URL;
  const allowedOrigin = 'https://app.tikka.io';

  beforeAll(async () => {
    process.env.VITE_FRONTEND_URL = allowedOrigin;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [SecurityTestModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await configureSecurity(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    process.env.VITE_FRONTEND_URL = originalFrontendUrl;
    await app.close();
  });

  it('adds helmet security headers', () => {
    return request(app.getHttpServer())
      .get('/security-check')
      .expect(200)
      .expect((res) => {
        expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
        expect(res.headers['x-content-type-options']).toBe('nosniff');
      });
  });

  it('allows the configured frontend origin', () => {
    return request(app.getHttpServer())
      .get('/security-check')
      .set('Origin', allowedOrigin)
      .expect(200)
      .expect((res) => {
        expect(res.headers['access-control-allow-origin']).toBe(allowedOrigin);
        expect(res.headers['access-control-allow-credentials']).toBe('true');
      });
  });

  it('does not allow other origins', () => {
    return request(app.getHttpServer())
      .get('/security-check')
      .set('Origin', 'https://evil.example')
      .expect(200)
      .expect((res) => {
        expect(res.headers['access-control-allow-origin']).toBeUndefined();
      });
  });
});
