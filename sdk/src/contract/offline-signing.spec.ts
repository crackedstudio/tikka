import { Keypair, Networks } from '@stellar/stellar-sdk';
import {
  buildUnsignedOfflineTransaction,
  signTransactionOffline,
  verifyOfflineSignature,
} from './offline-signing';

describe('offline signing helpers', () => {
  it('builds, serializes, signs, deserializes, and verifies an offline transaction', () => {
    const sourceKeypair = Keypair.random();
    const signerKeypair = Keypair.random();

    const unsignedXdr = buildUnsignedOfflineTransaction(
      sourceKeypair.publicKey(),
      Networks.TESTNET,
    );

    const signedXdr = signTransactionOffline(
      unsignedXdr,
      signerKeypair.secret(),
      Networks.TESTNET,
    );

    expect(unsignedXdr).toBeTruthy();
    expect(signedXdr).not.toEqual(unsignedXdr);
    expect(
      verifyOfflineSignature(signedXdr, signerKeypair.publicKey(), Networks.TESTNET),
    ).toBe(true);
  });
});
