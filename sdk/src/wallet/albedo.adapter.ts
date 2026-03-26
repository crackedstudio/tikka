import { WalletAdapter } from './wallet.adapter';

export class AlbedoAdapter extends WalletAdapter {
  isAvailable(): boolean {
    return true; // Web-based
  }
}
