import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ADDRESS = 'GABC123';
const NONCE = 'test-nonce';
const SIGNATURE = 'test-sig';
const ISSUED_AT = new Date().toISOString();

function makeTokens() {
  return { accessToken: 'mock-access-token', refreshToken: 'mock-refresh-token' };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('AuthController', () => {
  let controller: AuthController;
  let service: jest.Mocked<AuthService>;
  let jwtService: jest.Mocked<JwtService>;

  beforeEach(async () => {
    service = {
      getNonce: jest.fn(),
      verify: jest.fn(),
      refresh: jest.fn(),
      signOut: jest.fn(),
      issueTokens: jest.fn(),
    } as unknown as jest.Mocked<AuthService>;

    jwtService = {
      sign: jest.fn().mockReturnValue('mock-jwt-token'),
      verify: jest.fn(),
    } as unknown as jest.Mocked<JwtService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: service },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  afterEach(() => jest.clearAllMocks());

  // -------------------------------------------------------------------------
  // GET /auth/nonce
  // -------------------------------------------------------------------------

  describe('getNonce', () => {
    it('returns nonce payload from service', async () => {
      const expected = {
        nonce: NONCE,
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
        issuedAt: ISSUED_AT,
        message: 'mock-message',
      };
      service.getNonce.mockResolvedValue(expected);

      const result = await controller.getNonce(ADDRESS);

      expect(service.getNonce).toHaveBeenCalledWith(ADDRESS);
      expect(result).toBe(expected);
    });
  });

  // -------------------------------------------------------------------------
  // POST /auth/verify
  // -------------------------------------------------------------------------

  describe('verify', () => {
    it('returns tokens for a valid SIWS verification', async () => {
      const tokens = makeTokens();
      service.verify.mockResolvedValue(tokens);

      const result = await controller.verify({
        address: ADDRESS,
        signature: SIGNATURE,
        nonce: NONCE,
        issuedAt: ISSUED_AT,
      } as any);

      expect(service.verify).toHaveBeenCalledWith(
        ADDRESS,
        SIGNATURE,
        NONCE,
        ISSUED_AT,
      );
      expect(result).toBe(tokens);
    });

    it('throws BadRequestException for an invalid signature', async () => {
      service.verify.mockRejectedValue(new Error('Invalid signature'));

      await expect(
        controller.verify({
          address: ADDRESS,
          signature: SIGNATURE,
          nonce: NONCE,
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException for an expired nonce', async () => {
      service.verify.mockRejectedValue(new Error('Nonce expired'));

      await expect(
        controller.verify({
          address: ADDRESS,
          signature: SIGNATURE,
          nonce: NONCE,
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException for a replayed nonce', async () => {
      service.verify.mockRejectedValue(
        new Error('Invalid or expired nonce'),
      );

      await expect(
        controller.verify({
          address: ADDRESS,
          signature: SIGNATURE,
          nonce: NONCE,
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('uses default message when a non-Error is thrown', async () => {
      service.verify.mockRejectedValue('string-throw');

      try {
        await controller.verify({
          address: ADDRESS,
          signature: SIGNATURE,
          nonce: NONCE,
        } as any);
        fail('expected BadRequestException');
      } catch (err) {
        expect(err).toBeInstanceOf(BadRequestException);
        expect((err as BadRequestException).message).toBe('Verification failed');
      }
    });

    it('includes the original error message in the BadRequestException', async () => {
      service.verify.mockRejectedValue(new Error('Invalid signature'));

      try {
        await controller.verify({
          address: ADDRESS,
          signature: SIGNATURE,
          nonce: NONCE,
        } as any);
        fail('expected BadRequestException');
      } catch (err) {
        expect(err).toBeInstanceOf(BadRequestException);
        expect((err as BadRequestException).message).toBe('Invalid signature');
      }
    });
  });

  // -------------------------------------------------------------------------
  // POST /auth/refresh
  // -------------------------------------------------------------------------

  describe('refresh', () => {
    it('returns new tokens', async () => {
      const tokens = makeTokens();
      service.refresh.mockResolvedValue(tokens);

      const result = await controller.refresh({
        refreshToken: 'refresh-token',
      } as any);

      expect(service.refresh).toHaveBeenCalledWith('refresh-token');
      expect(result).toBe(tokens);
    });

    it('throws BadRequestException on refresh failure', async () => {
      service.refresh.mockRejectedValue(new Error('Invalid refresh token'));

      await expect(
        controller.refresh({ refreshToken: 'bad-token' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('uses default message when a non-Error is thrown on refresh', async () => {
      service.refresh.mockRejectedValue(42);

      try {
        await controller.refresh({ refreshToken: 'token' } as any);
        fail('expected BadRequestException');
      } catch (err) {
        expect(err).toBeInstanceOf(BadRequestException);
        expect((err as BadRequestException).message).toBe('Refresh failed');
      }
    });
  });

  // -------------------------------------------------------------------------
  // POST /auth/sign-out
  // -------------------------------------------------------------------------

  describe('signOut', () => {
    it('returns a signed-out message', async () => {
      service.signOut.mockResolvedValue(undefined);

      const result = await controller.signOut({
        refreshToken: 'refresh-token',
      } as any);

      expect(service.signOut).toHaveBeenCalledWith('refresh-token');
      expect(result).toEqual({ message: 'Signed out' });
    });

    it('throws BadRequestException on sign-out failure', async () => {
      service.signOut.mockRejectedValue(new Error('Refresh token required'));

      await expect(
        controller.signOut({ refreshToken: 'token' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('uses default message when a non-Error is thrown on sign-out', async () => {
      service.signOut.mockRejectedValue({ reason: 'unknown' });

      try {
        await controller.signOut({ refreshToken: 'token' } as any);
        fail('expected BadRequestException');
      } catch (err) {
        expect(err).toBeInstanceOf(BadRequestException);
        expect((err as BadRequestException).message).toBe('Sign-out failed');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Throttle tiers
  // -------------------------------------------------------------------------

  describe('throttle tiers', () => {
    const THROTTLER_TTL = 'THROTTLER:TTL';
    const THROTTLER_LIMIT = 'THROTTLER:LIMIT';

    it('applies the nonce tier to GET /nonce', () => {
      const ttl = Reflect.getMetadata(
        THROTTLER_TTL + 'nonce',
        controller.getNonce,
      );
      const limit = Reflect.getMetadata(
        THROTTLER_LIMIT + 'nonce',
        controller.getNonce,
      );

      expect(ttl).toBe(60000);
      expect(limit).toBe(10);
    });

    it('applies the auth tier to POST /verify', () => {
      const ttl = Reflect.getMetadata(
        THROTTLER_TTL + 'auth',
        controller.verify,
      );
      const limit = Reflect.getMetadata(
        THROTTLER_LIMIT + 'auth',
        controller.verify,
      );

      expect(ttl).toBe(900000);
      expect(limit).toBe(5);
    });

    it('applies the auth tier to POST /refresh', () => {
      const ttl = Reflect.getMetadata(
        THROTTLER_TTL + 'auth',
        controller.refresh,
      );
      const limit = Reflect.getMetadata(
        THROTTLER_LIMIT + 'auth',
        controller.refresh,
      );

      expect(ttl).toBe(60000);
      expect(limit).toBe(30);
    });

    it('applies the auth tier to POST /sign-out', () => {
      const ttl = Reflect.getMetadata(
        THROTTLER_TTL + 'auth',
        controller.signOut,
      );
      const limit = Reflect.getMetadata(
        THROTTLER_LIMIT + 'auth',
        controller.signOut,
      );

      expect(ttl).toBe(60000);
      expect(limit).toBe(10);
    });
  });

  // -------------------------------------------------------------------------
  // JWT claims — shape only; deeper validation lives in auth.service.spec.ts
  // -------------------------------------------------------------------------

  describe('JWT response shape', () => {
    it('returns only accessToken and refreshToken — no sensitive fields', async () => {
      const tokens = {
        accessToken: 'at',
        refreshToken: 'rt',
      };
      service.verify.mockResolvedValue(tokens);

      const result = await controller.verify({
        address: ADDRESS,
        signature: SIGNATURE,
        nonce: NONCE,
      } as any);

      expect(Object.keys(result)).toEqual([
        'accessToken',
        'refreshToken',
      ]);
      expect(result).not.toHaveProperty('password');
      expect(result).not.toHaveProperty('secret');
      expect(result).not.toHaveProperty('privateKey');
    });
  });
});
