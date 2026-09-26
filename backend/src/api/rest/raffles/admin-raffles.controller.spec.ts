import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminRafflesController } from './admin-raffles.controller';
import { RafflesService } from './raffles.service';
import { AdminGuard } from '../monitor/admin.guard';
import { MonitorService } from '../monitor/monitor.service';
import { AuditLogInterceptor } from '../monitor/audit-log.interceptor';

describe('AdminRafflesController', () => {
  let controller: AdminRafflesController;
  let rafflesService: jest.Mocked<RafflesService>;
  let adminGuard: AdminGuard;
  let monitorService: jest.Mocked<MonitorService>;
  let configService: jest.Mocked<ConfigService>;
  let auditLogInterceptor: AuditLogInterceptor;

  const VALID_ADMIN_TOKEN = 'test-admin-token-123';
  const VALID_ADMIN_ID = 'admin@example.com';

  beforeEach(async () => {
    const mockRafflesService = {
      getArchivedMetadata: jest.fn(),
      softDeleteMetadata: jest.fn(),
      restoreMetadata: jest.fn(),
    };

    const mockMonitorService = {
      logAudit: jest.fn().mockResolvedValue(undefined),
    };

    const mockConfigService = {
      get: jest.fn((key: string, defaultValue?: string) => {
        if (key === 'ADMIN_TOKEN') return VALID_ADMIN_TOKEN;
        if (key === 'ADMIN_IP_ALLOWLIST') return ''; // No IP filtering by default
        return defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminRafflesController],
      providers: [
        { provide: RafflesService, useValue: mockRafflesService },
        { provide: MonitorService, useValue: mockMonitorService },
        { provide: ConfigService, useValue: mockConfigService },
        AdminGuard,
        AuditLogInterceptor,
      ],
    }).compile();

    controller = module.get<AdminRafflesController>(AdminRafflesController);
    rafflesService = module.get(RafflesService) as jest.Mocked<RafflesService>;
    adminGuard = module.get<AdminGuard>(AdminGuard);
    monitorService = module.get(MonitorService) as jest.Mocked<MonitorService>;
    configService = module.get(ConfigService) as jest.Mocked<ConfigService>;
    auditLogInterceptor = module.get<AuditLogInterceptor>(AuditLogInterceptor);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Authorization - AdminGuard', () => {
    describe('GET /admin/raffles/archived', () => {
      it('requires valid x-admin-token header', async () => {
        const context = createMockExecutionContext({
          method: 'GET',
          url: '/admin/raffles/archived',
          headers: {
            // Missing x-admin-token
            'x-admin-id': VALID_ADMIN_ID,
          },
        });

        expect(() => adminGuard.canActivate(context)).toThrow(UnauthorizedException);
        expect(() => adminGuard.canActivate(context)).toThrow('Invalid or missing admin token');

        // Verify unauthorized attempt is logged
        expect(monitorService.logAudit).toHaveBeenCalledWith(
          expect.objectContaining({
            adminId: VALID_ADMIN_ID,
            method: 'GET',
            route: '/admin/raffles/archived',
            statusCode: 401,
          }),
        );
      });

      it('rejects invalid admin token with 401', () => {
        const context = createMockExecutionContext({
          method: 'GET',
          url: '/admin/raffles/archived',
          headers: {
            'x-admin-token': 'wrong-token',
            'x-admin-id': VALID_ADMIN_ID,
          },
        });

        expect(() => adminGuard.canActivate(context)).toThrow(UnauthorizedException);
        expect(monitorService.logAudit).toHaveBeenCalledWith(
          expect.objectContaining({
            adminId: VALID_ADMIN_ID,
            statusCode: 401,
          }),
        );
      });

      it('allows access with valid admin token', async () => {
        const context = createMockExecutionContext({
          method: 'GET',
          url: '/admin/raffles/archived',
          headers: {
            'x-admin-token': VALID_ADMIN_TOKEN,
            'x-admin-id': VALID_ADMIN_ID,
          },
        });

        const canActivate = adminGuard.canActivate(context);

        expect(canActivate).toBe(true);
        // Unauthorized log should NOT be called for valid token
        expect(monitorService.logAudit).not.toHaveBeenCalled();
      });

      it('defaults to "unknown-admin" when x-admin-id is missing', () => {
        const context = createMockExecutionContext({
          method: 'GET',
          url: '/admin/raffles/archived',
          headers: {
            // Missing both tokens
          },
        });

        expect(() => adminGuard.canActivate(context)).toThrow(UnauthorizedException);
        expect(monitorService.logAudit).toHaveBeenCalledWith(
          expect.objectContaining({
            adminId: 'unknown-admin',
          }),
        );
      });
    });

    describe('DELETE /admin/raffles/:raffleId/metadata', () => {
      it('requires valid x-admin-token header', () => {
        const context = createMockExecutionContext({
          method: 'DELETE',
          url: '/admin/raffles/42/metadata',
          headers: {
            'x-admin-id': VALID_ADMIN_ID,
          },
        });

        expect(() => adminGuard.canActivate(context)).toThrow(UnauthorizedException);
        expect(monitorService.logAudit).toHaveBeenCalledWith(
          expect.objectContaining({
            method: 'DELETE',
            route: '/admin/raffles/42/metadata',
            statusCode: 401,
          }),
        );
      });

      it('allows access with valid admin token', () => {
        const context = createMockExecutionContext({
          method: 'DELETE',
          url: '/admin/raffles/42/metadata',
          headers: {
            'x-admin-token': VALID_ADMIN_TOKEN,
            'x-admin-id': VALID_ADMIN_ID,
          },
        });

        expect(adminGuard.canActivate(context)).toBe(true);
      });
    });

    describe('POST /admin/raffles/:raffleId/restore', () => {
      it('requires valid x-admin-token header', () => {
        const context = createMockExecutionContext({
          method: 'POST',
          url: '/admin/raffles/42/restore',
          headers: {
            'x-admin-id': VALID_ADMIN_ID,
          },
        });

        expect(() => adminGuard.canActivate(context)).toThrow(UnauthorizedException);
        expect(monitorService.logAudit).toHaveBeenCalledWith(
          expect.objectContaining({
            method: 'POST',
            route: '/admin/raffles/42/restore',
            statusCode: 401,
          }),
        );
      });

      it('allows access with valid admin token', () => {
        const context = createMockExecutionContext({
          method: 'POST',
          url: '/admin/raffles/42/restore',
          headers: {
            'x-admin-token': VALID_ADMIN_TOKEN,
            'x-admin-id': VALID_ADMIN_ID,
          },
        });

        expect(adminGuard.canActivate(context)).toBe(true);
      });
    });

    describe('IP Allowlist', () => {
      it('enforces IP allowlist when configured', () => {
        configService.get.mockImplementation((key: string) => {
          if (key === 'ADMIN_TOKEN') return VALID_ADMIN_TOKEN;
          if (key === 'ADMIN_IP_ALLOWLIST') return '192.168.1.100,10.0.0.1';
          return '';
        });

        const context = createMockExecutionContext({
          method: 'GET',
          url: '/admin/raffles/archived',
          headers: {
            'x-admin-token': VALID_ADMIN_TOKEN,
            'x-admin-id': VALID_ADMIN_ID,
          },
          ip: '203.0.113.45', // Not in allowlist
        });

        expect(() => adminGuard.canActivate(context)).toThrow(UnauthorizedException);
        expect(() => adminGuard.canActivate(context)).toThrow('IP address not allowed');
        expect(monitorService.logAudit).toHaveBeenCalledWith(
          expect.objectContaining({
            statusCode: 401,
          }),
        );
      });

      it('allows IP in allowlist', () => {
        configService.get.mockImplementation((key: string) => {
          if (key === 'ADMIN_TOKEN') return VALID_ADMIN_TOKEN;
          if (key === 'ADMIN_IP_ALLOWLIST') return '192.168.1.100,10.0.0.1';
          return '';
        });

        const context = createMockExecutionContext({
          method: 'GET',
          url: '/admin/raffles/archived',
          headers: {
            'x-admin-token': VALID_ADMIN_TOKEN,
            'x-admin-id': VALID_ADMIN_ID,
          },
          ip: '192.168.1.100', // In allowlist
        });

        expect(adminGuard.canActivate(context)).toBe(true);
      });

      it('skips IP check when allowlist is empty', () => {
        configService.get.mockImplementation((key: string) => {
          if (key === 'ADMIN_TOKEN') return VALID_ADMIN_TOKEN;
          if (key === 'ADMIN_IP_ALLOWLIST') return '';
          return '';
        });

        const context = createMockExecutionContext({
          method: 'GET',
          url: '/admin/raffles/archived',
          headers: {
            'x-admin-token': VALID_ADMIN_TOKEN,
            'x-admin-id': VALID_ADMIN_ID,
          },
          ip: '203.0.113.45', // Any IP allowed when no allowlist
        });

        expect(adminGuard.canActivate(context)).toBe(true);
      });
    });
  });

  describe('Audit Logging - AuditLogInterceptor', () => {
    describe('GET /admin/raffles/archived', () => {
      it('logs successful archive listing', async () => {
        const mockArchivedData = [
          { raffle_id: 1, title: 'Archived Raffle 1', deleted_at: '2024-01-01T00:00:00Z' },
          { raffle_id: 2, title: 'Archived Raffle 2', deleted_at: '2024-01-02T00:00:00Z' },
        ];
        rafflesService.getArchivedMetadata.mockResolvedValue(mockArchivedData);

        const context = createMockExecutionContext({
          method: 'GET',
          url: '/admin/raffles/archived',
          headers: {
            'x-admin-token': VALID_ADMIN_TOKEN,
            'x-admin-id': VALID_ADMIN_ID,
          },
        });

        // Simulate interceptor wrapping the controller call
        await simulateInterceptedCall(
          auditLogInterceptor,
          context,
          async () => controller.getArchived(),
        );

        expect(rafflesService.getArchivedMetadata).toHaveBeenCalled();
        expect(monitorService.logAudit).toHaveBeenCalledWith(
          expect.objectContaining({
            adminId: VALID_ADMIN_ID,
            route: '/admin/raffles/archived',
            method: 'GET',
            statusCode: 200,
          }),
        );
      });

      it('logs failed archive listing', async () => {
        rafflesService.getArchivedMetadata.mockRejectedValue(new Error('Database error'));

        const context = createMockExecutionContext({
          method: 'GET',
          url: '/admin/raffles/archived',
          headers: {
            'x-admin-token': VALID_ADMIN_TOKEN,
            'x-admin-id': VALID_ADMIN_ID,
          },
        });

        await expect(
          simulateInterceptedCall(
            auditLogInterceptor,
            context,
            async () => controller.getArchived(),
          ),
        ).rejects.toThrow('Database error');

        expect(monitorService.logAudit).toHaveBeenCalledWith(
          expect.objectContaining({
            adminId: VALID_ADMIN_ID,
            route: '/admin/raffles/archived',
            method: 'GET',
            statusCode: 500,
          }),
        );
      });
    });

    describe('DELETE /admin/raffles/:raffleId/metadata (Destructive Operation)', () => {
      it('logs successful soft-delete with raffle ID', async () => {
        const raffleId = 42;
        rafflesService.softDeleteMetadata.mockResolvedValue({
          raffle_id: raffleId,
          deleted_at: '2024-01-15T10:30:00Z',
        });

        const context = createMockExecutionContext({
          method: 'DELETE',
          url: `/admin/raffles/${raffleId}/metadata`,
          headers: {
            'x-admin-token': VALID_ADMIN_TOKEN,
            'x-admin-id': VALID_ADMIN_ID,
          },
        });

        await simulateInterceptedCall(
          auditLogInterceptor,
          context,
          async () => controller.deleteMetadata(raffleId),
        );

        expect(rafflesService.softDeleteMetadata).toHaveBeenCalledWith(raffleId);
        expect(monitorService.logAudit).toHaveBeenCalledWith(
          expect.objectContaining({
            adminId: VALID_ADMIN_ID,
            route: `/admin/raffles/${raffleId}/metadata`,
            method: 'DELETE',
            statusCode: 200,
          }),
        );
      });

      it('logs failed soft-delete attempt (404)', async () => {
        const raffleId = 999;
        const notFoundError = new Error('Not found');
        (notFoundError as any).status = 404;
        rafflesService.softDeleteMetadata.mockRejectedValue(notFoundError);

        const context = createMockExecutionContext({
          method: 'DELETE',
          url: `/admin/raffles/${raffleId}/metadata`,
          headers: {
            'x-admin-token': VALID_ADMIN_TOKEN,
            'x-admin-id': VALID_ADMIN_ID,
          },
        });

        await expect(
          simulateInterceptedCall(
            auditLogInterceptor,
            context,
            async () => controller.deleteMetadata(raffleId),
          ),
        ).rejects.toThrow('Not found');

        expect(monitorService.logAudit).toHaveBeenCalledWith(
          expect.objectContaining({
            adminId: VALID_ADMIN_ID,
            route: `/admin/raffles/${raffleId}/metadata`,
            method: 'DELETE',
            statusCode: 404,
          }),
        );
      });

      it('confirms soft-delete is reversible (sets deleted_at timestamp)', async () => {
        const raffleId = 42;
        const deletedAt = '2024-01-15T10:30:00Z';
        rafflesService.softDeleteMetadata.mockResolvedValue({
          raffle_id: raffleId,
          deleted_at: deletedAt,
        });

        const result = await controller.deleteMetadata(raffleId);

        expect(result).toEqual({
          raffle_id: raffleId,
          deleted_at: deletedAt,
        });
        // Soft delete sets deleted_at, making the operation reversible via restore
        expect(result.deleted_at).toBeDefined();
      });
    });

    describe('POST /admin/raffles/:raffleId/restore (Reversibility)', () => {
      it('logs successful restore', async () => {
        const raffleId = 42;
        rafflesService.restoreMetadata.mockResolvedValue({ raffle_id: raffleId });

        const context = createMockExecutionContext({
          method: 'POST',
          url: `/admin/raffles/${raffleId}/restore`,
          headers: {
            'x-admin-token': VALID_ADMIN_TOKEN,
            'x-admin-id': VALID_ADMIN_ID,
          },
        });

        await simulateInterceptedCall(
          auditLogInterceptor,
          context,
          async () => controller.restoreMetadata(raffleId),
        );

        expect(rafflesService.restoreMetadata).toHaveBeenCalledWith(raffleId);
        expect(monitorService.logAudit).toHaveBeenCalledWith(
          expect.objectContaining({
            adminId: VALID_ADMIN_ID,
            route: `/admin/raffles/${raffleId}/restore`,
            method: 'POST',
            statusCode: 200,
          }),
        );
      });

      it('logs failed restore attempt (404)', async () => {
        const raffleId = 999;
        const notFoundError = new Error('Archived metadata not found');
        (notFoundError as any).status = 404;
        rafflesService.restoreMetadata.mockRejectedValue(notFoundError);

        const context = createMockExecutionContext({
          method: 'POST',
          url: `/admin/raffles/${raffleId}/restore`,
          headers: {
            'x-admin-token': VALID_ADMIN_TOKEN,
            'x-admin-id': VALID_ADMIN_ID,
          },
        });

        await expect(
          simulateInterceptedCall(
            auditLogInterceptor,
            context,
            async () => controller.restoreMetadata(raffleId),
          ),
        ).rejects.toThrow('Archived metadata not found');

        expect(monitorService.logAudit).toHaveBeenCalledWith(
          expect.objectContaining({
            adminId: VALID_ADMIN_ID,
            route: `/admin/raffles/${raffleId}/restore`,
            method: 'POST',
            statusCode: 404,
          }),
        );
      });

      it('confirms restore undoes soft-delete', async () => {
        const raffleId = 42;
        rafflesService.restoreMetadata.mockResolvedValue({ raffle_id: raffleId });

        const result = await controller.restoreMetadata(raffleId);

        expect(result).toEqual({ raffle_id: raffleId });
        // Restore clears deleted_at, making the raffle active again
        expect(rafflesService.restoreMetadata).toHaveBeenCalledWith(raffleId);
      });
    });

    describe('Audit Log Completeness', () => {
      it('captures adminId from x-admin-id header', async () => {
        const customAdminId = 'security-team@example.com';
        rafflesService.getArchivedMetadata.mockResolvedValue([]);

        const context = createMockExecutionContext({
          method: 'GET',
          url: '/admin/raffles/archived',
          headers: {
            'x-admin-token': VALID_ADMIN_TOKEN,
            'x-admin-id': customAdminId,
          },
        });

        await simulateInterceptedCall(
          auditLogInterceptor,
          context,
          async () => controller.getArchived(),
        );

        expect(monitorService.logAudit).toHaveBeenCalledWith(
          expect.objectContaining({
            adminId: customAdminId,
          }),
        );
      });

      it('defaults to "unknown-admin" when x-admin-id is missing', async () => {
        rafflesService.getArchivedMetadata.mockResolvedValue([]);

        const context = createMockExecutionContext({
          method: 'GET',
          url: '/admin/raffles/archived',
          headers: {
            'x-admin-token': VALID_ADMIN_TOKEN,
            // x-admin-id missing
          },
        });

        await simulateInterceptedCall(
          auditLogInterceptor,
          context,
          async () => controller.getArchived(),
        );

        expect(monitorService.logAudit).toHaveBeenCalledWith(
          expect.objectContaining({
            adminId: 'unknown-admin',
          }),
        );
      });

      it('includes timestamp in audit log', async () => {
        rafflesService.getArchivedMetadata.mockResolvedValue([]);

        const context = createMockExecutionContext({
          method: 'GET',
          url: '/admin/raffles/archived',
          headers: {
            'x-admin-token': VALID_ADMIN_TOKEN,
            'x-admin-id': VALID_ADMIN_ID,
          },
        });

        const beforeTime = new Date().toISOString();
        await simulateInterceptedCall(
          auditLogInterceptor,
          context,
          async () => controller.getArchived(),
        );
        const afterTime = new Date().toISOString();

        expect(monitorService.logAudit).toHaveBeenCalledWith(
          expect.objectContaining({
            timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
          }),
        );

        const call = monitorService.logAudit.mock.calls[0][0];
        expect(call.timestamp).toBeGreaterThanOrEqual(beforeTime);
        expect(call.timestamp).toBeLessThanOrEqual(afterTime);
      });
    });
  });

  describe('Controller Methods', () => {
    it('getArchived calls service.getArchivedMetadata', async () => {
      const mockData = [{ raffle_id: 1, title: 'Test' }];
      rafflesService.getArchivedMetadata.mockResolvedValue(mockData);

      const result = await controller.getArchived();

      expect(result).toEqual(mockData);
      expect(rafflesService.getArchivedMetadata).toHaveBeenCalledTimes(1);
    });

    it('deleteMetadata calls service.softDeleteMetadata with raffleId', async () => {
      const raffleId = 123;
      const mockResponse = { raffle_id: raffleId, deleted_at: '2024-01-15T10:00:00Z' };
      rafflesService.softDeleteMetadata.mockResolvedValue(mockResponse);

      const result = await controller.deleteMetadata(raffleId);

      expect(result).toEqual(mockResponse);
      expect(rafflesService.softDeleteMetadata).toHaveBeenCalledWith(raffleId);
    });

    it('restoreMetadata calls service.restoreMetadata with raffleId', async () => {
      const raffleId = 456;
      const mockResponse = { raffle_id: raffleId };
      rafflesService.restoreMetadata.mockResolvedValue(mockResponse);

      const result = await controller.restoreMetadata(raffleId);

      expect(result).toEqual(mockResponse);
      expect(rafflesService.restoreMetadata).toHaveBeenCalledWith(raffleId);
    });
  });
});

/**
 * Helper to create a mock ExecutionContext for guard testing.
 */
function createMockExecutionContext(config: {
  method: string;
  url: string;
  headers: Record<string, string>;
  ip?: string;
}): ExecutionContext {
  const mockRequest = {
    method: config.method,
    originalUrl: config.url,
    url: config.url,
    headers: config.headers,
    ip: config.ip || '127.0.0.1',
    raw: {
      socket: {
        remoteAddress: config.ip || '127.0.0.1',
      },
    },
  };

  const mockResponse = {
    statusCode: 200,
  };

  return {
    switchToHttp: () => ({
      getRequest: () => mockRequest,
      getResponse: () => mockResponse,
    }),
  } as ExecutionContext;
}

/**
 * Helper to simulate the AuditLogInterceptor wrapping a controller call.
 * The interceptor observes the call and logs the result/error.
 */
async function simulateInterceptedCall<T>(
  interceptor: AuditLogInterceptor,
  context: ExecutionContext,
  controllerFn: () => Promise<T>,
): Promise<T> {
  const { Observable } = require('rxjs');

  return new Promise((resolve, reject) => {
    const callHandler = {
      handle: () => new Observable((subscriber: any) => {
        controllerFn()
          .then((result) => {
            subscriber.next(result);
            subscriber.complete();
          })
          .catch((error) => {
            subscriber.error(error);
          });
      }),
    };

    interceptor.intercept(context, callHandler).subscribe({
      next: (value) => resolve(value as T),
      error: (err) => reject(err),
    });
  });
}
