import { ConfigService } from '@nestjs/config';
import { MaintenanceModeService, MaintenanceScope } from './maintenance-mode.service';

describe('MaintenanceModeService', () => {
  let service: MaintenanceModeService;
  let mockConfigService: Partial<ConfigService>;

  const createService = (configMap: Record<string, unknown> = {}) => {
    mockConfigService = {
      get: jest.fn((key: string, defaultValue?: unknown) => {
        return key in configMap ? configMap[key] : defaultValue;
      }),
    };

    return new MaintenanceModeService(mockConfigService as ConfigService);
  };

  it('should initialize with default disabled state when config is empty', () => {
    service = createService();
    expect(service.isEnabled()).toBe(false);
    expect(service.getScopes()).toEqual([]);
  });

  it('should initialize with config values when provided', () => {
    service = createService({
      MAINTENANCE_MODE: true,
      MAINTENANCE_SCOPES: 'writes, raffles',
    });

    expect(service.isEnabled()).toBe(true);
    expect(service.getScopes()).toEqual(['writes', 'raffles']);
  });

  it('should correctly toggle enabled state via setEnabled', () => {
    service = createService({ MAINTENANCE_MODE: false });
    expect(service.isEnabled()).toBe(false);

    service.setEnabled(true);
    expect(service.isEnabled()).toBe(true);

    service.setEnabled(false);
    expect(service.isEnabled()).toBe(false);
  });

  it('should update scopes via setScopes', () => {
    service = createService();
    expect(service.getScopes()).toEqual([]);

    const newScopes: MaintenanceScope[] = ['all', 'writes'];
    service.setScopes(newScopes);
    expect(service.getScopes()).toEqual(newScopes);
  });

  describe('isScopeActive', () => {
    it('should return false when maintenance mode is disabled regardless of scopes', () => {
      service = createService({
        MAINTENANCE_MODE: false,
        MAINTENANCE_SCOPES: 'all',
      });

      expect(service.isScopeActive('all')).toBe(false);
      expect(service.isScopeActive('writes')).toBe(false);
    });

    it('should return true for all scopes when "all" scope is set', () => {
      service = createService({
        MAINTENANCE_MODE: true,
        MAINTENANCE_SCOPES: 'all',
      });

      expect(service.isScopeActive('all')).toBe(true);
      expect(service.isScopeActive('writes')).toBe(true);
      expect(service.isScopeActive('raffles')).toBe(true);
      expect(service.isScopeActive('notifications')).toBe(true);
    });

    it('should return true only for specifically listed scopes when "all" is not set', () => {
      service = createService({
        MAINTENANCE_MODE: true,
        MAINTENANCE_SCOPES: 'writes, raffles',
      });

      expect(service.isScopeActive('writes')).toBe(true);
      expect(service.isScopeActive('raffles')).toBe(true);
      expect(service.isScopeActive('notifications')).toBe(false);
      expect(service.isScopeActive('monitor')).toBe(false);
    });
  });
});
