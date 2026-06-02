import { Injectable, Inject, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, createHmac } from 'crypto';
import { SiwsService } from './siws.service';
import { SUPABASE_CLIENT } from '../services/supabase.provider';
import { SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env.config';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly NONCE_TTL_MS = env.siws.nonceTtlSeconds * 1000;

  constructor(
    private readonly jwtService: JwtService,
    private readonly siwsService: SiwsService,
    @Inject(SUPABASE_CLIENT) private readonly client: SupabaseClient,
  ) {}

  // ---------------------------------------------------------------------------
  // Nonce
  // ---------------------------------------------------------------------------

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
    await this.cleanupExpiredNonces();

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

    return { nonce, expiresAt, issuedAt, message };
  }

  // ---------------------------------------------------------------------------
  // Verify (SIWS sign-in)
  // ---------------------------------------------------------------------------

  /**
   * Verify SIWS signature against the SIWS message and issue JWT.
   */
  async verify(
    address: string,
    signature: string,
    nonce: string,
    issuedAt?: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    await this.cleanupExpiredNonces();

    const { data: stored, error } = await this.client
      .from('siws_nonces')
      .select('*')
      .eq('address', address)
      .eq('nonce', nonce)
      .eq('consumed', false)
      .limit(1)
      .maybeSingle();

    if (error || !stored) {
      this.logger.warn(
        `SIWS verification failed for address=${address} nonce=${nonce} reason=missing-or-consumed`,
      );
      // Audit to Sentry with a hashed wallet identifier (never send raw address)
      try {
        const walletHash = createHmac('sha256', env.auth.jwtSecret)
          .update(String(address).trim().toLowerCase())
          .digest('hex')
          .slice(0, 16);
        Sentry.withScope((scope) => {
          scope.setTag('event', 'siws_nonce_failure');
          scope.setTag('reason', 'missing-or-consumed');
          scope.setTag('wallet_hash', walletHash);
          Sentry.captureException(new Error('SIWS nonce failure'));
        });
      } catch {
        /* best-effort, never throw from logging path */
      }
      throw new Error('Invalid or expired nonce');
    }

    if (new Date() > new Date(stored.expires_at)) {
      this.logger.warn(
        `SIWS verification failed for address=${address} nonce=${nonce} reason=expired`,
      );
      try {
        const walletHash = createHmac('sha256', env.auth.jwtSecret)
          .update(String(address).trim().toLowerCase())
          .digest('hex')
          .slice(0, 16);
        Sentry.withScope((scope) => {
          scope.setTag('event', 'siws_nonce_failure');
          scope.setTag('reason', 'expired');
          scope.setTag('wallet_hash', walletHash);
          Sentry.captureException(new Error('SIWS nonce expired'));
        });
      } catch {
        /* best-effort */
      }
      throw new Error('Nonce expired');
    }

    const messageIssuedAt = issuedAt ?? stored.issued_at;
    const issuedAtDate = new Date(messageIssuedAt);
    const now = new Date();
    const diffSeconds = (now.getTime() - issuedAtDate.getTime()) / 1000;

    if (diffSeconds > env.siws.nonceTtlSeconds || diffSeconds < -60) {
      throw new Error('Nonce expired');
    }

    const message = this.siwsService.buildMessage(address, nonce, messageIssuedAt);

    if (!signature || !this.siwsService.verify(address, message, signature)) {
      this.logger.warn(
        `SIWS verification failed for address=${address} nonce=${nonce} reason=invalid-signature`,
      );
      try {
        const walletHash = createHmac('sha256', env.auth.jwtSecret)
          .update(String(address).trim().toLowerCase())
          .digest('hex')
          .slice(0, 16);
        Sentry.withScope((scope) => {
          scope.setTag('event', 'siws_nonce_failure');
          scope.setTag('reason', 'invalid-signature');
          scope.setTag('wallet_hash', walletHash);
          Sentry.captureException(new Error('SIWS invalid signature'));
        });
      } catch {
        /* best-effort */
      }
      throw new Error('Invalid signature');
    }

    const { error: updateError } = await this.client
      .from('siws_nonces')
      .update({ consumed: true })
      .eq('id', stored.id);

    if (updateError) {
      throw new Error('Failed to invalidate nonce');
    }

    return this.issueTokens(address);
  }

  // ---------------------------------------------------------------------------
  // Token issuance
  // ---------------------------------------------------------------------------

  async issueTokens(
    address: string,
    familyId?: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = this.signAccessToken(address);
    const refreshToken = this.signRefreshToken(address);

    const now = new Date();
    const match = String(env.jwt.refreshExpiresIn).match(/^(\d+)d$/);
    const expiresAt = new Date(now);
    if (match) {
      expiresAt.setDate(expiresAt.getDate() + parseInt(match[1], 10));
    } else {
      expiresAt.setDate(expiresAt.getDate() + 30);
    }

    const tokenHash = this.hashToken(refreshToken);
    // Use provided familyId (rotation) or generate a new one (fresh login).
    const resolvedFamilyId = familyId ?? randomBytes(16).toString('hex');
    await this.storeRefreshToken(address, tokenHash, expiresAt.toISOString(), resolvedFamilyId);

    return { accessToken, refreshToken };
  }

  // ---------------------------------------------------------------------------
  // Refresh (rotation with reuse detection)
  // ---------------------------------------------------------------------------

  /**
   * Refresh flow: validate provided refresh token, rotate and issue new tokens.
   *
   * Reuse detection: if a superseded (already-rotated) token is presented,
   * the entire token family is revoked to protect against session hijacking.
   */
  async refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    if (!refreshToken) throw new Error('Refresh token required');

    let payload: { address?: string; type?: string };
    try {
      payload = this.jwtService.verify(refreshToken) as typeof payload;
    } catch {
      // Never log the token value itself.
      throw new Error('Invalid refresh token');
    }

    if (payload.type !== 'refresh' || !payload.address) {
      throw new Error('Invalid refresh token payload');
    }

    const tokenHash = this.hashToken(refreshToken);
    const address = payload.address;

    // Look up the token regardless of revocation status so we can detect reuse.
    const { data: tokenRow, error } = await this.client
      .from('refresh_tokens')
      .select('id, revoked, expires_at, family_id')
      .eq('token_hash', tokenHash)
      .limit(1)
      .maybeSingle();

    if (error || !tokenRow) {
      // Token hash not in DB at all — unknown / tampered token.
      throw new Error('Refresh token not found');
    }

    if (tokenRow.revoked) {
      // This token was already superseded. Revoke the entire family to
      // invalidate any tokens the attacker may have obtained.
      this.logger.warn(
        `Refresh token reuse detected for address [REDACTED], family ${tokenRow.family_id}. Revoking family.`,
      );
      await this.revokeFamilyById(tokenRow.family_id);
      throw new Error('Refresh token reuse detected — session revoked');
    }

    if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date()) {
      throw new Error('Refresh token expired');
    }

    // Mark the current token as revoked (superseded) before issuing the next one.
    const nowIso = new Date().toISOString();
    const { error: revokeErr } = await this.client
      .from('refresh_tokens')
      .update({ revoked: true, updated_at: nowIso })
      .eq('id', tokenRow.id);

    if (revokeErr) {
      throw new Error('Failed to rotate refresh token');
    }

    // Issue new tokens in the same family.
    return this.issueTokens(address, tokenRow.family_id);
  }

  // ---------------------------------------------------------------------------
  // Sign-out
  // ---------------------------------------------------------------------------

  /**
   * Revoke all active refresh tokens for the given token's family.
   * Accepts the raw refresh token so the caller doesn't need to track family IDs.
   */
  async signOut(refreshToken: string): Promise<void> {
    if (!refreshToken) throw new Error('Refresh token required');

    let payload: { address?: string; type?: string };
    try {
      payload = this.jwtService.verify(refreshToken) as typeof payload;
    } catch {
      // Expired or invalid — still attempt revocation by hash lookup.
      payload = {};
    }

    const tokenHash = this.hashToken(refreshToken);

    const { data: tokenRow } = await this.client
      .from('refresh_tokens')
      .select('family_id')
      .eq('token_hash', tokenHash)
      .limit(1)
      .maybeSingle();

    if (tokenRow?.family_id) {
      await this.revokeFamilyById(tokenRow.family_id);
    }
    // If the token isn't found we treat sign-out as a no-op (idempotent).
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private signAccessToken(address: string): string {
    return this.jwtService.sign({ address }, { expiresIn: env.jwt.expiresIn });
  }

  private signRefreshToken(address: string): string {
    return this.jwtService.sign(
      { address, type: 'refresh' },
      { expiresIn: env.jwt.refreshExpiresIn },
    );
  }

  /** HMAC-SHA256 hash of the raw token. Never log the input. */
  private hashToken(token: string): string {
    return createHmac('sha256', env.jwt.secret).update(token).digest('hex');
  }

  private async storeRefreshToken(
    userAddress: string,
    tokenHash: string,
    expiresAtIso: string,
    familyId: string,
  ): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await this.client.from('refresh_tokens').insert([
      {
        user_address: userAddress,
        token_hash: tokenHash,
        created_at: now,
        last_used_at: now,
        expires_at: expiresAtIso,
        revoked: false,
        family_id: familyId,
      },
    ]);

    if (error) {
      throw new Error('Failed to persist refresh token');
    }
  }

  /** Revoke every non-revoked token in a family. */
  private async revokeFamilyById(familyId: string): Promise<void> {
    const nowIso = new Date().toISOString();
    const { error } = await this.client
      .from('refresh_tokens')
      .update({ revoked: true, updated_at: nowIso })
      .eq('family_id', familyId)
      .eq('revoked', false);

    if (error) {
      this.logger.error(`Failed to revoke token family ${familyId}: ${error.message}`);
    }
  }

  private async cleanupExpiredNonces(): Promise<void> {
    const nowIso = new Date().toISOString();
    const { error } = await this.client
      .from('siws_nonces')
      .delete()
      .lte('expires_at', nowIso);

    if (error) {
      this.logger.warn(
        `Failed to cleanup expired SIWS nonces: ${error.message}`,
      );
    }
  }
}
