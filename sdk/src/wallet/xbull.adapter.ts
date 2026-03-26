import { WalletAdapter } from './wallet.adapter';

export class XBullAdapter extends WalletAdapter {
  isAvailable(): boolean {
    return typeof window !== 'undefined' && (window as any).xBullSDK;
  }
}
