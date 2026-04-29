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
  } as unknown as MaintenanceModeService;

  const context = {
    getHandler: jest.fn(),
    getClass: jest.fn(),
  } as unknown as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows request when maintenance mode is disabled', () => {
    reflector.getAllAndOverride = jest.fn().mockReturnValue(false);
    maintenanceModeService.isEnabled = jest.fn().mockReturnValue(false);

    const guard = new MaintenanceModeGuard(reflector, maintenanceModeService);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows request when endpoint is marked with SkipMaintenance', () => {
    reflector.getAllAndOverride = jest.fn().mockReturnValue(true);
    maintenanceModeService.isEnabled = jest.fn().mockReturnValue(true);

    const guard = new MaintenanceModeGuard(reflector, maintenanceModeService);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('throws 503 when maintenance mode is enabled', () => {
    reflector.getAllAndOverride = jest.fn().mockReturnValue(false);
    maintenanceModeService.isEnabled = jest.fn().mockReturnValue(true);

    const guard = new MaintenanceModeGuard(reflector, maintenanceModeService);

    expect(() => guard.canActivate(context)).toThrow(ServiceUnavailableException);
  });
});
