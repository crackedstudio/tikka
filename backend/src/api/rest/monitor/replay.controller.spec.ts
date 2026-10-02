import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import request from 'supertest';
import { ReplayController } from './replay.controller';
import { ReplayService, ReplayJobConfig } from '../../../services/indexer/replay.service';
import { AdminGuard } from './admin.guard';
import { ConfigService } from '@nestjs/config';
import { MonitorService } from './monitor.service';
import { AuditLogInterceptor } from './audit-log.interceptor';

describe('ReplayController & AdminGuard', () => {
  describe('ReplayController', () => {
    let controller: ReplayController;
    let mockReplayService: any;

    beforeEach(() => {
      mockReplayService = {
        startReplay: jest.fn(),
        getJobStatus: jest.fn(),
      };

      controller = new ReplayController(mockReplayService as unknown as ReplayService);
    });

    it('starts a dry-run replay successfully', async () => {
      const config: ReplayJobConfig = {
        fromLedger: 10,
        toLedger: 20,
        dryRun: true,
      };
      mockReplayService.startReplay.mockReturnValue('job-uuid-123');

      const result = await controller.startReplay(config);

      expect(mockReplayService.startReplay).toHaveBeenCalledWith(config);
      expect(result).toEqual({
        jobId: 'job-uuid-123',
        message: 'Replay job started. Poll /admin/replay/job-uuid-123 for progress.',
      });
    });

    it('starts a confirmed mutating replay successfully', async () => {
      const config: ReplayJobConfig = {
        fromLedger: 10,
        toLedger: 20,
        dryRun: false,
        confirmed: true,
      };
      mockReplayService.startReplay.mockReturnValue('job-uuid-confirmed');

      const result = await controller.startReplay(config);

      expect(mockReplayService.startReplay).toHaveBeenCalledWith(config);
      expect(result.jobId).toBe('job-uuid-confirmed');
    });

    it('converts validation error to BadRequestException', async () => {
      const config: ReplayJobConfig = {
        fromLedger: 20,
        toLedger: 10,
        dryRun: true,
      };
      mockReplayService.startReplay.mockImplementation(() => {
        throw new Error('fromLedger (20) must be <= toLedger (10)');
      });

      await expect(controller.startReplay(config)).rejects.toThrow(BadRequestException);
      await expect(controller.startReplay(config)).rejects.toThrow(
        'fromLedger (20) must be <= toLedger (10)',
      );
    });

    it('converts confirmation missing error to BadRequestException', async () => {
      const config: ReplayJobConfig = {
        fromLedger: 10,
        toLedger: 20,
        dryRun: false,
      };
      mockReplayService.startReplay.mockImplementation(() => {
        throw new Error("Mutating replay operations require explicit confirmation. Please set 'confirmed' to true.");
      });

      await expect(controller.startReplay(config)).rejects.toThrow(BadRequestException);
      await expect(controller.startReplay(config)).rejects.toThrow(
        "Mutating replay operations require explicit confirmation. Please set 'confirmed' to true.",
      );
    });

    it('gets status of a job successfully', () => {
      const jobStatus = {
        jobId: 'job-uuid-123',
        status: 'running' as const,
        config: { fromLedger: 10, toLedger: 20, dryRun: true },
        progress: { processedCount: 5, skippedCount: 0, totalLedgers: 11 },
        createdAt: new Date().toISOString(),
      };
      mockReplayService.getJobStatus.mockReturnValue(jobStatus);

      const result = controller.getJobStatus('job-uuid-123');

      expect(mockReplayService.getJobStatus).toHaveBeenCalledWith('job-uuid-123');
      expect(result).toEqual(jobStatus);
    });

    it('throws NotFoundException if job is not found', () => {
      mockReplayService.getJobStatus.mockReturnValue(null);

      expect(() => controller.getJobStatus('non-existent')).toThrow(NotFoundException);
    });
  });

  describe('AdminGuard', () => {
    let guard: AdminGuard;
    let mockConfigService: any;
    let mockMonitorService: any;

    beforeEach(() => {
      mockConfigService = {
        get: jest.fn().mockImplementation((key: string, defaultVal: any) => {
          if (key === 'ADMIN_TOKEN') return 'secret-admin-token';
          if (key === 'ADMIN_IP_ALLOWLIST') return '';
          return defaultVal;
        }),
      };

      mockMonitorService = {
        logAudit: jest.fn().mockResolvedValue(undefined),
      };

      guard = new AdminGuard(
        mockConfigService as unknown as ConfigService,
        mockMonitorService as unknown as MonitorService,
      );
    });

    const createMockContext = (headers: Record<string, string>, ip = '127.0.0.1'): any => {
      const request = {
        headers,
        ip,
        originalUrl: '/admin/replay',
        method: 'POST',
        raw: {
          socket: {
            remoteAddress: ip,
          },
        },
      };

      return {
        switchToHttp: () => ({
          getRequest: () => request,
        }),
      };
    };

    it('allows access with a valid X-Admin-Token header', () => {
      const context = createMockContext({ 'x-admin-token': 'secret-admin-token' });

      expect(guard.canActivate(context)).toBe(true);
      expect(mockMonitorService.logAudit).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException if X-Admin-Token is missing', () => {
      const context = createMockContext({});

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(context)).toThrow('Invalid or missing admin token');
      expect(mockMonitorService.logAudit).toHaveBeenCalled();
    });

    it('throws UnauthorizedException if X-Admin-Token is invalid', () => {
      const context = createMockContext({ 'x-admin-token': 'wrong-token' });

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(context)).toThrow('Invalid or missing admin token');
      expect(mockMonitorService.logAudit).toHaveBeenCalled();
    });

    it('restricts access based on ADMIN_IP_ALLOWLIST if configured', () => {
      mockConfigService.get.mockImplementation((key: string, defaultVal: any) => {
        if (key === 'ADMIN_TOKEN') return 'secret-admin-token';
        if (key === 'ADMIN_IP_ALLOWLIST') return '192.168.1.100, 10.0.0.1';
        return defaultVal;
      });

      // Allowed IP
      const contextAllowed = createMockContext(
        { 'x-admin-token': 'secret-admin-token' },
        '192.168.1.100',
      );
      expect(guard.canActivate(contextAllowed)).toBe(true);

      // Forbidden IP
      const contextForbidden = createMockContext(
        { 'x-admin-token': 'secret-admin-token' },
        '192.168.1.101',
      );
      expect(() => guard.canActivate(contextForbidden)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(contextForbidden)).toThrow('IP address not allowed');
    });
  });

  describe('End-to-End Replay Path & Audit Logging', () => {
    let app: INestApplication;
    let mockReplayService: any;
    let mockMonitorService: any;
    let mockConfigService: any;

    beforeEach(async () => {
      mockReplayService = {
        startReplay: jest.fn(),
        getJobStatus: jest.fn(),
      };

      mockMonitorService = {
        logAudit: jest.fn().mockResolvedValue(undefined),
      };

      mockConfigService = {
        get: jest.fn().mockImplementation((key: string, defaultVal: any) => {
          if (key === 'ADMIN_TOKEN') return 'secret-admin-token';
          if (key === 'ADMIN_IP_ALLOWLIST') return '';
          return defaultVal;
        }),
      };

      const moduleFixture: TestingModule = await Test.createTestingModule({
        controllers: [ReplayController],
        providers: [
          { provide: ReplayService, useValue: mockReplayService },
          { provide: MonitorService, useValue: mockMonitorService },
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

    it('rejects POST /admin/replay without admin token, logs 401 audit, and does NOT call startReplay', async () => {
      const res = await request(app.getHttpServer())
        .post('/admin/replay')
        .send({ fromLedger: 10, toLedger: 20, dryRun: true });

      expect(res.status).toBe(401);
      expect(mockReplayService.startReplay).not.toHaveBeenCalled();
      expect(mockMonitorService.logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          route: '/admin/replay',
          method: 'POST',
          statusCode: 401,
        }),
      );
    });

    it('rejects POST /admin/replay with invalid admin token, logs 401 audit, and does NOT call startReplay', async () => {
      const res = await request(app.getHttpServer())
        .post('/admin/replay')
        .set('x-admin-token', 'wrong-token')
        .send({ fromLedger: 10, toLedger: 20, dryRun: true });

      expect(res.status).toBe(401);
      expect(mockReplayService.startReplay).not.toHaveBeenCalled();
      expect(mockMonitorService.logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 401,
        }),
      );
    });

    it('executes POST /admin/replay with valid admin token and records audit log upon completion', async () => {
      mockReplayService.startReplay.mockReturnValue('job-uuid-e2e-1');

      const res = await request(app.getHttpServer())
        .post('/admin/replay')
        .set('x-admin-token', 'secret-admin-token')
        .set('x-admin-id', 'admin-super')
        .send({ fromLedger: 10, toLedger: 20, dryRun: true });

      expect(res.status).toBe(202);
      expect(res.body).toEqual({
        jobId: 'job-uuid-e2e-1',
        message: 'Replay job started. Poll /admin/replay/job-uuid-e2e-1 for progress.',
      });
      expect(mockReplayService.startReplay).toHaveBeenCalledWith({
        fromLedger: 10,
        toLedger: 20,
        dryRun: true,
      });

      expect(mockMonitorService.logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          adminId: 'admin-super',
          route: '/admin/replay',
          method: 'POST',
          statusCode: 202,
        }),
      );
    });

    it('records 400 audit log when startReplay throws validation error', async () => {
      mockReplayService.startReplay.mockImplementation(() => {
        throw new Error('fromLedger (20) must be <= toLedger (10)');
      });

      const res = await request(app.getHttpServer())
        .post('/admin/replay')
        .set('x-admin-token', 'secret-admin-token')
        .set('x-admin-id', 'admin-super')
        .send({ fromLedger: 20, toLedger: 10, dryRun: true });

      expect(res.status).toBe(400);
      expect(mockMonitorService.logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          adminId: 'admin-super',
          route: '/admin/replay',
          method: 'POST',
          statusCode: 400,
        }),
      );
    });

    it('rejects GET /admin/replay/:jobId without admin token, logs 401 audit, and does NOT call getJobStatus', async () => {
      const res = await request(app.getHttpServer()).get('/admin/replay/job-123');

      expect(res.status).toBe(401);
      expect(mockReplayService.getJobStatus).not.toHaveBeenCalled();
      expect(mockMonitorService.logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          route: '/admin/replay/job-123',
          method: 'GET',
          statusCode: 401,
        }),
      );
    });

    it('retrieves GET /admin/replay/:jobId with valid token and records audit log', async () => {
      const jobStatus = {
        jobId: 'job-123',
        status: 'running',
        config: { fromLedger: 10, toLedger: 20, dryRun: true },
        progress: { processedCount: 5, skippedCount: 0, totalLedgers: 11 },
        createdAt: new Date().toISOString(),
      };
      mockReplayService.getJobStatus.mockReturnValue(jobStatus);

      const res = await request(app.getHttpServer())
        .get('/admin/replay/job-123')
        .set('x-admin-token', 'secret-admin-token')
        .set('x-admin-id', 'auditor-1');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(jobStatus);
      expect(mockReplayService.getJobStatus).toHaveBeenCalledWith('job-123');
      expect(mockMonitorService.logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          adminId: 'auditor-1',
          route: '/admin/replay/job-123',
          method: 'GET',
          statusCode: 200,
        }),
      );
    });

    it('records 404 audit log when job is not found', async () => {
      mockReplayService.getJobStatus.mockReturnValue(null);

      const res = await request(app.getHttpServer())
        .get('/admin/replay/non-existent')
        .set('x-admin-token', 'secret-admin-token')
        .set('x-admin-id', 'auditor-1');

      expect(res.status).toBe(404);
      expect(mockMonitorService.logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          adminId: 'auditor-1',
          route: '/admin/replay/non-existent',
          method: 'GET',
          statusCode: 404,
        }),
      );
    });
  });
});
