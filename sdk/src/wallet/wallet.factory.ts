import { XBullAdapter } from './xbull.adapter';
import { AlbedoAdapter } from './albedo.adapter';
import { WalletAdapter, WalletAdapterOptions, WalletName } from './wallet.adapter';
import { TikkaSdkError, TikkaSdkErrorCode } from '../utils/errors';

/**
 * WalletAdapterFactory
 *
 * Creates the correct WalletAdapter by wallet name, or auto-detects the
 * first available wallet in the current browser environment.
 *
 * ## Select by name (recommended for explicit wallet pickers)
 * ```ts
 * const adapter = WalletAdapterFactory.create(WalletName.XBull, {
 *   networkPassphrase: Networks.TESTNET,
 * });
 * ```
 *
 * ## Auto-detect (recommended for "Connect Wallet" buttons)
 * ```ts
 * const adapter = WalletAdapterFactory.autoDetect({
 *   networkPassphrase: Networks.TESTNET,
 * });
 * if (!adapter) throw new Error('No supported wallet found. Please install xBull or Albedo.');
 * ```
 *
 * ## Supported wallets
 * | Wallet   | Type            | isAvailable() check              |
 * |----------|-----------------|----------------------------------|
 * | xBull    | Extension + PWA | window.xBullSDK present          |
 * | Albedo   | Web popup       | Always true in browser           |
 *
 * Auto-detect priority: xBull → Albedo
 * (Extension wallets are preferred over web-based wallets)
 */
export class WalletAdapterFactory {
  /**
   * Create a wallet adapter by name.
   *
   * @param wallet  WalletName enum value
   * @param options Adapter options (networkPassphrase etc.)
   * @throws TikkaSdkError(Unknown) for unsupported wallet names
   */
  static create(
    wallet: WalletName,
    options: WalletAdapterOptions = {},
  ): WalletAdapter {
    switch (wallet) {
      case WalletName.XBull:
        return new XBullAdapter(options);
      case WalletName.Albedo:
        return new AlbedoAdapter(options);
      default:
        throw new TikkaSdkError(
          TikkaSdkErrorCode.Unknown,
          `Unsupported wallet: "${wallet}". Supported wallets: ${Object.values(WalletName).join(', ')}`,
        );
    }
  }

  /**
   * Auto-detect the first available wallet in the current environment.
   * Priority order: xBull → Albedo
   *
   * @param options Adapter options (networkPassphrase etc.)
   * @returns       A WalletAdapter instance, or null if none are available
   */
  static autoDetect(options: WalletAdapterOptions = {}): WalletAdapter | null {
    const candidates: WalletAdapter[] = [
      new XBullAdapter(options),
      new AlbedoAdapter(options),
    ];

    return candidates.find((adapter) => adapter.isAvailable()) ?? null;
  }

  /**
   * Returns a list of all available wallets in the current environment.
   * Useful for building a wallet selection UI.
   *
   * @param options Adapter options (networkPassphrase etc.)
   * @returns       Array of available WalletAdapter instances
   */
  static getAvailable(options: WalletAdapterOptions = {}): WalletAdapter[] {
    const all: WalletAdapter[] = [
      new XBullAdapter(options),
      new AlbedoAdapter(options),
    ];
    return all.filter((adapter) => adapter.isAvailable());
  }
}
