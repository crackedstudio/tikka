import {
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

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

  describe('decorator metadata (@Public)', () => {
    it('honors @Public() metadata and skips passport auth', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);
      const guard = new JwtAuthGuard(reflector);
      const handler = { name: 'adminRoute' };
      const klass = { name: 'AdminRafflesController' };
      const ctx = mockExecutionContext(handler, klass);

      expect(guard.canActivate(ctx)).toBe(true);
      expect(reflector.getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, [
        handler,
        klass,
      ]);
    });

    it('does not short-circuit when @Public() metadata is absent/false', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);
      const guard = new JwtAuthGuard(reflector);
      const superCanActivate = jest
        .spyOn(
          Object.getPrototypeOf(Object.getPrototypeOf(guard)),
          'canActivate',
        )
        .mockReturnValue(true);

      const ctx = mockExecutionContext();
      expect(guard.canActivate(ctx)).toBe(true);
      expect(superCanActivate).toHaveBeenCalledWith(ctx);
    });

    it('treats undefined public metadata as protected (delegates to passport)', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);
      const guard = new JwtAuthGuard(reflector);
      const superCanActivate = jest
        .spyOn(
          Object.getPrototypeOf(Object.getPrototypeOf(guard)),
          'canActivate',
        )
        .mockReturnValue('passport-result' as unknown as boolean);

      expect(guard.canActivate(mockExecutionContext())).toBe(
        'passport-result' as unknown as boolean,
      );
      expect(superCanActivate).toHaveBeenCalled();
    });
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
      jest
        .spyOn(
          Object.getPrototypeOf(Object.getPrototypeOf(guard)),
          'canActivate',
        )
        .mockReturnValue(true);

      const ctx = mockExecutionContext();
      expect(guard.canActivate(ctx)).toBe(true);
    });
  });

  describe('handleRequest — authorized user', () => {
    it('returns the user when present and no error (valid token path)', () => {
      const guard = new JwtAuthGuard(reflector);
      const user = { address: 'GXYZ', iat: 1, exp: 9999999999 };
      expect(guard.handleRequest(null, user)).toBe(user);
    });
  });

  describe('handleRequest — missing / expired / malformed token (401)', () => {
    it('throws UnauthorizedException when user is missing (no token)', () => {
      const guard = new JwtAuthGuard(reflector);
      expect(() => guard.handleRequest(null, null)).toThrow(
        UnauthorizedException,
      );
      expect(() => guard.handleRequest(null, null)).toThrow(
        'Invalid or missing token',
      );
    });

    it('throws UnauthorizedException when user is undefined', () => {
      const guard = new JwtAuthGuard(reflector);
      expect(() => guard.handleRequest(null, undefined as never)).toThrow(
        UnauthorizedException,
      );
    });

    it('re-throws expired-token errors from passport', () => {
      const guard = new JwtAuthGuard(reflector);
      const err = new UnauthorizedException('jwt expired');
      expect(() => guard.handleRequest(err, null)).toThrow(err);
      expect(() => guard.handleRequest(err, null)).toThrow('jwt expired');
    });

    it('re-throws malformed-token errors from passport', () => {
      const guard = new JwtAuthGuard(reflector);
      const err = new UnauthorizedException('jwt malformed');
      expect(() => guard.handleRequest(err, false as never)).toThrow(err);
      expect(() => guard.handleRequest(err, false as never)).toThrow(
        'jwt malformed',
      );
    });

    it('prefers the original error over a present user (error wins)', () => {
      const guard = new JwtAuthGuard(reflector);
      const err = new UnauthorizedException('invalid signature');
      const user = { address: 'GABC' };
      expect(() => guard.handleRequest(err, user)).toThrow(err);
    });
  });
});
