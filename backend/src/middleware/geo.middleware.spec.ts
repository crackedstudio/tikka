import { Test, TestingModule } from '@nestjs/testing';
import { GeoMiddleware } from './geo.middleware';
import { GeoService } from '../services/geo.service';
import { FastifyRequest, FastifyReply } from 'fastify';

describe('GeoMiddleware', () => {
  let middleware: GeoMiddleware;
  let geoService: jest.Mocked<GeoService>;
  let mockRequest: Partial<FastifyRequest>;
  let mockResponse: Partial<FastifyReply>;
  let mockNext: jest.Mock;

  beforeEach(async () => {
    geoService = {
      lookupIp: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeoMiddleware,
        {
          provide: GeoService,
          useValue: geoService,
        },
      ],
    }).compile();

    middleware = module.get<GeoMiddleware>(GeoMiddleware);

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

  describe('use', () => {
    it('should set x-country-code header from GeoService lookup', async () => {
      const mockGeoResult = { countryCode: 'US', country: 'United States' };
      geoService.lookupIp.mockResolvedValue(mockGeoResult);

      await middleware.use(mockRequest as FastifyRequest, mockResponse as FastifyReply, mockNext);

      expect(geoService.lookupIp).toHaveBeenCalledWith('192.168.1.1');
      expect(mockRequest.headers['x-country-code']).toBe('US');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should set empty string when GeoService returns null', async () => {
      geoService.lookupIp.mockResolvedValue(null);

      await middleware.use(mockRequest as FastifyRequest, mockResponse as FastifyReply, mockNext);

      expect(geoService.lookupIp).toHaveBeenCalledWith('192.168.1.1');
      expect(mockRequest.headers['x-country-code']).toBe('');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle GeoService errors gracefully', async () => {
      geoService.lookupIp.mockRejectedValue(new Error('Geo service error'));

      await middleware.use(mockRequest as FastifyRequest, mockResponse as FastifyReply, mockNext);

      expect(geoService.lookupIp).toHaveBeenCalledWith('192.168.1.1');
      expect(mockRequest.headers['x-country-code']).toBe('');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle non-Error objects in GeoService errors', async () => {
      geoService.lookupIp.mockRejectedValue('String error');

      await middleware.use(mockRequest as FastifyRequest, mockResponse as FastifyReply, mockNext);

      expect(geoService.lookupIp).toHaveBeenCalledWith('192.168.1.1');
      expect(mockRequest.headers['x-country-code']).toBe('');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should continue to next even when geo lookup fails', async () => {
      geoService.lookupIp.mockRejectedValue(new Error('Network error'));

      await middleware.use(mockRequest as FastifyRequest, mockResponse as FastifyReply, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should not block requests on geo errors', async () => {
      geoService.lookupIp.mockRejectedValue(new Error('Geo service unavailable'));

      await middleware.use(mockRequest as FastifyRequest, mockResponse as FastifyReply, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRequest.headers['x-country-code']).toBe('');
    });
  });

  describe('extractIp', () => {
    it('should extract IP from x-forwarded-for header', async () => {
      mockRequest.headers = {
        'x-forwarded-for': '203.0.113.1, 203.0.113.2',
      };

      geoService.lookupIp.mockResolvedValue({ countryCode: 'CA', country: 'Canada' });

      await middleware.use(mockRequest as FastifyRequest, mockResponse as FastifyReply, mockNext);

      expect(geoService.lookupIp).toHaveBeenCalledWith('203.0.113.1');
    });

    it('should handle array x-forwarded-for header', async () => {
      mockRequest.headers = {
        'x-forwarded-for': ['203.0.113.1', '203.0.113.2'],
      };

      geoService.lookupIp.mockResolvedValue({ countryCode: 'CA', country: 'Canada' });

      await middleware.use(mockRequest as FastifyRequest, mockResponse as FastifyReply, mockNext);

      expect(geoService.lookupIp).toHaveBeenCalledWith('203.0.113.1');
    });

    it('should trim whitespace from x-forwarded-for', async () => {
      mockRequest.headers = {
        'x-forwarded-for': ' 203.0.113.1 , 203.0.113.2',
      };

      geoService.lookupIp.mockResolvedValue({ countryCode: 'CA', country: 'Canada' });

      await middleware.use(mockRequest as FastifyRequest, mockResponse as FastifyReply, mockNext);

      expect(geoService.lookupIp).toHaveBeenCalledWith('203.0.113.1');
    });

    it('should fallback to req.ip when no x-forwarded-for', async () => {
      mockRequest.ip = '203.0.113.3';

      geoService.lookupIp.mockResolvedValue({ countryCode: 'CA', country: 'Canada' });

      await middleware.use(mockRequest as FastifyRequest, mockResponse as FastifyReply, mockNext);

      expect(geoService.lookupIp).toHaveBeenCalledWith('203.0.113.3');
    });

    it('should fallback to socket remote address', async () => {
      delete mockRequest.ip;
      mockRequest.raw = {
        socket: {
          remoteAddress: '203.0.113.4',
        },
      };

      geoService.lookupIp.mockResolvedValue({ countryCode: 'CA', country: 'Canada' });

      await middleware.use(mockRequest as FastifyRequest, mockResponse as FastifyReply, mockNext);

      expect(geoService.lookupIp).toHaveBeenCalledWith('203.0.113.4');
    });

    it('should return unknown when no IP can be determined', async () => {
      delete mockRequest.ip;
      mockRequest.raw = {};

      geoService.lookupIp.mockResolvedValue({ countryCode: 'CA', country: 'Canada' });

      await middleware.use(mockRequest as FastifyRequest, mockResponse as FastifyReply, mockNext);

      expect(geoService.lookupIp).toHaveBeenCalledWith('unknown');
    });

    it('should handle missing socket property', async () => {
      delete mockRequest.ip;
      mockRequest.raw = undefined as any;

      geoService.lookupIp.mockResolvedValue({ countryCode: 'CA', country: 'Canada' });

      await middleware.use(mockRequest as FastifyRequest, mockResponse as FastifyReply, mockNext);

      expect(geoService.lookupIp).toHaveBeenCalledWith('unknown');
    });
  });

  describe('header mutation', () => {
    it('should mutate headers object directly', async () => {
      const headers: Record<string, string> = {};
      mockRequest.headers = headers;

      geoService.lookupIp.mockResolvedValue({ countryCode: 'US', country: 'United States' });

      await middleware.use(mockRequest as FastifyRequest, mockResponse as FastifyReply, mockNext);

      expect(headers['x-country-code']).toBe('US');
    });

    it('should preserve existing headers', async () => {
      const headers: Record<string, string> = {
        'existing-header': 'value',
        'authorization': 'Bearer token',
      };
      mockRequest.headers = headers;

      geoService.lookupIp.mockResolvedValue({ countryCode: 'US', country: 'United States' });

      await middleware.use(mockRequest as FastifyRequest, mockResponse as FastifyReply, mockNext);

      expect(headers['existing-header']).toBe('value');
      expect(headers['authorization']).toBe('Bearer token');
      expect(headers['x-country-code']).toBe('US');
    });

    it('should overwrite existing x-country-code header', async () => {
      const headers: Record<string, string> = {
        'x-country-code': 'OLD',
      };
      mockRequest.headers = headers;

      geoService.lookupIp.mockResolvedValue({ countryCode: 'US', country: 'United States' });

      await middleware.use(mockRequest as FastifyRequest, mockResponse as FastifyReply, mockNext);

      expect(headers['x-country-code']).toBe('US');
    });
  });

  describe('CF-IPCountry header support', () => {
    it('should check CF-IPCountry header before IP lookup', async () => {
      mockRequest.headers = {
        'cf-ipcountry': 'US',
      };

      geoService.lookupIp.mockResolvedValue({ countryCode: 'CA', country: 'Canada' });

      await middleware.use(mockRequest as FastifyRequest, mockResponse as FastifyReply, mockNext);

      // Should still do IP lookup as GeoMiddleware doesn't use CF-IPCountry directly
      // (that's GeoBlockingMiddleware's job)
      expect(geoService.lookupIp).toHaveBeenCalled();
      expect(mockRequest.headers['x-country-code']).toBe('CA');
    });

    it('should handle XX country code from CF-IPCountry', async () => {
      mockRequest.headers = {
        'cf-ipcountry': 'XX',
      };

      geoService.lookupIp.mockResolvedValue(null);

      await middleware.use(mockRequest as FastifyRequest, mockResponse as FastifyReply, mockNext);

      expect(geoService.lookupIp).toHaveBeenCalled();
      expect(mockRequest.headers['x-country-code']).toBe('');
    });
  });

  describe('X-Country-Code header support', () => {
    it('should check X-Country-Code header before IP lookup', async () => {
      mockRequest.headers = {
        'x-country-code': 'US',
      };

      geoService.lookupIp.mockResolvedValue({ countryCode: 'CA', country: 'Canada' });

      await middleware.use(mockRequest as FastifyRequest, mockResponse as FastifyReply, mockNext);

      // Should still do IP lookup as GeoMiddleware doesn't use X-Country-Code directly
      expect(geoService.lookupIp).toHaveBeenCalled();
      expect(mockRequest.headers['x-country-code']).toBe('CA');
    });

    it('should handle empty X-Country-Code header', async () => {
      mockRequest.headers = {
        'x-country-code': '',
      };

      geoService.lookupIp.mockResolvedValue(null);

      await middleware.use(mockRequest as FastifyRequest, mockResponse as FastifyReply, mockNext);

      expect(geoService.lookupIp).toHaveBeenCalled();
      expect(mockRequest.headers['x-country-code']).toBe('');
    });
  });

  describe('edge cases', () => {
    it('should handle IPv6 addresses', async () => {
      mockRequest.ip = '::1';

      geoService.lookupIp.mockResolvedValue(null);

      await middleware.use(mockRequest as FastifyRequest, mockResponse as FastifyReply, mockNext);

      expect(geoService.lookupIp).toHaveBeenCalledWith('::1');
      expect(mockRequest.headers['x-country-code']).toBe('');
    });

    it('should handle IPv6-mapped IPv4 addresses', async () => {
      mockRequest.ip = '::ffff:192.168.1.1';

      geoService.lookupIp.mockResolvedValue({ countryCode: 'US', country: 'United States' });

      await middleware.use(mockRequest as FastifyRequest, mockResponse as FastifyReply, mockNext);

      expect(geoService.lookupIp).toHaveBeenCalledWith('::ffff:192.168.1.1');
      expect(mockRequest.headers['x-country-code']).toBe('US');
    });

    it('should handle malformed x-forwarded-for header', async () => {
      mockRequest.headers = {
        'x-forwarded-for': '',
      };

      geoService.lookupIp.mockResolvedValue({ countryCode: 'CA', country: 'Canada' });

      await middleware.use(mockRequest as FastifyRequest, mockResponse as FastifyReply, mockNext);

      expect(geoService.lookupIp).toHaveBeenCalledWith('');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle null x-forwarded-for header', async () => {
      mockRequest.headers = {
        'x-forwarded-for': null,
      };

      geoService.lookupIp.mockResolvedValue({ countryCode: 'CA', country: 'Canada' });

      await middleware.use(mockRequest as FastifyRequest, mockResponse as FastifyReply, mockNext);

      expect(geoService.lookupIp).toHaveBeenCalledWith('192.168.1.1'); // fallback to IP
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('logging', () => {
    it('should log debug message when country is resolved', async () => {
      const loggerSpy = jest.spyOn(middleware['logger'], 'debug');
      geoService.lookupIp.mockResolvedValue({ countryCode: 'US', country: 'United States' });

      await middleware.use(mockRequest as FastifyRequest, mockResponse as FastifyReply, mockNext);

      expect(loggerSpy).toHaveBeenCalledWith('IP 192.168.1.1 resolved to country: US');
    });

    it('should not log debug message when country is empty', async () => {
      const loggerSpy = jest.spyOn(middleware['logger'], 'debug');
      geoService.lookupIp.mockResolvedValue(null);

      await middleware.use(mockRequest as FastifyRequest, mockResponse as FastifyReply, mockNext);

      expect(loggerSpy).not.toHaveBeenCalled();
    });

    it('should log warning when geo service throws error', async () => {
      const loggerSpy = jest.spyOn(middleware['logger'], 'warn');
      geoService.lookupIp.mockRejectedValue(new Error('Geo service error'));

      await middleware.use(mockRequest as FastifyRequest, mockResponse as FastifyReply, mockNext);

      expect(loggerSpy).toHaveBeenCalledWith('GeoMiddleware error: Geo service error');
    });

    it('should log warning when geo service throws string error', async () => {
      const loggerSpy = jest.spyOn(middleware['logger'], 'warn');
      geoService.lookupIp.mockRejectedValue('String error');

      await middleware.use(mockRequest as FastifyRequest, mockResponse as FastifyReply, mockNext);

      expect(loggerSpy).toHaveBeenCalledWith('GeoMiddleware error: String error');
    });
  });
});
