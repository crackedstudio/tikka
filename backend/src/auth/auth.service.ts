import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import { SiwsService } from './siws.service';

/** In-memory nonce store (use Redis in production for multi-instance). */
const nonces = new Map<
  string,
  { nonce: string; issuedAt: string; expiresAt: number }
>();

const NONCE_TTL_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly siwsService: SiwsService,
  ) {}

  /**
   * Generate nonce for SIWS.
   * Returns nonce, expiresAt, and issuedAt. Client must include issuedAt in the message they sign.
   */
  getNonce(address: string): {
    nonce: string;
    expiresAt: string;
    issuedAt: string;
    message: string;
  } {
    const nonce = randomBytes(16).toString('hex');
    const issuedAt = new Date().toISOString();
    const expiresAt = Date.now() + NONCE_TTL_MS;
    const message = this.siwsService.buildMessage(address, nonce, issuedAt);

    nonces.set(address, { nonce, issuedAt, expiresAt });
    return {
      nonce,
      expiresAt: new Date(expiresAt).toISOString(),
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

    const messageIssuedAt = issuedAt ?? stored.issuedAt;
    const message = this.siwsService.buildMessage(
      address,
      nonce,
      messageIssuedAt,
    );

    if (!signature || !this.siwsService.verify(address, message, signature)) {
      throw new Error('Invalid signature');
    }

    const payload = { address };
    const accessToken = this.jwtService.sign(payload);
    return { accessToken };
  }
}
