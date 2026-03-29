import { Test, TestingModule } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import * as request from 'supertest';
import { HealthModule } from '../src/health/health.module';
import { HealthService } from '../src/health/health.service';

describe('Health (e2e)', () => {
  let app: NestFastifyApplication;
  const mockHealthService = {
    getHealth: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [HealthModule],
    })
      .overrideProvider(HealthService)
      .useValue(mockHealthService)
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns 200 when ok', () => {
    mockHealthService.getHealth.mockResolvedValueOnce({
      status: 'ok',
      indexer: 'ok',
      supabase: 'ok',
      timestamp: new Date().toISOString(),
    });

    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe('ok');
        expect(res.body.indexer).toBe('ok');
        expect(res.body.supabase).toBe('ok');
        expect(res.body.timestamp).toBeDefined();
      });
  });

  it('GET /health returns 503 when degraded', () => {
    mockHealthService.getHealth.mockResolvedValueOnce({
      status: 'degraded',
      indexer: 'error',
      supabase: 'ok',
      timestamp: new Date().toISOString(),
    });

    return request(app.getHttpServer())
      .get('/health')
      .expect(503)
      .expect((res) => {
        expect(res.body.status).toBe('degraded');
        expect(res.body.indexer).toBe('error');
      });
  });
});
