import { Test, TestingModule } from '@nestjs/testing';
import { GeoBlockingMiddleware } from './geo-blocking.middleware';
import { GeoService } from '../services/geo.service';
import { ForbiddenException } from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';

describe('GeoBlockingMiddleware', () => {
  let middleware: GeoBlockingMiddleware;
  let geoService: jest.Mocked<GeoService>;
  let mockRequest: Partial<FastifyRequest>;
  let mockResponse: Partial<FastifyReply>;
  let mockNext: jest.Mock;

  beforeEach(async () => {
    // Mock environment variables
    process.env.BLOCKED_COUNTRIES = 'US,NG,GB';

    geoService = {
      checkAccess: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeoBlockingMiddleware,
        {
          provide: GeoService,
          useValue: geoService,
        },
      ],
    }).compile();

    middleware = module.get<GeoBlockingMiddleware>(GeoBlockingMiddleware);

    mockRequest = {
      ip: '192.168.1.1',
      headers: {},
      raw: {
        socket: {
          remoteAddress: '192.168.1.1',
        },
      },
    };

    mockResponse = {};
    mockNext = jest.fn();
  });

  afterEach(() => {
    delete process.env.BLOCKED_COUNTRIES;
  });

  describe('constructor', () => {
    it('should parse blocked countries from environment variable', () => {
      process.env.BLOCKED_COUNTRIES = 'US,NG,GB';
      const newMiddleware = new GeoBlockingMiddleware(geoService);
      expect(newMiddleware['blockedCountries']).toEqual(['US', 'NG', 'GB']);
    });

    it('should handle empty blocked countries', () => {
      process.env.BLOCKED_COUNTRIES = '';
      const newMiddleware = new GeoBlockingMiddleware(geoService);
      expect(newMiddleware['blockedCountries']).toEqual([]);
    });

    it('should handle wildcard allow-all', () => {
      process.env.BLOCKED_COUNTRIES = '*';
      const newMiddleware = new GeoBlockingMiddleware(geoService);
      expect(newMiddleware['blockedCountries']).toEqual([]);
    });

    it('should filter invalid country codes', () => {
      process.env.BLOCKED_COUNTRIES = 'US,NG,INVALID,GB,123';
      const newMiddleware = new GeoBlockingMiddleware(geoService);
      expect(newMiddleware['blockedCountries']).toEqual(['US', 'NG', 'GB']);
    });

    it('should handle lowercase country codes', () => {
      process.env.BLOCKED_COUNTRIES = 'us,ng,gb';
      const newMiddleware = new GeoBlockingMiddleware(geoService);
      expect(newMiddleware['blockedCountries']).toEqual(['US', 'NG', 'GB']);
    });
  });

  describe('use', () => {
    it('should allow request when no countries are blocked', async () => {
      process.env.BLOCKED_COUNTRIES = '';
      const newMiddleware = new GeoBlockingMiddleware(geoService);

      await newMiddleware.use(mockRequest as FastifyRequest, mockResponse as FastifyReply, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(geoService.checkAccess).not.toHaveBeenCalled();
    });

    it('should allow request when wildcard is set', async () => {
      process.env.BLOCKED_COUNTRIES = '*';
      const newMiddleware = new GeoBlockingMiddleware(geoService);

      await newMiddleware.use(mockRequest as FastifyRequest, mockResponse as FastifyReply, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(geoService.checkAccess).not.toHaveBeenCalled();
    });

    it('should allow request from allowed country via CF-IPCountry header', async () => {
      mockRequest.headers = {
        'cf-ipcountry': 'CA',
      };

      await middleware.use(mockRequest as FastifyRequest, mockResponse as FastifyReply, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(geoService.checkAccess).not.toHaveBeenCalled();
    });

    it('should block request from blocked country via CF-IPCountry header', async () => {
      mockRequest.headers = {
        'cf-ipcountry': 'US',
      };

      await expect(
        middleware.use(mockRequest as FastifyRequest, mockResponse as FastifyReply, mockNext)
      ).rejects.toThrow(ForbiddenException);

      expect(mockNext).not.toHaveBeenCalled();
      expect(geoService.checkAccess).not.toHaveBeenCalled();
    });

    it('should allow request from allowed country via X-Country-Code header', async () => {
      mockRequest.headers = {
        'x-country-code': 'CA',
      };

      await middleware.use(mockRequest as FastifyRequest, mockResponse as FastifyReply, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(geoService.checkAccess).not.toHaveBeenCalled();
    });

    it('should block request from blocked country via X-Country-Code header', async () => {
      mockRequest.headers = {
        'x-country-code': 'NG',
      };

      await expect(
        middleware.use(mockRequest as FastifyRequest, mockResponse as FastifyReply, mockNext)
      ).rejects.toThrow(ForbiddenException);

      expect(mockNext).not.toHaveBeenCalled();
      expect(geoService.checkAccess).not.toHaveBeenCalled();
    });

    it('should prioritize CF-IPCountry over X-Country-Code', async () => {
      mockRequest.headers = {
        'cf-ipcountry': 'US', // blocked
        'x-country-code': 'CA', // allowed
      };

      await expect(
        middleware.use(mockRequest as FastifyRequest, mockResponse as FastifyReply, mockNext)
      ).rejects.toThrow(ForbiddenException);

      expect(mockNext).not.toHaveBeenCalled();
      expect(geoService.checkAccess).not.toHaveBeenCalled();
    });

    it('should ignore XX country code from CF-IPCountry', async () => {
      mockRequest.headers = {
        'cf-ipcountry': 'XX',
      };

      geoService.checkAccess.mockResolvedValue({
        allowed: true,
        countryCode: 'CA',
      });

      await middleware.use(mockRequest as FastifyRequest, mockResponse as FastifyReply, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(geoService.checkAccess).toHaveBeenCalledWith(
        '192.168.1.1',
        'web-request',
        ['US', 'NG', 'GB']
      );
    });

    it('should use GeoService when no country headers are present', async () => {
      geoService.checkAccess.mockResolvedValue({
        allowed: true,
        countryCode: 'CA',
      });

      await middleware.use(mockRequest as FastifyRequest, mockResponse as FastifyReply, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(geoService.checkAccess).toHaveBeenCalledWith(
        '192.168.1.1',
        'web-request',
        ['US', 'NG', 'GB']
      );
    });

    it('should block request when GeoService returns blocked', async () => {
      geoService.checkAccess.mockResolvedValue({
        allowed: false,
        countryCode: 'US',
        reason: 'country_restricted:US',
      });

      await expect(
        middleware.use(mockRequest as FastifyRequest, mockResponse as FastifyReply, mockNext)
      ).rejects.toThrow(ForbiddenException);

      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should allow request when GeoService lookup fails', async () => {
      geoService.checkAccess.mockResolvedValue({
        allowed: true,
        countryCode: null,
        reason: 'geo_lookup_failed',
      });

      await middleware.use(mockRequest as FastifyRequest, mockResponse as FastifyReply, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should allow request when GeoService throws error', async () => {
      geoService.checkAccess.mockRejectedValue(new Error('Geo service error'));

      await middleware.use(mockRequest as FastifyRequest, mockResponse as FastifyReply, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle case-insensitive country codes', async () => {
      mockRequest.headers = {
        'cf-ipcountry': 'us', // lowercase
      };

      await expect(
        middleware.use(mockRequest as FastifyRequest, mockResponse as FastifyReply, mockNext)
      ).rejects.toThrow(ForbiddenException);

      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('extractClientIp', () => {
    it('should extract IP from x-forwarded-for header', async () => {
      mockRequest.headers = {
        'x-forwarded-for': '203.0.113.1, 203.0.113.2',
      };

      geoService.checkAccess.mockResolvedValue({
        allowed: true,
        countryCode: 'CA',
      });

      await middleware.use(mockRequest as FastifyRequest, mockResponse as FastifyReply, mockNext);

      expect(geoService.checkAccess).toHaveBeenCalledWith(
        '203.0.113.1',
        'web-request',
        ['US', 'NG', 'GB']
      );
    });

    it('should handle array x-forwarded-for header', async () => {
      mockRequest.headers = {
        'x-forwarded-for': ['203.0.113.1', '203.0.113.2'],
      };

      geoService.checkAccess.mockResolvedValue({
        allowed: true,
        countryCode: 'CA',
      });

      await middleware.use(mockRequest as FastifyRequest, mockResponse as FastifyReply, mockNext);

      expect(geoService.checkAccess).toHaveBeenCalledWith(
        '203.0.113.1',
        'web-request',
        ['US', 'NG', 'GB']
      );
    });

    it('should fallback to req.ip when no x-forwarded-for', async () => {
      mockRequest.ip = '203.0.113.3';

      geoService.checkAccess.mockResolvedValue({
        allowed: true,
        countryCode: 'CA',
      });

      await middleware.use(mockRequest as FastifyRequest, mockResponse as FastifyReply, mockNext);

      expect(geoService.checkAccess).toHaveBeenCalledWith(
        '203.0.113.3',
        'web-request',
        ['US', 'NG', 'GB']
      );
    });

    it('should fallback to socket remote address', async () => {
      delete mockRequest.ip;
      mockRequest.raw = {
        socket: {
          remoteAddress: '203.0.113.4',
        },
      };

      geoService.checkAccess.mockResolvedValue({
        allowed: true,
        countryCode: 'CA',
      });

      await middleware.use(mockRequest as FastifyRequest, mockResponse as FastifyReply, mockNext);

      expect(geoService.checkAccess).toHaveBeenCalledWith(
        '203.0.113.4',
        'web-request',
        ['US', 'NG', 'GB']
      );
    });

    it('should return unknown when no IP can be determined', async () => {
      delete mockRequest.ip;
      mockRequest.raw = {};

      geoService.checkAccess.mockResolvedValue({
        allowed: true,
        countryCode: 'CA',
      });

      await middleware.use(mockRequest as FastifyRequest, mockResponse as FastifyReply, mockNext);

      expect(geoService.checkAccess).toHaveBeenCalledWith(
        'unknown',
        'web-request',
        ['US', 'NG', 'GB']
      );
    });
  });

  describe('getCountryFromHeaders', () => {
    it('should return country from CF-IPCountry header', async () => {
      mockRequest.headers = {
        'cf-ipcountry': 'CA',
      };

      geoService.checkAccess.mockResolvedValue({
        allowed: true,
        countryCode: 'CA',
      });

      await middleware.use(mockRequest as FastifyRequest, mockResponse as FastifyReply, mockNext);

      expect(geoService.checkAccess).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should return country from X-Country-Code header when CF-IPCountry is not present', async () => {
      mockRequest.headers = {
        'x-country-code': 'CA',
      };

      geoService.checkAccess.mockResolvedValue({
        allowed: true,
        countryCode: 'CA',
      });

      await middleware.use(mockRequest as FastifyRequest, mockResponse as FastifyReply, mockNext);

      expect(geoService.checkAccess).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should ignore empty X-Country-Code header', async () => {
      mockRequest.headers = {
        'x-country-code': '',
      };

      geoService.checkAccess.mockResolvedValue({
        allowed: true,
        countryCode: 'CA',
      });

      await middleware.use(mockRequest as FastifyRequest, mockResponse as FastifyReply, mockNext);

      expect(geoService.checkAccess).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should provide detailed error message for blocked requests', async () => {
      mockRequest.headers = {
        'cf-ipcountry': 'US',
      };

      try {
        await middleware.use(mockRequest as FastifyRequest, mockResponse as FastifyReply, mockNext);
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        expect(error.message).toContain('Access from your location is not permitted');
        expect(error.message).toContain('US');
      }
    });

    it('should provide detailed error message for blocked requests via GeoService', async () => {
      geoService.checkAccess.mockResolvedValue({
        allowed: false,
        countryCode: 'NG',
        reason: 'country_restricted:NG',
      });

      try {
        await middleware.use(mockRequest as FastifyRequest, mockResponse as FastifyReply, mockNext);
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        expect(error.message).toContain('Access from your location is not permitted');
        expect(error.message).toContain('NG');
      }
    });

    it('should handle unknown country in error message', async () => {
      geoService.checkAccess.mockResolvedValue({
        allowed: false,
        countryCode: null,
        reason: 'country_restricted',
      });

      try {
        await middleware.use(mockRequest as FastifyRequest, mockResponse as FastifyReply, mockNext);
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        expect(error.message).toContain('Unknown');
      }
    });
  });
});
