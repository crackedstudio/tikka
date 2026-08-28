import { Test, TestingModule } from '@nestjs/testing';
import { Controller, Get, Post, INestApplication } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import * as request from 'supertest';
import { MaintenanceModeModule } from '../src/maintenance/maintenance-mode.module';
import { MaintenanceModeGuard } from '../src/maintenance/maintenance-mode.guard';
import { MaintenanceModeService } from '../src/maintenance/maintenance-mode.service';
import { BaseExceptionFilter } from '../src/common/filters/base-exception.filter';
import { HealthController } from '../src/health/health.controller';
import { HealthService } from '../src/health/health.service';
import { MetricsController } from '../src/health/metrics.controller';
import { MetadataCacheMetricsService } from '../src/services/metadata/metadata-cache-metrics.service';
import { MonitorController } from '../src/api/rest/monitor/monitor.controller';
import { MonitorService } from '../src/api/rest/monitor/monitor.service';
import { BackfillJobService } from '../src/services/indexer/backfill-job.service';

import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';

@Controller('api/test')
class TestApiController {
  @Get()
  getTest() {
    return { status: 'ok', data: 'get response' };
  }

  @Post()
  postTest() {
    return { status: 'ok', data: 'post response' };
  }
}

describe('Maintenance Mode (e2e)', () => {
  let app: NestFastifyApplication;
  let maintenanceService: MaintenanceModeService;

  const mockHealthService = {
    getHealth: jest.fn().mockResolvedValue({
      status: 'ok',
      indexer: 'ok',
      supabase: 'ok',
      timestamp: new Date().toISOString(),
    }),
  };

  const mockMetadataCacheMetrics = {
    getMetadataCacheHits: jest.fn().mockReturnValue(42),
  };

  const mockMonitorService = {
    getJobs: jest.fn(),
    getStats: jest.fn().mockResolvedValue({ uptime: 100 }),
    getLatency: jest.fn(),
    getErrors: jest.fn(),
    getAuditLogs: jest.fn(),
  };

  const mockBackfillJobService = {
    startBackfill: jest.fn(),
    getJobStatus: jest.fn(),
  };

  beforeAll(async () => {
    process.env.MAINTENANCE_BYPASS_TOKEN = 'secret-bypass-token';
    process.env.MAINTENANCE_SCOPES = 'all';
    process.env.ADMIN_TOKEN = 'test-admin-token';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        MaintenanceModeModule,
      ],
      controllers: [
        TestApiController,
        HealthController,
        MetricsController,
        MonitorController,
      ],
      providers: [
        { provide: APP_GUARD, useClass: MaintenanceModeGuard },
        { provide: HealthService, useValue: mockHealthService },
        { provide: MetadataCacheMetricsService, useValue: mockMetadataCacheMetrics },
        { provide: MonitorService, useValue: mockMonitorService },
        { provide: BackfillJobService, useValue: mockBackfillJobService },
      ],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter() as any,
    ) as any;
    app.useGlobalFilters(new BaseExceptionFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    maintenanceService = moduleFixture.get<MaintenanceModeService>(MaintenanceModeService);
  });

  afterAll(async () => {
    delete process.env.MAINTENANCE_BYPASS_TOKEN;
    delete process.env.MAINTENANCE_SCOPES;
    delete process.env.ADMIN_TOKEN;
    await app.close();
  });

  it('1. Returns 200 OK when maintenance mode is OFF', async () => {
    maintenanceService.setEnabled(false);

    await request(app.getHttpServer())
      .get('/api/test')
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe('ok');
      });

    await request(app.getHttpServer())
      .post('/api/test')
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe('ok');
      });
  });

  it('2. GET /monitor/maintenance returns status', async () => {
    maintenanceService.setEnabled(false);

    await request(app.getHttpServer())
      .get('/monitor/maintenance')
      .set('x-admin-token', 'test-admin-token')
      .expect(200)
      .expect((res) => {
        expect(res.body.maintenanceMode).toBe(false);
      });
  });

  it('3. Enables maintenance mode via PUT /monitor/maintenance and blocks API endpoints with 503 & Retry-After', async () => {
    await request(app.getHttpServer())
      .put('/monitor/maintenance')
      .set('x-admin-token', 'test-admin-token')
      .send({ enabled: true })
      .expect(200)
      .expect((res) => {
        expect(res.body.maintenanceMode).toBe(true);
      });

    expect(maintenanceService.isEnabled()).toBe(true);

    // GET request blocked
    await request(app.getHttpServer())
      .get('/api/test')
      .expect(503)
      .expect('Retry-After', '60')
      .expect((res) => {
        expect(res.body.statusCode).toBe(503);
        expect(res.body.error).toBe('SERVICE_UNAVAILABLE');
        expect(res.body.message).toContain('Service temporarily unavailable due to maintenance mode');
        expect(res.body.path).toBe('/api/test');
        expect(res.body.timestamp).toBeDefined();
      });

    // POST request blocked
    await request(app.getHttpServer())
      .post('/api/test')
      .expect(503)
      .expect('Retry-After', '60')
      .expect((res) => {
        expect(res.body.statusCode).toBe(503);
        expect(res.body.error).toBe('SERVICE_UNAVAILABLE');
      });
  });

  it('4. Health and Metrics endpoints remain reachable during active maintenance mode', async () => {
    maintenanceService.setEnabled(true);

    // Health endpoint
    await request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe('ok');
      });

    // Metrics endpoint
    await request(app.getHttpServer())
      .get('/metrics')
      .expect(200)
      .expect((res) => {
        expect(res.body.metadata_cache_hits).toBe(42);
      });

    // Monitor maintenance status endpoint
    await request(app.getHttpServer())
      .get('/monitor/maintenance')
      .set('x-admin-token', 'test-admin-token')
      .expect(200)
      .expect((res) => {
        expect(res.body.maintenanceMode).toBe(true);
      });
  });

  it('5. Allows bypass when Authorization header contains valid MAINTENANCE_BYPASS_TOKEN', async () => {
    maintenanceService.setEnabled(true);

    await request(app.getHttpServer())
      .get('/api/test')
      .set('Authorization', 'Bearer secret-bypass-token')
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe('ok');
      });
  });

  it('6. Disables maintenance mode via PUT /monitor/maintenance and unblocks endpoints', async () => {
    await request(app.getHttpServer())
      .put('/monitor/maintenance')
      .set('x-admin-token', 'test-admin-token')
      .send({ enabled: false })
      .expect(200)
      .expect((res) => {
        expect(res.body.maintenanceMode).toBe(false);
      });

    expect(maintenanceService.isEnabled()).toBe(false);

    await request(app.getHttpServer())
      .get('/api/test')
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe('ok');
      });
  });
});
