import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SiwsService } from './siws.service';
import { SUPABASE_CLIENT } from '../services/storage/supabase.provider';
import { env } from '../config/env.config';

/**
 * The HTTP surface of authentication.
 *
 * `auth.service.spec.ts` covers the service, `siws.service.spec.ts` the
 * signature check, and the guards/strategy have their own specs — but the
 * controller is where a nonce is issued and a SIWS signature is exchanged for a
 * JWT, so it is the one place where the nonce lifecycle is observable end to
 * end. The service is therefore used **for real** here, with only its
 * collaborators (Supabase, the JWT signer, SIWS) faked; a mocked AuthService
 * would let the replay and expiry assertions decide themselves.
 *
 * `SiwsService` is faked deliberately: signature verification is
 * `siws.service.spec.ts`'s subject, so this spec only needs "the signature was
 * good" versus "it was not".
 */

const ADDRESS = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const SIGNATURE = 'c2lnbmF0dXJl';

/** A chainable stand-in for the Supabase client, recording every write. */
function makeSupabaseMock() {
  const client: any = {
    from: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    select: jest.fn(),
    eq: jest.fn(),
    lte: jest.fn(),
    limit: jest.fn(),
    maybeSingle: jest.fn(),
  };

  client.from.mockReturnValue(client);
  // Nonce insert and refresh-token insert both succeed.
  client.insert.mockResolvedValue({ error: null });
  client.delete.mockReturnValue(client);
  client.lte.mockResolvedValue({ error: null });
  // `update({ consumed: true }).eq('id', …)` and `update(...).eq(...).eq(...)`
  client.update.mockReturnValue({
    eq: jest.fn().mockResolvedValue({ error: null }),
  });
  client.select.mockReturnValue(client);
  client.limit.mockReturnValue(client);
  client.maybeSingle.mockResolvedValue({ data: null, error: null });

  return client;
}

/** Rows written to a table, flattened out of `insert([row])` calls. */
function insertedRows(supabase: any): any[] {
  return supabase.insert.mock.calls.flatMap((call: any[]) => call[0] ?? []);
}

/** `'7d'` → `604800`. Keeps the expiry assertion honest if the env changes. */
function expirySeconds(expression: string): number {
  const match = expression.match(/^(\d+)([smhd])$/);
  if (!match) throw new Error(`Unsupported expiry expression: ${expression}`);
  const value = parseInt(match[1], 10);
  return value * { s: 1, m: 60, h: 3600, d: 86400 }[match[2] as 's' | 'm' | 'h' | 'd'];
}

/**
 * Read a throttler tier declared on a handler.
 *
 * The metadata key and value shape are owned by `@nestjs/throttler` and have
 * changed between majors, so the tier is located structurally — an object that
 * carries `limit`/`ttl` and is named for the tier, whether by its own `name`
 * field or by the key it is stored under — rather than by importing a constant
 * whose name is an implementation detail.
 */
function declaredTier(
  handler: object,
  tierName: string,
): { name: string; limit?: number; ttl?: number } | undefined {
  const seen = new Set<unknown>();

  function scan(
    value: unknown,
    parentKey: string | undefined,
  ): { name: string; limit?: number; ttl?: number } | undefined {
    if (!value || typeof value !== 'object' || seen.has(value)) return undefined;
    seen.add(value);

    const record = value as Record<string, any>;
    const named = typeof record.name === 'string' ? record.name : undefined;
    const isTier = named === tierName || parentKey === tierName;

    if (isTier && (typeof record.limit === 'number' || typeof record.ttl === 'number')) {
      return { name: tierName, limit: record.limit, ttl: record.ttl };
    }

    const children: Array<[string | undefined, unknown]> = Array.isArray(value)
      ? value.map((item) => [undefined, item])
      : Object.entries(record);

    for (const [key, child] of children) {
      const hit = scan(child, key);
      if (hit) return hit;
    }

    return undefined;
  }

  for (const key of Reflect.getOwnMetadataKeys(handler)) {
    const hit = scan(Reflect.getMetadata(key, handler), undefined);
    if (hit) return hit;
  }

  return undefined;
}

describe('AuthController', () => {
  let controller: AuthController;
  let service: AuthService;
  let jwtService: JwtService;
  let siwsService: jest.Mocked<SiwsService>;
  let supabase: any;

  beforeEach(async () => {
    siwsService = {
      buildMessage: jest
        .fn()
        .mockImplementation(
          (address: string, nonce: string, issuedAt: string) =>
            `tikka.io wants you to sign in\nAddress: ${address}\nNonce: ${nonce}\nIssued At: ${issuedAt}`,
        ),
      verify: jest.fn().mockReturnValue(true),
    } as any;

    supabase = makeSupabaseMock();

    // A real JwtService, so the claims and expiry asserted below are the ones
    // a client would receive rather than a stub's return value.
    jwtService = new JwtService({
      secret: env.jwt.secret,
      signOptions: { expiresIn: env.jwt.expiresIn },
    });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthService,
        { provide: JwtService, useValue: jwtService },
        { provide: SiwsService, useValue: siwsService },
        { provide: SUPABASE_CLIENT, useValue: supabase },
      ],
    }).compile();

    controller = module.get(AuthController);
    service = module.get(AuthService);
  });

  afterEach(() => jest.clearAllMocks());

  /** Issue a nonce through the controller and return the signable body. */
  async function nonceBody() {
    const issued = await controller.getNonce(ADDRESS);
    return {
      address: ADDRESS,
      signature: SIGNATURE,
      nonce: issued.nonce,
      issuedAt: issued.issuedAt,
    };
  }

  // -------------------------------------------------------------------------
  // GET /auth/nonce
  // -------------------------------------------------------------------------

  describe('GET /auth/nonce', () => {
    it('issues a nonce, its expiry, and the message the client must sign', async () => {
      const before = Date.now();
      const result = await controller.getNonce(ADDRESS);

      expect(result.nonce).toMatch(/^[0-9a-f]{32}$/);
      expect(result.message).toContain(result.nonce);
      expect(result.message).toContain(ADDRESS);

      const issuedAt = new Date(result.issuedAt).getTime();
      const expiresAt = new Date(result.expiresAt).getTime();
      expect(issuedAt).toBeGreaterThanOrEqual(before);
      expect(expiresAt - issuedAt).toBe(env.siws.nonceTtlSeconds * 1000);

      // The nonce is persisted as unconsumed before it is ever accepted.
      expect(supabase.from).toHaveBeenCalledWith('siws_nonces');
      expect(insertedRows(supabase)).toContainEqual(
        expect.objectContaining({
          address: ADDRESS,
          nonce: result.nonce,
          consumed: false,
        }),
      );
    });

    it('expires nonces that are past their TTL before allocating a new one', async () => {
      await controller.getNonce(ADDRESS);

      expect(supabase.delete).toHaveBeenCalled();
      expect(supabase.lte).toHaveBeenCalledWith(
        'expires_at',
        expect.any(String),
      );
    });

    it('leaves the previous nonce unusable when a newer one is requested', async () => {
      const first = await controller.getNonce(ADDRESS);
      const second = await controller.getNonce(ADDRESS);

      expect(second.nonce).not.toBe(first.nonce);

      // Only one nonce per address is live: the superseded one is rejected.
      await expect(
        controller.verify({
          address: ADDRESS,
          signature: SIGNATURE,
          nonce: first.nonce,
          issuedAt: first.issuedAt,
        }),
      ).rejects.toThrow('Invalid or expired nonce');
    });

    it('surfaces a storage failure instead of issuing an unusable nonce', async () => {
      supabase.insert.mockResolvedValueOnce({
        error: new Error('db down'),
      });

      await expect(controller.getNonce(ADDRESS)).rejects.toThrow(
        'Failed to store nonce',
      );
    });
  });

  // -------------------------------------------------------------------------
  // POST /auth/verify
  // -------------------------------------------------------------------------

  describe('POST /auth/verify', () => {
    it('exchanges a valid SIWS signature for an access and refresh token', async () => {
      const body = await nonceBody();

      const result = await controller.verify(body);

      expect(result.accessToken).toEqual(expect.any(String));
      expect(result.refreshToken).toEqual(expect.any(String));
      expect(result.refreshToken).not.toBe(result.accessToken);
      expect(siwsService.verify).toHaveBeenCalledWith(
        ADDRESS,
        expect.stringContaining(body.nonce),
        SIGNATURE,
      );
    });

    it('rejects an invalid signature', async () => {
      const body = await nonceBody();
      siwsService.verify.mockReturnValueOnce(false);

      await expect(controller.verify(body)).rejects.toThrow(
        new BadRequestException('Invalid signature'),
      );
    });

    it('rejects an expired nonce', async () => {
      const body = await nonceBody();

      // Move the stored nonce into the past. Forcing expiry through the store
      // keeps the assertion deterministic without freezing the clock, matching
      // how auth.service.spec.ts exercises the same branch.
      const stored = (service as any).nonces.get(ADDRESS);
      (service as any).nonces.set(ADDRESS, {
        ...stored,
        expires_at: new Date(Date.now() - 1000).toISOString(),
      });

      await expect(controller.verify(body)).rejects.toThrow('Nonce expired');
    });

    it('rejects a replayed nonce — a nonce is single-use', async () => {
      const body = await nonceBody();

      const first = await controller.verify(body);
      expect(first.accessToken).toEqual(expect.any(String));

      // Replaying the exact same (address, nonce, signature) must not mint a
      // second session: replay is the main attack on sign-in-with-wallet.
      await expect(controller.verify(body)).rejects.toThrow(
        'Invalid or expired nonce',
      );
    });

    it('does not issue tokens when the nonce cannot be consumed', async () => {
      const body = await nonceBody();
      // The nonce row write fails, so the nonce was never marked consumed.
      supabase.update.mockReturnValueOnce({
        eq: jest.fn().mockResolvedValue({ error: new Error('write failed') }),
      });
      const signSpy = jest.spyOn(jwtService, 'sign');

      await expect(controller.verify(body)).rejects.toThrow(
        'Failed to invalidate nonce',
      );
      expect(signSpy).not.toHaveBeenCalled();

      // …and the nonce is spent anyway: a failed consume is fail-closed.
      await expect(controller.verify(body)).rejects.toThrow(
        'Invalid or expired nonce',
      );
    });

    it('maps an unexpected service failure to a 400 without leaking internals', async () => {
      const body = await nonceBody();
      jest
        .spyOn(service, 'verify')
        .mockRejectedValueOnce(new Error('boom'));

      await expect(controller.verify(body)).rejects.toThrow(
        new BadRequestException('boom'),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Issued token shape
  // -------------------------------------------------------------------------

  describe('issued token', () => {
    it('carries the address and the configured expiry, and nothing sensitive', async () => {
      const body = await nonceBody();
      const { accessToken, refreshToken } = await controller.verify(body);

      const payload = jwtService.verify(accessToken);

      expect(payload.address).toBe(ADDRESS);
      expect(payload.exp - payload.iat).toBe(
        expirySeconds(env.jwt.expiresIn),
      );

      // Exactly the expected claims — no scanned signature, nonce, or refresh
      // token riding along in the access token.
      expect(Object.keys(payload).sort()).toEqual(['address', 'exp', 'iat']);

      const serialized = JSON.stringify(payload);
      expect(serialized).not.toContain(body.nonce);
      expect(serialized).not.toContain(SIGNATURE);
      expect(serialized).not.toContain(refreshToken);

      // The refresh token is marked as such so it cannot be used as an access
      // token.
      expect(jwtService.verify(refreshToken).type).toBe('refresh');
    });

    it('stores a hash of the refresh token, never the token itself', async () => {
      const body = await nonceBody();
      const { refreshToken } = await controller.verify(body);

      const refreshRow = insertedRows(supabase).find(
        (row: any) => row?.token_hash !== undefined,
      );

      expect(refreshRow).toBeDefined();
      expect(refreshRow.token_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(refreshRow.token_hash).not.toBe(refreshToken);
      expect(JSON.stringify(refreshRow)).not.toContain(refreshToken);
      expect(refreshRow.revoked).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Error mapping on the remaining routes
  // -------------------------------------------------------------------------

  describe('POST /auth/refresh and /auth/sign-out', () => {
    it('maps a refresh failure to a 400 with the service message', async () => {
      jest
        .spyOn(service, 'refresh')
        .mockRejectedValueOnce(new Error('Refresh token reuse detected — session revoked'));

      await expect(
        controller.refresh({ refreshToken: 'stolen-token' }),
      ).rejects.toThrow(
        new BadRequestException(
          'Refresh token reuse detected — session revoked',
        ),
      );
    });

    it('acknowledges a successful sign-out', async () => {
      const signOut = jest.spyOn(service, 'signOut').mockResolvedValueOnce();

      await expect(
        controller.signOut({ refreshToken: 'a-refresh-token' }),
      ).resolves.toEqual({ message: 'Signed out' });
      expect(signOut).toHaveBeenCalledWith('a-refresh-token');
    });

    it('maps a sign-out failure to a 400', async () => {
      jest.spyOn(service, 'signOut').mockRejectedValueOnce(new Error('nope'));

      await expect(
        controller.signOut({ refreshToken: 'a-refresh-token' }),
      ).rejects.toThrow(new BadRequestException('nope'));
    });
  });

  // -------------------------------------------------------------------------
  // Throttling
  // -------------------------------------------------------------------------

  describe('rate limiting', () => {
    it('is mounted under the auth route prefix', () => {
      expect(Reflect.getMetadata('path', AuthController)).toBe('auth');
    });

    it('applies the auth tier (5 req / 15 min) to POST /auth/verify', () => {
      const tier = declaredTier(AuthController.prototype.verify, 'auth');

      expect(tier).toMatchObject({ name: 'auth', limit: 5, ttl: 900_000 });
    });

    it('applies the nonce tier (10 req / 60 s) to GET /auth/nonce', () => {
      const tier = declaredTier(AuthController.prototype.getNonce, 'nonce');

      expect(tier).toMatchObject({ name: 'nonce', limit: 10, ttl: 60_000 });
    });

    it('applies a tier to refresh and sign-out', () => {
      // Both are credential-bearing routes, so neither may be unrated.
      expect(declaredTier(AuthController.prototype.refresh, 'auth')).toBeDefined();
      expect(
        declaredTier(AuthController.prototype.signOut, 'auth'),
      ).toBeDefined();
    });

    it('gives every auth route a declared tier', () => {
      const handlers: Array<[string, (...args: any[]) => any]> = [
        ['getNonce', AuthController.prototype.getNonce],
        ['verify', AuthController.prototype.verify],
        ['refresh', AuthController.prototype.refresh],
        ['signOut', AuthController.prototype.signOut],
      ];

      for (const [name, handler] of handlers) {
        const tiered = ['auth', 'nonce', 'default'].some((tier) =>
          Boolean(declaredTier(handler, tier)),
        );
        expect({ handler: name, tiered }).toEqual({ handler: name, tiered: true });
      }
    });
  });
});
