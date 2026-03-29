import { randomBytes } from 'crypto';
import {
  Account,
  Keypair,
  Networks,
  Operation,
  StrKey,
  Transaction,
  TransactionBuilder,
} from '@stellar/stellar-sdk';

export interface BuildChallengeOptions {
  serverSecret: string;
  clientAccount: string;
  anchorDomain: string;
  webAuthDomain?: string;
  timeout?: number;
  networkPassphrase?: string;
}

export interface VerifyResponseOptions {
  signedChallenge: string;
  serverAccount: string;
  clientAccount: string;
  anchorDomain: string;
  networkPassphrase?: string;
  now?: number;
  maxChallengeAge?: number;
  nonceValidator?: (nonceBase64: string) => boolean | Promise<boolean>;
}

const DEFAULT_TIMEOUT = 300;
const DEFAULT_NETWORK = Networks.TESTNET;
const BASE_FEE = '100';

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function normalizeBufferString(value: Buffer | string | null | undefined): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === 'string') return Buffer.from(value, 'utf8');
  throw new Error('ManageData value should be Buffer or string');
}

/**
 * Build a SEP-10 challenge transaction.
 *
 * @param options BuildChallengeOptions
 * @returns XDR string for the signed challenge transaction
 *
 * @example
 * const challengeXdr = buildChallenge({
 *   serverSecret: process.env.SEP10_SERVER_SECRET,
 *   clientAccount: clientPublicKey,
 *   anchorDomain: 'example.com',
 *   webAuthDomain: 'auth.example.com',
 *   timeout: 300,
 *   networkPassphrase: Networks.TESTNET,
 * });
 */
export function buildChallenge(options: BuildChallengeOptions): string {
  const {
    serverSecret,
    clientAccount,
    anchorDomain,
    webAuthDomain,
    timeout = DEFAULT_TIMEOUT,
    networkPassphrase = DEFAULT_NETWORK,
  } = options;

  assert(typeof serverSecret === 'string' && serverSecret.length > 0, 'serverSecret is required');
  assert(StrKey.isValidEd25519SecretSeed(serverSecret), 'serverSecret must be a valid Stellar secret key');
  assert(
    typeof clientAccount === 'string' && StrKey.isValidEd25519PublicKey(clientAccount),
    'clientAccount must be a valid Stellar public key',
  );
  assert(typeof anchorDomain === 'string' && anchorDomain.trim().length > 0, 'anchorDomain is required');
  assert(Number.isInteger(timeout) && timeout > 0, 'timeout should be positive integer');

  const serverKeypair = Keypair.fromSecret(serverSecret);
  // SEP-10 requires a challenge transaction sequence number of 0.
  // TransactionBuilder increments the sequence from the account object, thus we set -1.
  const serverAccount = new Account(serverKeypair.publicKey(), '-1');

  const nonce = randomBytes(48);
  const builder = new TransactionBuilder(serverAccount, {
    fee: BASE_FEE,
    networkPassphrase,
  }).addOperation(
    Operation.manageData({
      name: `${anchorDomain} auth`,
      value: nonce,
    }),
  );

  if (webAuthDomain) {
    builder.addOperation(
      Operation.manageData({
        name: 'web_auth_domain',
        value: webAuthDomain,
      }),
    );
  }

  const transaction = builder.setTimeout(timeout).build();

  transaction.sign(serverKeypair);

  return transaction.toXDR();
}

/**
 * Verify a signed SEP-10 response transaction and return the client public key on success.
 *
 * @param options VerifyResponseOptions
 * @returns verified client account
 *
 * @example
 * const verifiedClient = await verifyResponse({
 *   signedChallenge: responseXdr,
 *   serverAccount: serverPublicKey,
 *   clientAccount: clientPublicKey,
 *   anchorDomain: 'example.com',
 *   networkPassphrase: Networks.TESTNET,
 *   nonceValidator: async (nonce) => { return !nonceExists(nonce); },
 * });
 */
export async function verifyResponse(options: VerifyResponseOptions): Promise<string> {
  const {
    signedChallenge,
    serverAccount,
    clientAccount,
    anchorDomain,
    networkPassphrase = DEFAULT_NETWORK,
    now = Math.floor(Date.now() / 1000),
    maxChallengeAge,
    nonceValidator,
  } = options;

  assert(typeof signedChallenge === 'string' && signedChallenge.length > 0, 'signedChallenge is required');
  assert(
    typeof serverAccount === 'string' && StrKey.isValidEd25519PublicKey(serverAccount),
    'serverAccount must be a valid Stellar public key',
  );
  assert(
    typeof clientAccount === 'string' && StrKey.isValidEd25519PublicKey(clientAccount),
    'clientAccount must be a valid Stellar public key',
  );
  assert(typeof anchorDomain === 'string' && anchorDomain.trim().length > 0, 'anchorDomain is required');

  let transaction: Transaction;
  try {
    transaction = new Transaction(signedChallenge, networkPassphrase);
  } catch (err) {
    throw new Error('Invalid signedChallenge xdr');
  }

  assert(transaction.source === serverAccount, 'Transaction source must match server account');
  assert(transaction.sequence === '0', 'Transaction sequence number must be 0');

  const timeBounds = transaction.timeBounds;
  if (!timeBounds || timeBounds.minTime == null || timeBounds.maxTime == null) {
    throw new Error('Transaction must include timebounds');
  }

  const minTime = Number(timeBounds.minTime);
  const maxTime = Number(timeBounds.maxTime);

  assert(!Number.isNaN(minTime) && !Number.isNaN(maxTime), 'Timebounds must be numbers');
  assert(maxTime > minTime, 'Timebounds maxTime must be greater than minTime');

  if (maxChallengeAge != null) {
    assert(
      Number.isInteger(maxChallengeAge) && maxChallengeAge > 0,
      'maxChallengeAge should be positive integer',
    );
    assert(maxTime - minTime <= maxChallengeAge, 'Challenge TTL exceeds maxChallengeAge');
  }

  assert(now >= minTime, 'Challenge not yet valid');
  assert(now <= maxTime, 'Challenge has expired');

  if (transaction.operations.length === 0) {
    throw new Error('Transaction must include at least one operation');
  }

  let hasAnchorChallengeData = false;
  let hasWebAuthDomainOp = false;
  let nonceValue: Buffer | undefined;

  for (const operation of transaction.operations) {
    if (operation.type !== 'manageData') {
      throw new Error('Only manageData operations are allowed in a SEP-10 challenge');
    }

    if (operation.name === `${anchorDomain} auth`) {
      hasAnchorChallengeData = true;
      assert(operation.value !== undefined, 'Challenge manageData value must include nonce');
      const normalized = normalizeBufferString(operation.value);
      assert(normalized.length >= 16, 'Challenge nonce must be at least 16 bytes');
      assert(normalized.length <= 64, 'Challenge nonce must be at most 64 bytes');
      nonceValue = normalized;
    } else if (operation.name === 'web_auth_domain') {
      hasWebAuthDomainOp = true;
      assert(operation.value !== undefined, 'web_auth_domain value must be set if present');
      const normalized = normalizeBufferString(operation.value).toString('utf8');
      assert(normalized.length > 0, 'web_auth_domain must be non-empty');
    } else {
      throw new Error(`Unexpected manageData key: ${operation.name}`);
    }
  }

  assert(hasAnchorChallengeData, 'Challenge must contain anchorDomain auth manageData');

  if (!nonceValue) {
    throw new Error('Nonce buffer is required');
  }

  const nonceBase64 = nonceValue.toString('base64');

  if (nonceValidator) {
    const valid = await Promise.resolve(nonceValidator(nonceBase64));
    assert(valid === true, 'Nonce validation rejected (possible replay attack)');
  }

  const serverKeypair = Keypair.fromPublicKey(serverAccount);
  const clientKeypair = Keypair.fromPublicKey(clientAccount);

  let hasServerSignature = false;
  let hasClientSignature = false;

  const hash = transaction.hash();

  if (!transaction.signatures || transaction.signatures.length === 0) {
    throw new Error('Challenge response transaction must include signatures');
  }

  if (transaction.signatures.length !== 2) {
    throw new Error('Challenge response must contain exactly two signatures: server and client');
  }

  for (const signature of transaction.signatures) {
    const sig = signature.signature();
    if (serverKeypair.verify(hash, sig)) {
      hasServerSignature = true;
      continue;
    }

    if (clientKeypair.verify(hash, sig)) {
      hasClientSignature = true;
      continue;
    }

    throw new Error('Found invalid signature in challenge response');
  }

  assert(hasServerSignature, 'Server signature is missing from response');
  assert(hasClientSignature, 'Client signature is missing from response');

  return clientAccount;
}
