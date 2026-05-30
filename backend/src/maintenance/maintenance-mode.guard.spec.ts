import { ExecutionContext, ServiceUnavailableException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MaintenanceModeGuard } from './maintenance-mode.guard';
import { MaintenanceModeService } from './maintenance-mode.service';

describe('MaintenanceModeGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  } as unknown as Reflector;

  const maintenanceModeService = {
    isEnabled: jest.fn(),
    isScopeActive: jest.fn(),
  } as unknown as MaintenanceModeService;

  const createContext = (method = 'GET') =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn(() => ({
        getRequest: jest.fn(() => ({ method })),
      })),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows request when skip-maintenance decorator is present', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);

    const guard = new MaintenanceModeGuard(
      reflector,
      maintenanceModeService,
    );

    expect(guard.canActivate(createContext())).toBe(true);
  });

  it('allows request when maintenance mode is disabled', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);
    (maintenanceModeService.isEnabled as jest.Mock).mockReturnValue(false);

    const guard = new MaintenanceModeGuard(
      reflector,
      maintenanceModeService,
    );

    expect(guard.canActivate(createContext())).toBe(true);
  });

  it('allows request when scope is NOT active', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);
    (maintenanceModeService.isEnabled as jest.Mock).mockReturnValue(true);
    (maintenanceModeService.isScopeActive as jest.Mock).mockReturnValue(false);

    const guard = new MaintenanceModeGuard(
      reflector,
      maintenanceModeService,
    );

    expect(guard.canActivate(createContext('GET'))).toBe(true);
  });

  it('blocks write requests when writes scope is active', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);
    (maintenanceModeService.isEnabled as jest.Mock).mockReturnValue(true);
    (maintenanceModeService.isScopeActive as jest.Mock).mockReturnValue(true);

    const guard = new MaintenanceModeGuard(
      reflector,
      maintenanceModeService,
    );

    expect(() =>
      guard.canActivate(createContext('POST')),
    ).toThrow(ServiceUnavailableException);
  });

  it('blocks GET request when all scope is active', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);
    (maintenanceModeService.isEnabled as jest.Mock).mockReturnValue(true);
    (maintenanceModeService.isScopeActive as jest.Mock).mockReturnValue(true);

    const guard = new MaintenanceModeGuard(
      reflector,
      maintenanceModeService,
    );

    expect(() =>
      guard.canActivate(createContext('GET')),
    ).toThrow(ServiceUnavailableException);
  });
});