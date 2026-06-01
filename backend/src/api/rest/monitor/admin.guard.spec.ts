import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import {
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { MonitorService } from './monitor.service';
import { REQUIRE_ADMIN_SCOPES_KEY } from './require-admin-scopes.decorator';
import { AdminScope } from './admin-scopes';

describe('AdminGuard', () => {
  let guard: AdminGuard;
  let mockConfigService: jest.Mocked<Pick<ConfigService, 'get'>>;
  let mockMonitorService: { logAudit: jest.Mock };
  let mockReflector: { getAllAndOverride: jest.Mock };

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn().mockImplementation((key: string, defaultVal?: unknown) => {
        if (key === 'ADMIN_TOKEN') return 'full-admin-token';
        if (key === 'ADMIN_MONITOR_TOKEN') return 'monitor-read-token';
        if (key === 'ADMIN_REPLAY_TOKEN') return 'replay-admin-token';
        if (key === 'ADMIN_IP_ALLOWLIST') return '';
        return defaultVal;
      }),
    };

    mockMonitorService = {
      logAudit: jest.fn().mockResolvedValue(undefined),
    };

    mockReflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    };

    guard = new AdminGuard(
      mockConfigService as unknown as ConfigService,
      mockMonitorService as unknown as MonitorService,
      mockReflector as unknown as Reflector,
    );
  });

  const createMockContext = (
    headers: Record<string, string>,
    requiredScopes?: AdminScope[],
    ip = '127.0.0.1',
  ) => {
    const request = {
      headers: {
        'x-request-id': 'req-123',
        ...headers,
      },
      ip,
      originalUrl: '/monitor/stats',
      method: 'GET',
      raw: {
        socket: {
          remoteAddress: ip,
        },
      },
    };

    mockReflector.getAllAndOverride.mockImplementation((key: string) => {
      if (key === REQUIRE_ADMIN_SCOPES_KEY) {
        return requiredScopes;
      }
      return undefined;
    });

    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    };
  };

  it('rejects unauthorized requests and writes an audit log', () => {
    const context = createMockContext({});

    expect(() => guard.canActivate(context as never)).toThrow(
      UnauthorizedException,
    );
    expect(mockMonitorService.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        adminId: 'unknown-admin',
        action: 'GET /monitor/stats',
        target: '/monitor/stats',
        outcome: 'failure',
        requestId: 'req-123',
        statusCode: 401,
      }),
    );
  });

  it('allows read-only monitor access for monitor token', () => {
    const context = createMockContext(
      {
        'x-admin-token': 'monitor-read-token',
        'x-admin-id': 'monitor-user',
      },
      [AdminScope.MonitorRead],
    );

    expect(guard.canActivate(context as never)).toBe(true);
    expect(mockMonitorService.logAudit).not.toHaveBeenCalled();
  });

  it('denies replay routes for read-only monitor token', () => {
    const context = createMockContext(
      {
        'x-admin-token': 'monitor-read-token',
        'x-admin-id': 'monitor-user',
      },
      [AdminScope.ReplayWrite],
    );
    context.switchToHttp().getRequest().originalUrl = '/admin/replay';
    context.switchToHttp().getRequest().method = 'POST';

    expect(() => guard.canActivate(context as never)).toThrow(
      ForbiddenException,
    );
    expect(mockMonitorService.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        adminId: 'monitor-user',
        target: '/admin/replay',
        outcome: 'failure',
        statusCode: 403,
        requestId: 'req-123',
      }),
    );
  });

  it('allows replay-authorized users for replay write actions', () => {
    const context = createMockContext(
      {
        'x-admin-token': 'replay-admin-token',
        'x-admin-id': 'replay-user',
      },
      [AdminScope.ReplayWrite],
    );
    context.switchToHttp().getRequest().originalUrl = '/admin/replay';
    context.switchToHttp().getRequest().method = 'POST';

    expect(guard.canActivate(context as never)).toBe(true);
  });

  it('denies monitor routes for replay-only token', () => {
    const context = createMockContext(
      {
        'x-admin-token': 'replay-admin-token',
        'x-admin-id': 'replay-user',
      },
      [AdminScope.MonitorRead],
    );

    expect(() => guard.canActivate(context as never)).toThrow(
      ForbiddenException,
    );
  });

  it('allows full admin token for monitor write actions', () => {
    const context = createMockContext(
      {
        'x-admin-token': 'full-admin-token',
        'x-admin-id': 'full-admin',
      },
      [AdminScope.MonitorWrite],
    );
    context.switchToHttp().getRequest().method = 'PUT';
    context.switchToHttp().getRequest().originalUrl = '/monitor/maintenance';

    expect(guard.canActivate(context as never)).toBe(true);
  });

  it('denies monitor write for read-only monitor token', () => {
    const context = createMockContext(
      {
        'x-admin-token': 'monitor-read-token',
        'x-admin-id': 'monitor-user',
      },
      [AdminScope.MonitorWrite],
    );
    context.switchToHttp().getRequest().method = 'PUT';
    context.switchToHttp().getRequest().originalUrl = '/monitor/maintenance';

    expect(() => guard.canActivate(context as never)).toThrow(
      ForbiddenException,
    );
  });

  it('requires full admin token when route has no scope metadata', () => {
    const context = createMockContext({
      'x-admin-token': 'monitor-read-token',
      'x-admin-id': 'monitor-user',
    });

    expect(() => guard.canActivate(context as never)).toThrow(
      ForbiddenException,
    );

    const fullContext = createMockContext({
      'x-admin-token': 'full-admin-token',
      'x-admin-id': 'full-admin',
    });
    expect(guard.canActivate(fullContext as never)).toBe(true);
  });

  it('restricts access based on ADMIN_IP_ALLOWLIST if configured', () => {
    mockConfigService.get.mockImplementation((key: string, defaultVal?: unknown) => {
      if (key === 'ADMIN_TOKEN') return 'full-admin-token';
      if (key === 'ADMIN_MONITOR_TOKEN') return 'monitor-read-token';
      if (key === 'ADMIN_REPLAY_TOKEN') return 'replay-admin-token';
      if (key === 'ADMIN_IP_ALLOWLIST') return '192.168.1.100, 10.0.0.1';
      return defaultVal;
    });

    const contextAllowed = createMockContext(
      { 'x-admin-token': 'full-admin-token' },
      [AdminScope.MonitorRead],
      '192.168.1.100',
    );
    expect(guard.canActivate(contextAllowed as never)).toBe(true);

    const contextForbidden = createMockContext(
      { 'x-admin-token': 'full-admin-token' },
      [AdminScope.MonitorRead],
      '192.168.1.101',
    );
    expect(() => guard.canActivate(contextForbidden as never)).toThrow(
      UnauthorizedException,
    );
  });
});
