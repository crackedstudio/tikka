import {
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminGuard } from './admin.guard';
import { MonitorService } from './monitor.service';

describe('AdminGuard', () => {
  const ADMIN_TOKEN = 'secret-admin-token';

  let guard: AdminGuard;
  let mockConfigService: { get: jest.Mock };
  let mockMonitorService: { logAudit: jest.Mock };

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn().mockImplementation((key: string, defaultVal?: unknown) => {
        if (key === 'ADMIN_TOKEN') return ADMIN_TOKEN;
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

  const createMockContext = (
    headers: Record<string, string | string[] | undefined> = {},
    options: {
      ip?: string;
      url?: string;
      originalUrl?: string;
      method?: string;
      remoteAddress?: string | null;
    } = {},
  ): ExecutionContext => {
    const {
      ip = '127.0.0.1',
      url = '/monitor/jobs',
      originalUrl,
      method = 'GET',
      remoteAddress,
    } = options;

    const request = {
      headers,
      ip: remoteAddress === null ? undefined : ip,
      url,
      originalUrl,
      method,
      raw: {
        socket: {
          remoteAddress:
            remoteAddress === null
              ? undefined
              : (remoteAddress ?? ip),
        },
      },
    };

    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  };

  describe('valid admin token', () => {
    it('allows access when X-Admin-Token matches ADMIN_TOKEN', () => {
      const context = createMockContext({
        'x-admin-token': ADMIN_TOKEN,
      });

      expect(guard.canActivate(context)).toBe(true);
      expect(mockMonitorService.logAudit).not.toHaveBeenCalled();
    });

    it('allows access when IP allowlist is empty/whitespace', () => {
      mockConfigService.get.mockImplementation(
        (key: string, defaultVal?: unknown) => {
          if (key === 'ADMIN_TOKEN') return ADMIN_TOKEN;
          if (key === 'ADMIN_IP_ALLOWLIST') return '   ';
          return defaultVal;
        },
      );

      const context = createMockContext({
        'x-admin-token': ADMIN_TOKEN,
      });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('allows access from an IP on ADMIN_IP_ALLOWLIST', () => {
      mockConfigService.get.mockImplementation(
        (key: string, defaultVal?: unknown) => {
          if (key === 'ADMIN_TOKEN') return ADMIN_TOKEN;
          if (key === 'ADMIN_IP_ALLOWLIST') return '192.168.1.100, 10.0.0.1';
          return defaultVal;
        },
      );

      const context = createMockContext(
        { 'x-admin-token': ADMIN_TOKEN },
        { ip: '10.0.0.1' },
      );

      expect(guard.canActivate(context)).toBe(true);
      expect(mockMonitorService.logAudit).not.toHaveBeenCalled();
    });
  });

  describe('ordinary / non-admin credentials (unauthorized)', () => {
    it('rejects a wrong admin token (ordinary user / role escalation attempt)', () => {
      const context = createMockContext({
        'x-admin-token': 'user-session-token',
      });

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(context)).toThrow(
        'Invalid or missing admin token',
      );
      expect(mockMonitorService.logAudit).toHaveBeenCalled();
    });

    it('rejects a token that is only a prefix of the real admin token', () => {
      const context = createMockContext({
        'x-admin-token': 'secret-admin',
      });

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(context)).toThrow(
        'Invalid or missing admin token',
      );
    });

    it('rejects when token case does not match (no silent privilege escalation)', () => {
      const context = createMockContext({
        'x-admin-token': ADMIN_TOKEN.toUpperCase(),
      });

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });
  });

  describe('missing / malformed token (401)', () => {
    it('rejects when X-Admin-Token header is missing', () => {
      const context = createMockContext({});

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(context)).toThrow(
        'Invalid or missing admin token',
      );
    });

    it('rejects when X-Admin-Token is an empty string', () => {
      const context = createMockContext({ 'x-admin-token': '' });

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(context)).toThrow(
        'Invalid or missing admin token',
      );
    });

    it('rejects when ADMIN_TOKEN is unset and any client token is presented', () => {
      mockConfigService.get.mockImplementation(
        (key: string, defaultVal?: unknown) => {
          if (key === 'ADMIN_TOKEN') return undefined;
          if (key === 'ADMIN_IP_ALLOWLIST') return '';
          return defaultVal;
        },
      );

      const context = createMockContext({
        'x-admin-token': 'anything',
      });

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('writes a 401 audit log with admin id, method, and route on failure', () => {
      const context = createMockContext(
        {
          'x-admin-token': 'wrong',
          'x-admin-id': 'auditor-42',
        },
        {
          method: 'POST',
          originalUrl: '/admin/raffles/archived',
        },
      );

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);

      expect(mockMonitorService.logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          adminId: 'auditor-42',
          method: 'POST',
          route: '/admin/raffles/archived',
          statusCode: 401,
        }),
      );
      const payload = mockMonitorService.logAudit.mock.calls[0][0];
      expect(typeof payload.timestamp).toBe('string');
      expect(Number.isNaN(Date.parse(payload.timestamp))).toBe(false);
    });

    it('falls back to unknown-admin and url when admin id / originalUrl are absent', () => {
      const context = createMockContext(
        { 'x-admin-token': 'wrong' },
        { url: '/monitor/stats', method: 'GET' },
      );

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);

      expect(mockMonitorService.logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          adminId: 'unknown-admin',
          route: '/monitor/stats',
          method: 'GET',
          statusCode: 401,
        }),
      );
    });

    it('trims whitespace-only x-admin-id to unknown-admin', () => {
      const context = createMockContext({
        'x-admin-token': 'wrong',
        'x-admin-id': '   ',
      });

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      expect(mockMonitorService.logAudit).toHaveBeenCalledWith(
        expect.objectContaining({ adminId: 'unknown-admin' }),
      );
    });
  });

  describe('IP allowlist enforcement', () => {
    beforeEach(() => {
      mockConfigService.get.mockImplementation(
        (key: string, defaultVal?: unknown) => {
          if (key === 'ADMIN_TOKEN') return ADMIN_TOKEN;
          if (key === 'ADMIN_IP_ALLOWLIST') return '192.168.1.100, 10.0.0.1';
          return defaultVal;
        },
      );
    });

    it('rejects a valid token from a non-allowlisted IP', () => {
      const context = createMockContext(
        { 'x-admin-token': ADMIN_TOKEN },
        { ip: '203.0.113.50' },
      );

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(context)).toThrow('IP address not allowed');
      expect(mockMonitorService.logAudit).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 401 }),
      );
    });

    it('falls back to socket remoteAddress when request.ip is missing', () => {
      const context = createMockContext(
        { 'x-admin-token': ADMIN_TOKEN },
        { remoteAddress: null },
      );
      // Override: no request.ip, but socket has allowlisted address
      const request = (
        context.switchToHttp().getRequest as () => Record<string, unknown>
      )();
      (request as { ip?: string }).ip = undefined;
      (request as { raw: { socket: { remoteAddress: string } } }).raw.socket =
        { remoteAddress: '192.168.1.100' };

      expect(guard.canActivate(context)).toBe(true);
    });

    it('rejects when neither request.ip nor socket address is allowlisted', () => {
      const context = createMockContext(
        { 'x-admin-token': ADMIN_TOKEN },
        { remoteAddress: null },
      );
      const request = (
        context.switchToHttp().getRequest as () => Record<string, unknown>
      )();
      (request as { ip?: string }).ip = undefined;
      (request as { raw: { socket: { remoteAddress?: string } } }).raw.socket =
        { remoteAddress: undefined };

      expect(() => guard.canActivate(context)).toThrow('IP address not allowed');
    });
  });
});
