import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';

/** In-memory nonce store (use Redis in production for multi-instance). */
const nonces = new Map<string, { nonce: string; expiresAt: number }>();

const NONCE_TTL_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  /** Generate nonce for SIWS. */
  getNonce(address: string): { nonce: string; expiresAt: string } {
    const nonce = randomBytes(16).toString('hex');
    const expiresAt = Date.now() + NONCE_TTL_MS;
    nonces.set(address, { nonce, expiresAt });
    return {
      nonce,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  /**
   * Verify SIWS signature and issue JWT.
   * TODO: Implement real Ed25519 signature verification (Stellar Keypair.verify).
   */
  async verify(
    address: string,
    signature: string,
    nonce: string,
  ): Promise<{ accessToken: string }> {
    const stored = nonces.get(address);
    if (!stored || stored.nonce !== nonce) {
      throw new Error('Invalid or expired nonce');
    }
    if (Date.now() > stored.expiresAt) {
      nonces.delete(address);
      throw new Error('Nonce expired');
    }
    nonces.delete(address);

    // TODO: Verify signature with Stellar Keypair.verify(message, signature)
    if (!signature || signature.length < 10) {
      throw new Error('Invalid signature');
    }

    const payload = { address };
    const accessToken = this.jwtService.sign(payload);
    return { accessToken };
  }
}
