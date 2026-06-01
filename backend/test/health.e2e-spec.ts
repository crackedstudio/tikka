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
    getLiveness: jest.fn(),
    getReadiness: jest.fn(),
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

  it('GET /health/live returns 200', () => {
    mockHealthService.getLiveness.mockReturnValueOnce({
      status: 'ok',
      uptimeMs: 100,
      timestamp: new Date().toISOString(),
    });

    return request(app.getHttpServer())
      .get('/health/live')
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe('ok');
      });
  });

  it('GET /health/ready returns 200 when ready', () => {
    mockHealthService.getReadiness.mockResolvedValueOnce({
      status: 'ready',
      checks: {},
      timestamp: new Date().toISOString(),
    });

    return request(app.getHttpServer())
      .get('/health/ready')
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe('ready');
      });
  });

  it('GET /health/ready returns 503 when not ready', () => {
    mockHealthService.getReadiness.mockResolvedValueOnce({
      status: 'not_ready',
      checks: { redis: { status: 'error' } },
      timestamp: new Date().toISOString(),
    });

    return request(app.getHttpServer())
      .get('/health/ready')
      .expect(503)
      .expect((res) => {
        expect(res.body.status).toBe('not_ready');
      });
  });

  it('GET /health returns 200 when ok', () => {
    mockHealthService.getHealth.mockResolvedValueOnce({
      status: 'ok',
      dependencies: {},
      pushDelivery: {},
      timestamp: new Date().toISOString(),
    });

    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe('ok');
      });
  });

  it('GET /health returns 503 when unhealthy', () => {
    mockHealthService.getHealth.mockResolvedValueOnce({
      status: 'unhealthy',
      dependencies: { redis: { status: 'error' } },
      pushDelivery: {},
      timestamp: new Date().toISOString(),
    });

    return request(app.getHttpServer())
      .get('/health')
      .expect(503)
      .expect((res) => {
        expect(res.body.status).toBe('unhealthy');
      });
  });
});
