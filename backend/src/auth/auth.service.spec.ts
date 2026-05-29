import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { SiwsService } from './siws.service';
import { SUPABASE_CLIENT } from '../services/supabase.provider';
import { env } from '../config/env.config';

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: jest.Mocked<JwtService>;
  let siwsService: jest.Mocked<SiwsService>;
  let supabaseClient: any;

  beforeEach(async () => {
    jwtService = {
      sign: jest.fn().mockReturnValue('mock-token'),
      verify: jest.fn(),
    } as any;

    siwsService = {
      buildMessage: jest.fn().mockReturnValue('mock-message'),
      verify: jest.fn().mockReturnValue(true),
    } as any;

    supabaseClient = {
      from: jest.fn().mockReturnThis(),
      insert: jest.fn().mockResolvedValue({ error: null }),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn(),
      update: jest.fn().mockReturnThis(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: jwtService },
        { provide: SiwsService, useValue: siwsService },
        { provide: SUPABASE_CLIENT, useValue: supabaseClient },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('getNonce', () => {
    it('should generate and store a nonce', async () => {
      const address = 'GABC123';
      const result = await service.getNonce(address);

      expect(result).toHaveProperty('nonce');
      expect(result).toHaveProperty('expiresAt');
      expect(result).toHaveProperty('issuedAt');
      expect(supabaseClient.from).toHaveBeenCalledWith('siws_nonces');
      expect(supabaseClient.insert).toHaveBeenCalled();
    });
  });

  describe('verify', () => {
    const address = 'GABC123';
    const nonce = 'mock-nonce';
    const signature = 'mock-signature';
    const issuedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 300000).toISOString();

    it('should verify a valid signature and mark nonce as consumed', async () => {
      supabaseClient.maybeSingle.mockResolvedValue({
        data: { id: 1, address, nonce, issued_at: issuedAt, expires_at: expiresAt, consumed: false },
        error: null,
      });
      supabaseClient.update.mockResolvedValue({ error: null });

      const result = await service.verify(address, signature, nonce, issuedAt);

      expect(result).toHaveProperty('accessToken');
      expect(supabaseClient.update).toHaveBeenCalledWith({ consumed: true });
    });

    it('should throw error if nonce is already consumed', async () => {
      // maybeSingle returns null if no match (due to .eq('consumed', false))
      supabaseClient.maybeSingle.mockResolvedValue({ data: null, error: null });

      await expect(service.verify(address, signature, nonce, issuedAt))
        .rejects.toThrow('Invalid or used nonce');
    });

    it('should throw error if nonce is expired (absolute)', async () => {
      const pastExpiresAt = new Date(Date.now() - 1000).toISOString();
      supabaseClient.maybeSingle.mockResolvedValue({
        data: { id: 1, address, nonce, issued_at: issuedAt, expires_at: pastExpiresAt, consumed: false },
        error: null,
      });

      await expect(service.verify(address, signature, nonce, issuedAt))
        .rejects.toThrow('Nonce expired');
    });

    it('should throw error if nonce is expired (relative TTL)', async () => {
      const oldIssuedAt = new Date(Date.now() - (env.siws.nonceTtlSeconds + 10) * 1000).toISOString();
      supabaseClient.maybeSingle.mockResolvedValue({
        data: { id: 1, address, nonce, issued_at: oldIssuedAt, expires_at: expiresAt, consumed: false },
        error: null,
      });

      await expect(service.verify(address, signature, nonce, oldIssuedAt))
        .rejects.toThrow('Nonce expired');
    });

    it('should throw error if signature is invalid', async () => {
      supabaseClient.maybeSingle.mockResolvedValue({
        data: { id: 1, address, nonce, issued_at: issuedAt, expires_at: expiresAt, consumed: false },
        error: null,
      });
      siwsService.verify.mockReturnValue(false);

      await expect(service.verify(address, signature, nonce, issuedAt))
        .rejects.toThrow('Invalid signature');
    });
  });
});
