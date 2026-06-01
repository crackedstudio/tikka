import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { SiwsService } from './siws.service';
import { SUPABASE_CLIENT } from '../services/supabase.provider';
import { env } from '../config/env.config';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ADDRESS = 'GABC123';
const FAMILY_ID = 'test-family-id';
const RAW_TOKEN = 'raw-refresh-token';
const TOKEN_HASH = 'hashed-token';

function makeTokenRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    user_address: ADDRESS,
    token_hash: TOKEN_HASH,
    revoked: false,
    family_id: FAMILY_ID,
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: jest.Mocked<JwtService>;
  let siwsService: jest.Mocked<SiwsService>;
  let supabase: any;

  // Chainable Supabase query builder mock
  function makeQueryBuilder(terminal: () => Promise<any>) {
    const builder: any = {
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockImplementation(terminal),
      // update().eq().eq() chains resolve via the last eq
    };
    // Make update chains resolve via a then-able
    builder.update.mockImplementation(() => {
      const updateChain: any = {
        eq: jest.fn().mockReturnThis(),
        then: (resolve: any) => resolve({ error: null }),
      };
      return updateChain;
    });
    return builder;
  }

  beforeEach(async () => {
    jwtService = {
      sign: jest.fn().mockReturnValue('mock-token'),
      verify: jest.fn(),
    } as any;

    siwsService = {
      buildMessage: jest.fn().mockReturnValue('mock-message'),
      verify: jest.fn().mockReturnValue(true),
    } as any;

    // Default supabase mock — individual tests override as needed.
    supabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockResolvedValue({ error: null }),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: jwtService },
        { provide: SiwsService, useValue: siwsService },
        { provide: SUPABASE_CLIENT, useValue: supabase },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);

    // Spy on private hashToken to return a predictable value.
    jest.spyOn(service as any, 'hashToken').mockReturnValue(TOKEN_HASH);
  });

  afterEach(() => jest.clearAllMocks());

  // -------------------------------------------------------------------------
  // getNonce
  // -------------------------------------------------------------------------

  describe('getNonce', () => {
    it('generates and stores a nonce', async () => {
      const result = await service.getNonce(ADDRESS);

      expect(result).toHaveProperty('nonce');
      expect(result).toHaveProperty('expiresAt');
      expect(result).toHaveProperty('issuedAt');
      expect(result).toHaveProperty('message');
      expect(supabase.from).toHaveBeenCalledWith('siws_nonces');
      expect(supabase.insert).toHaveBeenCalled();
    });

    it('throws when DB insert fails', async () => {
      supabase.insert.mockResolvedValueOnce({ error: new Error('db error') });
      await expect(service.getNonce(ADDRESS)).rejects.toThrow('Failed to store nonce');
    });
  });

  // -------------------------------------------------------------------------
  // verify
  // -------------------------------------------------------------------------

  describe('verify', () => {
    const nonce = 'mock-nonce';
    const signature = 'mock-sig';
    const issuedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 300_000).toISOString();

    function setupNonce(overrides: Record<string, unknown> = {}) {
      supabase.maybeSingle.mockResolvedValueOnce({
        data: { id: 1, address: ADDRESS, nonce, issued_at: issuedAt, expires_at: expiresAt, consumed: false, ...overrides },
        error: null,
      });
      // nonce update
      supabase.update.mockReturnValueOnce({ eq: jest.fn().mockResolvedValue({ error: null }) });
      // refresh token insert (issueTokens)
      supabase.insert.mockResolvedValueOnce({ error: null });
    }

    it('verifies a valid signature and issues tokens', async () => {
      setupNonce();
      const result = await service.verify(ADDRESS, signature, nonce, issuedAt);
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    it('throws when nonce is not found', async () => {
      supabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
      await expect(service.verify(ADDRESS, signature, nonce, issuedAt))
        .rejects.toThrow('Invalid or expired nonce');
    });

    it('throws when nonce is expired (absolute)', async () => {
      setupNonce({ expires_at: new Date(Date.now() - 1000).toISOString() });
      await expect(service.verify(ADDRESS, signature, nonce, issuedAt))
        .rejects.toThrow('Nonce expired');
    });

    it('throws when nonce is expired (relative TTL)', async () => {
      const oldIssuedAt = new Date(Date.now() - (env.siws.nonceTtlSeconds + 10) * 1000).toISOString();
      setupNonce({ issued_at: oldIssuedAt });
      await expect(service.verify(ADDRESS, signature, nonce, oldIssuedAt))
        .rejects.toThrow('Nonce expired');
    });

    it('throws when signature is invalid', async () => {
      setupNonce();
      siwsService.verify.mockReturnValueOnce(false);
      await expect(service.verify(ADDRESS, signature, nonce, issuedAt))
        .rejects.toThrow('Invalid signature');
    });
  });

  // -------------------------------------------------------------------------
  // refresh — normal rotation
  // -------------------------------------------------------------------------

  describe('refresh — normal rotation', () => {
    it('issues new tokens and revokes the old token row', async () => {
      jwtService.verify.mockReturnValue({ address: ADDRESS, type: 'refresh' } as any);

      // First maybeSingle: token lookup
      supabase.maybeSingle.mockResolvedValueOnce({
        data: makeTokenRow(),
        error: null,
      });

      // update (revoke old token) — chainable
      const revokeChain = { eq: jest.fn().mockReturnThis(), then: (r: any) => r({ error: null }) };
      supabase.update.mockReturnValueOnce(revokeChain);

      // insert (store new token)
      supabase.insert.mockResolvedValueOnce({ error: null });

      const result = await service.refresh(RAW_TOKEN);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      // Old token should have been marked revoked
      expect(supabase.update).toHaveBeenCalled();
    });

    it('preserves the same family_id across rotations', async () => {
      jwtService.verify.mockReturnValue({ address: ADDRESS, type: 'refresh' } as any);

      supabase.maybeSingle.mockResolvedValueOnce({
        data: makeTokenRow({ family_id: FAMILY_ID }),
        error: null,
      });

      const revokeChain = { eq: jest.fn().mockReturnThis(), then: (r: any) => r({ error: null }) };
      supabase.update.mockReturnValueOnce(revokeChain);

      let insertedRow: any;
      supabase.insert.mockImplementationOnce((rows: any[]) => {
        insertedRow = rows[0];
        return Promise.resolve({ error: null });
      });

      await service.refresh(RAW_TOKEN);

      expect(insertedRow?.family_id).toBe(FAMILY_ID);
    });
  });

  // -------------------------------------------------------------------------
  // refresh — reuse detection
  // -------------------------------------------------------------------------

  describe('refresh — reuse detection', () => {
    it('revokes the entire family when a superseded token is reused', async () => {
      jwtService.verify.mockReturnValue({ address: ADDRESS, type: 'refresh' } as any);

      // Token is already revoked (superseded)
      supabase.maybeSingle.mockResolvedValueOnce({
        data: makeTokenRow({ revoked: true }),
        error: null,
      });

      // Family revocation update
      const familyRevokeChain = { eq: jest.fn().mockReturnThis(), then: (r: any) => r({ error: null }) };
      supabase.update.mockReturnValueOnce(familyRevokeChain);

      await expect(service.refresh(RAW_TOKEN))
        .rejects.toThrow('Refresh token reuse detected — session revoked');

      // Verify family revocation was attempted
      expect(supabase.update).toHaveBeenCalled();
    });

    it('does not leak token values in the reuse error message', async () => {
      jwtService.verify.mockReturnValue({ address: ADDRESS, type: 'refresh' } as any);

      supabase.maybeSingle.mockResolvedValueOnce({
        data: makeTokenRow({ revoked: true }),
        error: null,
      });

      const familyRevokeChain = { eq: jest.fn().mockReturnThis(), then: (r: any) => r({ error: null }) };
      supabase.update.mockReturnValueOnce(familyRevokeChain);

      let thrownError: Error | undefined;
      try {
        await service.refresh(RAW_TOKEN);
      } catch (e) {
        thrownError = e as Error;
      }

      expect(thrownError).toBeDefined();
      // Error message must not contain the raw token or its hash
      expect(thrownError!.message).not.toContain(RAW_TOKEN);
      expect(thrownError!.message).not.toContain(TOKEN_HASH);
    });
  });

  // -------------------------------------------------------------------------
  // refresh — revoked / expired / unknown token
  // -------------------------------------------------------------------------

  describe('refresh — invalid token states', () => {
    it('throws when token is not found in DB', async () => {
      jwtService.verify.mockReturnValue({ address: ADDRESS, type: 'refresh' } as any);
      supabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

      await expect(service.refresh(RAW_TOKEN)).rejects.toThrow('Refresh token not found');
    });

    it('throws when token is expired', async () => {
      jwtService.verify.mockReturnValue({ address: ADDRESS, type: 'refresh' } as any);
      supabase.maybeSingle.mockResolvedValueOnce({
        data: makeTokenRow({ expires_at: new Date(Date.now() - 1000).toISOString() }),
        error: null,
      });

      await expect(service.refresh(RAW_TOKEN)).rejects.toThrow('Refresh token expired');
    });

    it('throws when JWT signature is invalid', async () => {
      jwtService.verify.mockImplementationOnce(() => { throw new Error('jwt malformed'); });

      await expect(service.refresh(RAW_TOKEN)).rejects.toThrow('Invalid refresh token');
    });

    it('throws when token payload type is not refresh', async () => {
      jwtService.verify.mockReturnValue({ address: ADDRESS, type: 'access' } as any);

      await expect(service.refresh(RAW_TOKEN)).rejects.toThrow('Invalid refresh token payload');
    });
  });

  // -------------------------------------------------------------------------
  // signOut
  // -------------------------------------------------------------------------

  describe('signOut', () => {
    it('revokes the token family on sign-out', async () => {
      jwtService.verify.mockReturnValue({ address: ADDRESS, type: 'refresh' } as any);

      supabase.maybeSingle.mockResolvedValueOnce({
        data: { family_id: FAMILY_ID },
        error: null,
      });

      const familyRevokeChain = { eq: jest.fn().mockReturnThis(), then: (r: any) => r({ error: null }) };
      supabase.update.mockReturnValueOnce(familyRevokeChain);

      await expect(service.signOut(RAW_TOKEN)).resolves.toBeUndefined();
      expect(supabase.update).toHaveBeenCalled();
    });

    it('is idempotent when token is not found', async () => {
      jwtService.verify.mockReturnValue({ address: ADDRESS, type: 'refresh' } as any);
      supabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

      // Should not throw
      await expect(service.signOut(RAW_TOKEN)).resolves.toBeUndefined();
    });

    it('still attempts revocation when JWT is expired', async () => {
      // JWT verify throws (expired token) but we still look up by hash
      jwtService.verify.mockImplementationOnce(() => { throw new Error('jwt expired'); });

      supabase.maybeSingle.mockResolvedValueOnce({
        data: { family_id: FAMILY_ID },
        error: null,
      });

      const familyRevokeChain = { eq: jest.fn().mockReturnThis(), then: (r: any) => r({ error: null }) };
      supabase.update.mockReturnValueOnce(familyRevokeChain);

      await expect(service.signOut(RAW_TOKEN)).resolves.toBeUndefined();
      expect(supabase.update).toHaveBeenCalled();
    });

    it('throws when no token is provided', async () => {
      await expect(service.signOut('')).rejects.toThrow('Refresh token required');
    });
  });

  // -------------------------------------------------------------------------
  // Token value logging safeguard
  // -------------------------------------------------------------------------

  describe('sensitive value logging', () => {
    it('does not log raw token values on invalid token error', async () => {
      const logSpy = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => {});

      jwtService.verify.mockReturnValue({ address: ADDRESS, type: 'refresh' } as any);
      supabase.maybeSingle.mockResolvedValueOnce({
        data: makeTokenRow({ revoked: true }),
        error: null,
      });
      const familyRevokeChain = { eq: jest.fn().mockReturnThis(), then: (r: any) => r({ error: null }) };
      supabase.update.mockReturnValueOnce(familyRevokeChain);

      try { await service.refresh(RAW_TOKEN); } catch { /* expected */ }

      for (const call of logSpy.mock.calls) {
        const logLine = String(call[0]);
        expect(logLine).not.toContain(RAW_TOKEN);
        expect(logLine).not.toContain(TOKEN_HASH);
      }
    });
  });
});
