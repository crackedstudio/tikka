import { Keypair, Networks, TransactionBuilder } from '@stellar/stellar-sdk';
import {
  buildUnsignedOfflineTransaction,
  inspectOfflineSignature,
  signTransactionOffline,
  verifyOfflineSignature,
} from './offline-signing';
import {
  EXPIRED_TESTNET,
  TESTNET_KEY_PUBLIC,
  TESTNET_KEY_SECRET,
  VALID_MAINNET,
  VALID_TESTNET,
} from './__fixtures__/offline-signing.fixtures';

/** Hex hash the raw SDK computes for an envelope on a given network. */
function hashOf(xdr: string, networkPassphrase: string): string {
  return TransactionBuilder.fromXDR(xdr, networkPassphrase).hash().toString('hex');
}

describe('offline signing helpers', () => {
  it('builds, serializes, signs, deserializes, and verifies an offline transaction', () => {
    const sourceKeypair = Keypair.random();
    const signerKeypair = Keypair.random();

    const unsignedXdr = buildUnsignedOfflineTransaction(
      sourceKeypair.publicKey(),
      Networks.TESTNET,
    );

    const signedXdr = signTransactionOffline(unsignedXdr, signerKeypair.secret(), Networks.TESTNET);

    expect(unsignedXdr).toBeTruthy();
    expect(signedXdr).not.toEqual(unsignedXdr);
    expect(verifyOfflineSignature(signedXdr, signerKeypair.publicKey(), Networks.TESTNET)).toBe(
      true,
    );
  });
});

describe('offline signing cross-checked against @stellar/stellar-sdk', () => {
  it('produces a signature the raw SDK accepts', () => {
    const signer = Keypair.random();
    const unsignedXdr = buildUnsignedOfflineTransaction(signer.publicKey(), Networks.TESTNET);

    const signedXdr = signTransactionOffline(unsignedXdr, signer.secret(), Networks.TESTNET);

    // Verify with the reference implementation, not the SDK helper.
    const tx = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET);
    const signature = tx.signatures[0]?.signature();
    expect(signature).toBeDefined();
    expect(Keypair.fromPublicKey(signer.publicKey()).verify(tx.hash(), signature!)).toBe(true);
  });

  it('accepts a signature produced by the raw SDK', () => {
    const signer = Keypair.random();
    const unsignedXdr = buildUnsignedOfflineTransaction(signer.publicKey(), Networks.TESTNET);

    const tx = TransactionBuilder.fromXDR(unsignedXdr, Networks.TESTNET);
    tx.sign(signer);

    expect(verifyOfflineSignature(tx.toXDR(), signer.publicKey(), Networks.TESTNET)).toBe(true);
  });
});

describe('known-good offline-signing fixtures', () => {
  it('reproduces the recorded signature deterministically', () => {
    // Ed25519 is deterministic, so re-signing the fixture must reproduce the
    // exact envelope: a change to how the SDK builds or signs breaks this.
    expect(
      signTransactionOffline(VALID_TESTNET.unsignedXdr, TESTNET_KEY_SECRET, Networks.TESTNET),
    ).toBe(VALID_TESTNET.signedXdr);
  });

  it('reproduces the recorded envelope hashes', () => {
    expect(hashOf(VALID_TESTNET.signedXdr, Networks.TESTNET)).toBe(VALID_TESTNET.hash);
    expect(hashOf(VALID_MAINNET.signedXdr, Networks.PUBLIC)).toBe(VALID_MAINNET.hash);
    expect(hashOf(EXPIRED_TESTNET.signedXdr, Networks.TESTNET)).toBe(EXPIRED_TESTNET.hash);
  });

  it('verifies the unexpired fixtures and rejects the expired one', () => {
    expect(
      verifyOfflineSignature(VALID_TESTNET.signedXdr, TESTNET_KEY_PUBLIC, Networks.TESTNET),
    ).toBe(true);
    expect(
      verifyOfflineSignature(VALID_MAINNET.signedXdr, TESTNET_KEY_PUBLIC, Networks.PUBLIC),
    ).toBe(true);
    expect(
      verifyOfflineSignature(EXPIRED_TESTNET.signedXdr, TESTNET_KEY_PUBLIC, Networks.TESTNET),
    ).toBe(false);
  });

  it('reports an expired time bound with a typed reason, using an injectable clock', () => {
    const beforeExpiry = new Date('2000-01-01T00:00:00Z');
    const afterExpiry = new Date('2002-01-01T00:00:00Z');

    expect(
      inspectOfflineSignature(
        EXPIRED_TESTNET.signedXdr,
        TESTNET_KEY_PUBLIC,
        Networks.TESTNET,
        beforeExpiry,
      ),
    ).toEqual({ valid: true });
    expect(
      inspectOfflineSignature(
        EXPIRED_TESTNET.signedXdr,
        TESTNET_KEY_PUBLIC,
        Networks.TESTNET,
        afterExpiry,
      ),
    ).toEqual({ valid: false, reason: 'expired' });
  });
});

describe('the network passphrase is part of the signed payload', () => {
  it('hashes the same envelope differently per network', () => {
    // The envelope bytes do not carry the passphrase…
    expect(VALID_TESTNET.unsignedXdr).toBe(VALID_MAINNET.unsignedXdr);
    // …but the signature hash does, so the same bytes are two different payloads.
    expect(hashOf(VALID_TESTNET.signedXdr, Networks.TESTNET)).toBe(VALID_TESTNET.hash);
    expect(hashOf(VALID_TESTNET.signedXdr, Networks.PUBLIC)).not.toBe(VALID_TESTNET.hash);
  });

  it('cannot replay a testnet signature on mainnet', () => {
    expect(
      verifyOfflineSignature(VALID_TESTNET.signedXdr, TESTNET_KEY_PUBLIC, Networks.PUBLIC),
    ).toBe(false);
    expect(
      verifyOfflineSignature(VALID_MAINNET.signedXdr, TESTNET_KEY_PUBLIC, Networks.TESTNET),
    ).toBe(false);
    expect(
      inspectOfflineSignature(VALID_TESTNET.signedXdr, TESTNET_KEY_PUBLIC, Networks.PUBLIC),
    ).toEqual({ valid: false, reason: 'signature-mismatch' });
  });
});

describe('offline signature rejection cases', () => {
  it('rejects tampered XDR without throwing', () => {
    const tampered = `${VALID_TESTNET.signedXdr.slice(0, -4)}AAAA`;

    expect(() =>
      verifyOfflineSignature(tampered, TESTNET_KEY_PUBLIC, Networks.TESTNET),
    ).not.toThrow();
    expect(verifyOfflineSignature(tampered, TESTNET_KEY_PUBLIC, Networks.TESTNET)).toBe(false);

    const inspection = inspectOfflineSignature(tampered, TESTNET_KEY_PUBLIC, Networks.TESTNET);
    expect(inspection.valid).toBe(false);
    expect(['malformed-xdr', 'signature-mismatch']).toContain(inspection.reason);
  });

  it('rejects input that is not an envelope at all', () => {
    expect(verifyOfflineSignature('not-a-valid-xdr', TESTNET_KEY_PUBLIC, Networks.TESTNET)).toBe(
      false,
    );
    expect(
      inspectOfflineSignature('not-a-valid-xdr', TESTNET_KEY_PUBLIC, Networks.TESTNET),
    ).toEqual({ valid: false, reason: 'malformed-xdr' });
  });

  it('reports an unsigned envelope as missing a signature', () => {
    expect(
      inspectOfflineSignature(VALID_TESTNET.unsignedXdr, TESTNET_KEY_PUBLIC, Networks.TESTNET),
    ).toEqual({ valid: false, reason: 'no-signature' });
  });

  it('rejects a signature from an unrelated key', () => {
    const other = Keypair.random();

    expect(
      inspectOfflineSignature(VALID_TESTNET.signedXdr, other.publicKey(), Networks.TESTNET),
    ).toEqual({ valid: false, reason: 'signature-mismatch' });
  });

  it('reports an invalid signer key instead of throwing', () => {
    expect(
      inspectOfflineSignature(VALID_TESTNET.signedXdr, 'not-a-public-key', Networks.TESTNET),
    ).toEqual({ valid: false, reason: 'invalid-public-key' });
  });
});
