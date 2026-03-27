import { MockWalletAdapter } from './mock-wallet.adapter';

describe('MockWalletAdapter', () => {
  it('returns configurable public key and signed payload', async () => {
    const adapter = new MockWalletAdapter({ publicKey: 'GCKEY', delayMs: 1 });
    await expect(adapter.getPublicKey()).resolves.toBe('GCKEY');
    await expect(adapter.signTransaction('tx-xdr')).resolves.toEqual({
      signedXdr: 'mock-signed:tx-xdr',
    });
  });

  it('can simulate failures for UI testing', async () => {
    const adapter = new MockWalletAdapter({ failSignTransaction: true });
    await expect(adapter.signTransaction('tx-xdr')).rejects.toThrow('MockWalletAdapter: signTransaction failure');
  });
});

