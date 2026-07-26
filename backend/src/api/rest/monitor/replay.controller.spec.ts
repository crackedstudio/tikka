import { ReplayController } from './replay.controller';
import { ReplayService, ReplayJobConfig } from '../../../services/replay.service';
import { AdminGuard } from './admin.guard';
import { ConfigService } from '@nestjs/config';
import { MonitorService } from './monitor.service';
import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';

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
});
