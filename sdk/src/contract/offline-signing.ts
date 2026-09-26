import { Account, Keypair, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk';

/**
 * Reason an offline-signed transaction was rejected.
 *
 * - `malformed-xdr`      — the envelope could not be parsed (tampered/corrupt)
 * - `invalid-public-key` — the expected signer key is not a valid account id
 * - `expired`            — the envelope's `maxTime` time bound is in the past
 * - `no-signature`       — the envelope carries no signatures
 * - `signature-mismatch` — no signature verifies against the expected key
 */
export type OfflineSignatureFailure =
  | 'malformed-xdr'
  | 'invalid-public-key'
  | 'expired'
  | 'no-signature'
  | 'signature-mismatch';

export interface OfflineSignatureInspection {
  valid: boolean;
  reason?: OfflineSignatureFailure;
}

export function buildUnsignedOfflineTransaction(
  sourcePublicKey: string,
  networkPassphrase: string = Networks.TESTNET,
): string {
  const account = new Account(sourcePublicKey, '0');
  const tx = new TransactionBuilder(account, {
    fee: '100',
    networkPassphrase,
  })
    .addOperation(
      Operation.createAccount({
        destination: sourcePublicKey,
        startingBalance: '0',
      }),
    )
    .setTimeout(30)
    .build();

  return tx.toXDR();
}

export function signTransactionOffline(
  unsignedXdr: string,
  secretKey: string,
  networkPassphrase: string = Networks.TESTNET,
): string {
  const tx = TransactionBuilder.fromXDR(unsignedXdr, networkPassphrase);
  const keypair = Keypair.fromSecret(secretKey);
  tx.sign(keypair);
  return tx.toXDR();
}

/**
 * Inspects a signed offline transaction and reports *why* it was rejected.
 *
 * Unlike {@link verifyOfflineSignature}, this never throws: a malformed
 * envelope, a missing signature, a signature from the wrong key, a signature
 * for another network, or an expired time bound all produce a structured
 * result. The `now` argument is injectable so time-bound behaviour is
 * deterministic in tests.
 *
 * This is a module-level helper (not re-exported from the package entry point);
 * `verifyOfflineSignature` remains the public boolean surface.
 */
export function inspectOfflineSignature(
  signedXdr: string,
  publicKey: string,
  networkPassphrase: string = Networks.TESTNET,
  now: Date = new Date(),
): OfflineSignatureInspection {
  let tx: any;
  try {
    tx = TransactionBuilder.fromXDR(signedXdr, networkPassphrase);
    if (!tx || typeof tx.hash !== 'function') {
      return { valid: false, reason: 'malformed-xdr' };
    }
  } catch {
    return { valid: false, reason: 'malformed-xdr' };
  }

  const timeBounds = tx.timeBounds ?? null;
  if (timeBounds) {
    const maxTime = Number(timeBounds.maxTime);
    if (Number.isFinite(maxTime) && maxTime > 0 && maxTime * 1000 <= now.getTime()) {
      return { valid: false, reason: 'expired' };
    }
  }

  const signatures: any[] = tx.signatures ?? [];
  if (signatures.length === 0) {
    return { valid: false, reason: 'no-signature' };
  }

  let keypair: Keypair;
  try {
    keypair = Keypair.fromPublicKey(publicKey);
  } catch {
    return { valid: false, reason: 'invalid-public-key' };
  }

  // The network passphrase is folded into hash() (SHA-256 of the passphrase is
  // the network id), so a signature made for one network cannot verify here
  // while a different passphrase is supplied.
  const hash = tx.hash();
  const valid = signatures.some((entry) => {
    try {
      return keypair.verify(hash, entry.signature());
    } catch {
      return false;
    }
  });

  return valid ? { valid: true } : { valid: false, reason: 'signature-mismatch' };
}

/**
 * Verifies that `publicKey` signed `signedXdr` for `networkPassphrase`.
 *
 * Returns `false` — never throws — for tampered XDR, a wrong network, a missing
 * signature, an unrelated signer key, or a transaction whose time bound has
 * already expired.
 */
export function verifyOfflineSignature(
  signedXdr: string,
  publicKey: string,
  networkPassphrase: string = Networks.TESTNET,
): boolean {
  return inspectOfflineSignature(signedXdr, publicKey, networkPassphrase).valid;
}
