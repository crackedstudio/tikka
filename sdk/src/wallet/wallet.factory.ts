import { FreighterAdapter } from './freighter.adapter';
import { XBullAdapter } from './xbull.adapter';
import { AlbedoAdapter } from './albedo.adapter';
import { WalletAdapter, WalletAdapterOptions, WalletName } from './wallet.interface';
import { TikkaSdkError, TikkaSdkErrorCode } from '../utils/errors';

/**
 * WalletAdapterFactory
 *
 * Creates the correct WalletAdapter by wallet name, or auto-detects the
 * first available wallet in the current browser environment.
 *
 * ## Select by name
 * ```ts
 * const adapter = WalletAdapterFactory.create(WalletName.Freighter, {
 *   networkPassphrase: Networks.TESTNET,
 * });
 * ```
 *
 * ## Auto-detect (recommended for "Connect Wallet" buttons)
 * ```ts
 * const adapter = WalletAdapterFactory.autoDetect({
 *   networkPassphrase: Networks.TESTNET,
 * });
 * ```
 *
 * ## Supported wallets
 * | Wallet    | Type            | isAvailable() check              |
 * |-----------|-----------------|----------------------------------|
 * | Freighter | Extension       | window.freighter present         |
 * | xBull     | Extension + PWA | window.xBullSDK present          |
 * | Albedo    | Web popup       | Always true in browser           |
 *
 * Auto-detect priority: Freighter → xBull → Albedo
 */
export class WalletAdapterFactory {
  /**
   * Create a wallet adapter by name.
   */
  static create(
    wallet: WalletName,
    options: WalletAdapterOptions = {},
  ): WalletAdapter {
    switch (wallet) {
      case WalletName.Freighter:
        return new FreighterAdapter(options);
      case WalletName.XBull:
        return new XBullAdapter(options);
      case WalletName.Albedo:
        return new AlbedoAdapter(options);
      default:
        throw new TikkaSdkError(
          TikkaSdkErrorCode.Unknown,
          `Unsupported wallet: "${wallet}". Supported: ${Object.values(WalletName).join(', ')}`,
        );
    }
  }

  /**
   * Auto-detect the first available wallet.
   * Priority: Freighter → xBull → Albedo
   */
  static autoDetect(options: WalletAdapterOptions = {}): WalletAdapter | null {
    const candidates: WalletAdapter[] = [
      new FreighterAdapter(options),
      new XBullAdapter(options),
      new AlbedoAdapter(options),
    ];

    return candidates.find((adapter) => adapter.isAvailable()) ?? null;
  }

  /**
   * Returns all available wallets in the current environment.
   */
  static getAvailable(options: WalletAdapterOptions = {}): WalletAdapter[] {
    const all: WalletAdapter[] = [
      new FreighterAdapter(options),
      new XBullAdapter(options),
      new AlbedoAdapter(options),
    ];
    return all.filter((adapter) => adapter.isAvailable());
  }
}
