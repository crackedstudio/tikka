import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';

const mockExecutionContext = (handler = {}, klass = {}) =>
  ({
    getHandler: () => handler,
    getClass: () => klass,
    switchToHttp: () => ({ getRequest: () => ({}) }),
  }) as unknown as ExecutionContext;

describe('JwtAuthGuard', () => {
  let reflector: Reflector;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
  });

  describe('canActivate', () => {
    it('returns true without calling super when route is @Public()', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);
      const guard = new JwtAuthGuard(reflector);
      const ctx = mockExecutionContext();

      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('delegates to passport when route is not @Public()', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);
      const guard = new JwtAuthGuard(reflector);
      // Stub AuthGuard's canActivate so we don't need a real Passport setup
      jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(guard)), 'canActivate')
        .mockReturnValue(true);

      const ctx = mockExecutionContext();
      expect(guard.canActivate(ctx)).toBe(true);
    });
  });

  describe('handleRequest', () => {
    it('returns the user when present and no error', () => {
      const guard = new JwtAuthGuard(reflector);
      const user = { address: 'GXYZ', iat: 1, exp: 9999999999 };
      expect(guard.handleRequest(null, user)).toBe(user);
    });

    it('throws UnauthorizedException when user is falsy', () => {
      const guard = new JwtAuthGuard(reflector);
      expect(() => guard.handleRequest(null, null)).toThrow(UnauthorizedException);
    });

    it('re-throws the original error when one is provided', () => {
      const guard = new JwtAuthGuard(reflector);
      const err = new UnauthorizedException('token expired');
      expect(() => guard.handleRequest(err, null)).toThrow(err);
    });
  });
});
