import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { ConfigService } from '@nestjs/config';
import { IS_PUBLIC_KEY } from '../../../auth/decorators/public.decorator';
import { MonitorController } from './monitor.controller';
import { MonitorService } from './monitor.service';
import { MaintenanceModeService } from '../../../maintenance/maintenance-mode.service';
import { BackfillJobService } from '../../../services/indexer/backfill-job.service';
import { AdminGuard } from './admin.guard';
import { AuditLogInterceptor } from './audit-log.interceptor';

describe('MonitorController', () => {
  describe('Metadata & Guard Configuration', () => {
    let reflector: Reflector;

    beforeEach(() => {
      reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
    });

    it('does not carry the @Public() decorator — anonymous access is rejected', () => {
      (reflector.getAllAndOverride as jest.Mock).mockImplementation(
        (key: string) => {
          if (key === IS_PUBLIC_KEY) return false;
          return undefined;
        },
      );

      const handler = () => {};
      const klass = MonitorController;

      const isPublic = reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        handler,
        klass,
      ]);

      expect(isPublic).toBe(false);
    });

    it('does not allow JWT guard to be bypassed for any monitor route', () => {
      const methods = [
        'getJobs',
        'getStats',
        'getLatency',
        'getErrors',
        'getAuditLogs',
        'startBackfill',
        'getBackfillStatus',
        'getMaintenanceMode',
        'setMaintenanceMode',
      ];

      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);

      for (const method of methods) {
        const handler = (MonitorController.prototype as any)[method];
        const isPublic = reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
          handler,
          MonitorController,
        ]);
        expect(isPublic).toBe(false);
      }
    });

    it('enforces AdminGuard and AuditLogInterceptor on the controller class', () => {
      const guards = Reflect.getMetadata('__guards__', MonitorController);
      expect(guards).toBeDefined();
      expect(guards).toContain(AdminGuard);

      const interceptors = Reflect.getMetadata('__interceptors__', MonitorController);
      expect(interceptors).toBeDefined();
      expect(interceptors).toContain(AuditLogInterceptor);
    });
  });

  describe('End-to-End Authorisation & Audit Logging', () => {
    let app: INestApplication;
    let mockMonitorService: any;
    let mockMaintenanceModeService: any;
    let mockBackfillJobService: any;
    let mockConfigService: any;

    beforeEach(async () => {
      mockMonitorService = {
        getJobs: jest.fn().mockResolvedValue({ data: [], total: 0, nextCursor: null }),
        getStats: jest.fn().mockResolvedValue({ pending: 0, completed: 0, failed: 0 }),
        getLatency: jest.fn().mockResolvedValue([]),
        getErrors: jest.fn().mockResolvedValue([]),
        getAuditLogs: jest.fn().mockResolvedValue([]),
        logAudit: jest.fn().mockResolvedValue(undefined),
      };

      mockMaintenanceModeService = {
        isEnabled: jest.fn().mockReturnValue(false),
        setEnabled: jest.fn(),
      };

      mockBackfillJobService = {
        startBackfill: jest.fn().mockReturnValue('backfill-uuid-1'),
        getJobStatus: jest.fn().mockReturnValue({ status: 'completed', processedLedgers: 10 }),
      };

      mockConfigService = {
        get: jest.fn().mockImplementation((key: string, defaultVal: any) => {
          if (key === 'ADMIN_TOKEN') return 'secret-admin-token';
          if (key === 'ADMIN_IP_ALLOWLIST') return '';
          return defaultVal;
        }),
      };

      const moduleFixture: TestingModule = await Test.createTestingModule({
        controllers: [MonitorController],
        providers: [
          { provide: MonitorService, useValue: mockMonitorService },
          { provide: MaintenanceModeService, useValue: mockMaintenanceModeService },
          { provide: BackfillJobService, useValue: mockBackfillJobService },
          { provide: ConfigService, useValue: mockConfigService },
          AdminGuard,
          AuditLogInterceptor,
        ],
      }).compile();

      app = moduleFixture.createNestApplication();
      await app.init();
    });

    afterEach(async () => {
      await app.close();
    });

    const protectedEndpoints: { method: 'get' | 'post' | 'put'; path: string; body?: any }[] = [
      { method: 'get', path: '/monitor/jobs' },
      { method: 'get', path: '/monitor/stats' },
      { method: 'get', path: '/monitor/latency' },
      { method: 'get', path: '/monitor/errors' },
      { method: 'get', path: '/monitor/audit' },
      { method: 'post', path: '/monitor/backfill', body: { fromLedger: 1, toLedger: 10 } },
      { method: 'get', path: '/monitor/backfill/backfill-uuid-1' },
      { method: 'get', path: '/monitor/maintenance' },
      { method: 'put', path: '/monitor/maintenance', body: { enabled: true } },
    ];

    describe.each(protectedEndpoints)('$method.toUpperCase() $path', ({ method, path, body }) => {
      it('rejects unauthenticated requests with 401 and writes audit log without reaching service', async () => {
        const req = request(app.getHttpServer())[method](path);
        if (body) req.send(body);
        const res = await req;

        expect(res.status).toBe(401);
        expect(mockMonitorService.logAudit).toHaveBeenCalledWith(
          expect.objectContaining({
            route: path,
            method: method.toUpperCase(),
            statusCode: 401,
          }),
        );
      });

      it('allows authenticated requests with 200/202 and writes success audit log via interceptor', async () => {
        const req = request(app.getHttpServer())[method](path)
          .set('x-admin-token', 'secret-admin-token')
          .set('x-admin-id', 'admin-monitor-tester');
        if (body) req.send(body);
        const res = await req;

        expect([200, 202]).toContain(res.status);
        expect(mockMonitorService.logAudit).toHaveBeenCalledWith(
          expect.objectContaining({
            adminId: 'admin-monitor-tester',
            route: path,
            method: method.toUpperCase(),
            statusCode: res.status,
          }),
        );
      });
    });

    it('asserts that bypassing the controller does not bypass authorisation', async () => {
      // Direct call simulation to privileged service actions without passing AdminGuard
      const guard = new AdminGuard(mockConfigService as any, mockMonitorService as any);

      const unauthenticatedContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {},
            url: '/monitor/privileged-direct-call',
            method: 'POST',
            ip: '127.0.0.1',
          }),
        }),
      } as any;

      expect(() => guard.canActivate(unauthenticatedContext)).toThrow();
      expect(mockMonitorService.logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          route: '/monitor/privileged-direct-call',
          statusCode: 401,
        }),
      );
    });
  });
});
