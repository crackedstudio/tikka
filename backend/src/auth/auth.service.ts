import { Injectable, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, createHmac } from 'crypto';
import { SiwsService } from './siws.service';
import { SUPABASE_CLIENT } from '../services/supabase.provider';
import { SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env.config';

@Injectable()
export class AuthService {
  private readonly NONCE_TTL_MS = env.siws.nonceTtlSeconds * 1000;

  constructor(
    private readonly jwtService: JwtService,
    private readonly siwsService: SiwsService,
    @Inject(SUPABASE_CLIENT) private readonly client: SupabaseClient,
  ) {}

  /**
   * Generate nonce for SIWS.
   * Returns nonce, expiresAt, and issuedAt. Client must include issuedAt in the message they sign.
   */
  async getNonce(address: string): Promise<{
    nonce: string;
    expiresAt: string;
    issuedAt: string;
    message: string;
  }> {
    const nonce = randomBytes(16).toString('hex');
    const issuedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + this.NONCE_TTL_MS).toISOString();
    const message = this.siwsService.buildMessage(address, nonce, issuedAt);

    const { error } = await this.client.from('siws_nonces').insert([
      {
        address,
        nonce,
        issued_at: issuedAt,
        expires_at: expiresAt,
        consumed: false,
      },
    ]);

    if (error) {
      throw new Error('Failed to store nonce');
    }

    return {
      nonce,
      expiresAt,
      issuedAt,
      message,
    };
  }

  /**
   * Verify SIWS signature against the SIWS message and issue JWT.
   */
  async verify(
    address: string,
    signature: string,
    nonce: string,
    issuedAt?: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const stored = nonces.get(address);
    if (!stored || stored.nonce !== nonce) {
      throw new Error('Invalid or expired nonce');
    }

    if (new Date() > new Date(stored.expires_at)) {
      throw new Error('Nonce expired');
    }

    const messageIssuedAt = issuedAt ?? stored.issued_at;
    const issuedAtDate = new Date(messageIssuedAt);
    const now = new Date();
    const diffSeconds = (now.getTime() - issuedAtDate.getTime()) / 1000;

    if (diffSeconds > env.siws.nonceTtlSeconds || diffSeconds < -60) {
      throw new Error('Nonce expired');
    }

    const message = this.siwsService.buildMessage(
      address,
      nonce,
      messageIssuedAt,
    );

    if (!signature || !this.siwsService.verify(address, message, signature)) {
      throw new Error('Invalid signature');
    }

    const { error: updateError } = await this.client
      .from('siws_nonces')
      .update({ consumed: true })
      .eq('id', stored.id);

    if (updateError) {
      throw new Error('Failed to invalidate nonce');
    }

    // issue both access + refresh tokens and persist refresh token hash
    return await this.issueTokens(address);
  }

  private signAccessToken(address: string) {
    const payload = { address };
    return this.jwtService.sign(payload, { expiresIn: env.jwt.expiresIn });
  }

  private signRefreshToken(address: string) {
    const payload = { address, type: 'refresh' };
    return this.jwtService.sign(payload, {
      expiresIn: env.jwt.refreshExpiresIn,
    });
  }

  private hashToken(token: string) {
    return createHmac('sha256', env.jwt.secret).update(token).digest('hex');
  }

  private async storeRefreshHash(
    userAddress: string,
    tokenHash: string,
    expiresAtIso: string,
  ) {
    // Upsert a refresh token row: allow multiple active tokens per user if desired.
    const { error } = await this.client.from('refresh_tokens').insert(
      [
        {
          user_address: userAddress,
          token_hash: tokenHash,
          created_at: new Date().toISOString(),
          last_used_at: new Date().toISOString(),
          expires_at: expiresAtIso,
          revoked: false,
        },
      ]
    );

    if (error) {
      throw new Error('Failed to persist refresh token');
    }
  }

  async issueTokens(address: string): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = this.signAccessToken(address);
    const refreshToken = this.signRefreshToken(address);

    // compute expiry for refresh token record
    const now = new Date();
    // Parse refreshExpiresIn like '30d' or '7d' or seconds; for simplicity support days only
    const match = String(env.jwt.refreshExpiresIn).match(/(\d+)d$/);
    let expiresAt = new Date(now.getTime());
    if (match) {
      expiresAt.setDate(expiresAt.getDate() + parseInt(match[1], 10));
    } else {
      // fallback: 30 days
      expiresAt.setDate(expiresAt.getDate() + 30);
    }

    const tokenHash = this.hashToken(refreshToken);
    await this.storeRefreshHash(address, tokenHash, expiresAt.toISOString());

    return { accessToken, refreshToken };
  }

  /**
   * Refresh flow: validate provided refresh token, rotate and issue new tokens.
   */
  async refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    if (!refreshToken) throw new Error('refresh token required');

    // verify token signature and expiry
    let payload: any;
    try {
      payload = this.jwtService.verify(refreshToken);
    } catch (err) {
      throw new Error('Invalid refresh token');
    }

    if (payload.type !== 'refresh' || !payload.address) {
      throw new Error('Invalid refresh token payload');
    }

    const tokenHash = this.hashToken(refreshToken);

    // lookup token hash in DB
    const { data, error } = await this.client
      .from('refresh_tokens')
      .select('*')
      .eq('token_hash', tokenHash)
      .eq('revoked', false)
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      throw new Error('Refresh token not found or revoked');
    }

    // optional: check expires_at
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      throw new Error('Refresh token expired');
    }

    // rotate: create new refresh token and replace stored hash
    const address = payload.address as string;
    const newAccess = this.signAccessToken(address);
    const newRefresh = this.signRefreshToken(address);
    const newHash = this.hashToken(newRefresh);

    const nowIso = new Date().toISOString();
    const { error: updateErr } = await this.client
      .from('refresh_tokens')
      .update({ token_hash: newHash, last_used_at: nowIso, updated_at: nowIso })
      .eq('token_hash', tokenHash);

    if (updateErr) {
      throw new Error('Failed to rotate refresh token');
    }

    return { accessToken: newAccess, refreshToken: newRefresh };
  }
}
