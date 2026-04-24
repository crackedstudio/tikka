import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Keypair } from 'stellar-sdk';

/**
 * KeyService — manages the oracle's Ed25519 keypair.
 * Responsibilities:
 *  - Securely load the oracle private key from environment/config.
 *  - Provide the public key for contract verification.
 *  - Provide signing capabilities for VRF and transaction submission.
 */
@Injectable()
export class KeyService implements OnModuleInit {
  private readonly logger = new Logger(KeyService.name);
  private keypair: Keypair;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.loadKeypair();
  }

  /**
   * Loads the oracle keypair from the ORACLE_PRIVATE_KEY environment variable.
   * Expects a Stellar secret key (S...).
   */
  private loadKeypair() {
    const secret = this.configService.get<string>('ORACLE_PRIVATE_KEY');

    if (!secret) {
      this.logger.error('ORACLE_PRIVATE_KEY is not defined in the environment');
      throw new Error('ORACLE_PRIVATE_KEY must be defined');
    }

    try {
      this.keypair = Keypair.fromSecret(secret);
      this.logger.log(`Oracle keypair loaded for address: ${this.keypair.publicKey()}`);
    } catch (error) {
      this.logger.error(`Failed to load oracle keypair: ${error.message}`);
      throw new Error('Invalid ORACLE_PRIVATE_KEY format');
    }
  }

  /**
   * Returns the oracle's public key as a string.
   */
  getPublicKey(): string {
    return this.keypair.publicKey();
  }

  /**
   * Returns the raw public key bytes (32 bytes).
   */
  getPublicKeyBuffer(): Buffer {
    return this.keypair.rawPublicKey();
  }

  /**
   * Returns the raw secret key bytes (32 bytes).
   */
  getSecretBuffer(): Buffer {
    return this.keypair.rawSecretKey();
  }

  /**
   * Signs a buffer using the oracle's private key.
   * @param data The data to sign
   * @returns 64-byte Ed25519 signature
   */
  sign(data: Buffer): Buffer {
    return this.keypair.sign(data);
  }
}
