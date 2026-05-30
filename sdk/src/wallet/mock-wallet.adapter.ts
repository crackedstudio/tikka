import {
  WalletAdapter,
  WalletAdapterOptions,
  WalletName,
  SignTransactionResult,
  WalletCapabilities,
} from './wallet.interface';

/**
 * Configuration options for the mock wallet adapter.
 * @category Wallet
 *
 * Useful for testing and development scenarios where you need
 * deterministic wallet behavior without requiring a real extension.
 *
 * @example
 * ```ts
 * const adapter = new MockWalletAdapter({
 *   publicKey: 'GBJCHUKZMTFSLOMNC7P4TS4VJJBTCYL3OIDJGA4J34XIXDLMTJ5YVBQ',
 *   delayMs: 100,  // Simulate network latency
 * });
 * ```
 */
export interface MockWalletOptions extends WalletAdapterOptions {
  /** Artificial delay in milliseconds to simulate network latency */
  delayMs?: number;
  /** Public key to return from getPublicKey() */
  publicKey?: string;
  /** If true, getPublicKey() will throw an error */
  failGetPublicKey?: boolean;
  /** If true, signTransaction() will throw an error */
  failSignTransaction?: boolean;
  /** If true, signMessage() will throw an error */
  failSignMessage?: boolean;
}

/**
 * Mock wallet adapter for testing and development.
 * @category Wallet
 * @remarks
 * Provides deterministic responses without requiring a real browser extension.
 * Useful for unit tests, integration tests, and local development.
 *
 * Features:
 * - Configurable public key
 * - Simulated response delays
 * - Configurable failures for testing error handling
 * - No external dependencies
 *
 * @example
 * ```ts
 * // Basic usage
 * const wallet = new MockWalletAdapter({
 *   publicKey: 'GBIQ4VH3TRO5A72SCCSHV5QZJVUHMFAZVD5K4PIWL3RBQFKBDLPHJ36'
 * });
 *
 * // Simulate failures for testing
 * const walletThatFails = new MockWalletAdapter({
 *   failSignTransaction: true
 * });
 *
 * // Test error handling
 * try {
 *   const signed = await walletThatFails.signTransaction(xdr);
 * } catch (err) {
 *   console.log('Caught expected error:', err.message);
 * }
 * ```
 */
export class MockWalletAdapter extends WalletAdapter {
  readonly name = WalletName.Mock;

  private readonly mockOptions: MockWalletOptions;

  constructor(options: MockWalletOptions = {}) {
    super(options);
    this.mockOptions = options;
  }

  /**
   * Mock wallet is always available.
   */
  isAvailable(): boolean {
    return true;
  }

  /**
   * Returns the configured public key or a default mock key.
   * Will throw if `failGetPublicKey` option is true.
   */
  async getPublicKey(): Promise<string> {
    await this.wait();
    if (this.mockOptions.failGetPublicKey) {
      throw new Error('MockWalletAdapter: getPublicKey failure');
    }
    return this.mockOptions.publicKey ?? 'GDJMOCKWALLET1234567890ABCDEFMOCKPUBLICKEY';
  }

  /**
   * Returns a signed XDR prefixed with 'mock-signed:'.
   * Will throw if `failSignTransaction` option is true.
   */
  async signTransaction(xdr: string): Promise<SignTransactionResult> {
    await this.wait();
    if (this.mockOptions.failSignTransaction) {
      throw new Error('MockWalletAdapter: signTransaction failure');
    }
    return { signedXdr: `mock-signed:${xdr}` };
  }

  /**
   * Returns a mock signature prefixed with 'mock-signature:'.
   * Will throw if `failSignMessage` option is true.
   */
  override async signMessage(message: string): Promise<string> {
    await this.wait();
    if (this.mockOptions.failSignMessage) {
      throw new Error('MockWalletAdapter: signMessage failure');
    }
    return `mock-signature:${message}`;
  }

  /**
   * Returns mock network (always returns configured network or undefined)
   */
  override async getNetwork(): Promise<string | undefined> {
    await this.wait();
    return this.mockOptions.networkPassphrase;
  }

  /**
   * Returns the capabilities supported by the mock adapter.
   * Mock adapter supports all capabilities for testing.
   */
  getCapabilities(): WalletCapabilities {
    return {
      supportsGetPublicKey: true,
      supportsSignTransaction: true,
      supportsSignMessage: true,
      supportsGetNetwork: true,
    };
  }

  private async wait() {
    if (!this.mockOptions.delayMs) return;
    await new Promise((resolve) => setTimeout(resolve, this.mockOptions.delayMs));
  }
}

