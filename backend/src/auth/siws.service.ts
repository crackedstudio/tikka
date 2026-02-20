import { Injectable } from '@nestjs/common';
import { Keypair } from '@stellar/stellar-sdk';
import { env } from '../config/env.config';

/**
 * SIWS message format (ARCHITECTURE §4):
 * "tikka.io wants you to sign in
 *  Address: G...
 *  Nonce: abc123
 *  Issued At: 2025-02-19T12:00:00.000Z"
 */
export function buildSiwsMessage(
  domain: string,
  address: string,
  nonce: string,
  issuedAt: string,
): string {
  return [
    `${domain} wants you to sign in`,
    `Address: ${address}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join('\n');
}

@Injectable()
export class SiwsService {
  private readonly domain: string;

  constructor() {
    this.domain = env.siws.domain;
  }

  /** Build the SIWS message the client must sign. */
  buildMessage(address: string, nonce: string, issuedAt: string): string {
    return buildSiwsMessage(this.domain, address, nonce, issuedAt);
  }

  /**
   * Verify that `signature` (base64) was produced by signing `message` with the key for `address`.
   */
  verify(address: string, message: string, signatureBase64: string): boolean {
    try {
      const keypair = Keypair.fromPublicKey(address);
      const messageBuffer = Buffer.from(message, 'utf8');
      const signatureBuffer = Buffer.from(signatureBase64, 'base64');
      return keypair.verify(messageBuffer, signatureBuffer);
    } catch {
      return false;
    }
  }
}
