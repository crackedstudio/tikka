/**
 * custom-wallet.ts — Minimal custom WalletAdapter implementation
 *
 * Demonstrates the integrator contract from WALLET_ADAPTER.md:
 *   - Extending WalletAdapter for a third-party / in-house wallet
 *   - Advertising capabilities
 *   - Public-key retrieval and transaction / message signing
 *   - Mapping failures to TikkaSdkError codes
 *
 * This example uses a local Stellar Keypair as a stand-in for any custom
 * signer (hardware wallet bridge, custody API, mobile SDK, etc.). It runs
 * in Node without a browser extension.
 *
 * Optional env vars:
 *   TIKKA_SECRET_KEY   S… secret seed (generates an ephemeral keypair if omitted)
 *   TIKKA_NETWORK      testnet | mainnet | standalone  (default: testnet)
 *
 * Usage:
 *   npx ts-node examples/custom-wallet.ts
 *   TIKKA_SECRET_KEY=S... npx ts-node examples/custom-wallet.ts
 *
 * Type-check with the rest of the examples:
 *   npm run examples:check
 */

import { Keypair, Networks, TransactionBuilder, Account, Operation, Asset } from '@stellar/stellar-sdk';
import {
  WalletAdapter,
  WalletName,
  SignTransactionResult,
  WalletCapabilities,
  WalletAdapterOptions,
} from '../src/wallet/wallet.interface';
import { TikkaSdkError, TikkaSdkErrorCode } from '../src/utils/errors';
import { TikkaNetwork } from '../src/network/network.config';

/** Options for the sample custom keypair adapter. */
interface CustomKeypairAdapterOptions extends WalletAdapterOptions {
  /** Secret key used for local signing. Required for this demo adapter. */
  secretKey: string;
  /**
   * When true, `isAvailable()` returns false so callers can exercise
   * `WalletNotInstalled` handling.
   */
  simulateUnavailable?: boolean;
  /**
   * When true, signing methods throw `UserRejected` to demonstrate
   * cancellation mapping.
   */
  simulateUserReject?: boolean;
}

/**
 * Sample custom wallet adapter backed by a local Stellar Keypair.
 *
 * Replace the Keypair calls with your real wallet bridge — keep the
 * method signatures, capability flags, and TikkaSdkError mapping.
 */
class CustomKeypairAdapter extends WalletAdapter {
  readonly name = WalletName.Custom;

  private readonly keypair: Keypair;
  private readonly customOptions: CustomKeypairAdapterOptions;
  private connected = false;

  constructor(options: CustomKeypairAdapterOptions) {
    super(options);
    this.customOptions = options;
    this.keypair = Keypair.fromSecret(options.secretKey);
  }

  isAvailable(): boolean {
    return !this.customOptions.simulateUnavailable;
  }

  async connect(): Promise<void> {
    this.assertAvailable();
    this.connected = true;
  }

  disconnect(): void {
    this.connected = false;
  }

  async getPublicKey(): Promise<string> {
    this.assertAvailable();
    this.assertConnected();
    this.assertNotRejected('public key request');
    return this.keypair.publicKey();
  }

  async signTransaction(
    xdr: string,
    opts?: { networkPassphrase?: string; accountToSign?: string },
  ): Promise<SignTransactionResult> {
    this.assertAvailable();
    this.assertConnected();
    this.assertNotRejected('transaction signing');

    if (!xdr || typeof xdr !== 'string') {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.InvalidParams,
        'signTransaction requires a base64 transaction envelope XDR',
      );
    }

    const networkPassphrase =
      opts?.networkPassphrase ?? this.options.networkPassphrase ?? Networks.TESTNET;

    if (opts?.accountToSign && opts.accountToSign !== this.keypair.publicKey()) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.InvalidParams,
        `accountToSign ${opts.accountToSign} does not match this wallet`,
      );
    }

    try {
      const tx = TransactionBuilder.fromXDR(xdr, networkPassphrase);
      tx.sign(this.keypair);
      return { signedXdr: tx.toXDR() };
    } catch (err: unknown) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.Unknown,
        `Custom wallet signTransaction failed: ${String((err as Error)?.message ?? err)}`,
        err,
      );
    }
  }

  override async signMessage(message: string): Promise<string> {
    this.assertAvailable();
    this.assertConnected();
    this.assertNotRejected('message signing');

    const signature = this.keypair.sign(Buffer.from(message, 'utf8'));
    return Buffer.from(signature).toString('base64');
  }

  override async getNetwork(): Promise<string | undefined> {
    return this.options.networkPassphrase;
  }

  getCapabilities(): WalletCapabilities {
    return {
      supportsGetPublicKey: true,
      supportsSignTransaction: true,
      supportsSignMessage: true,
      supportsGetNetwork: true,
    };
  }

  private assertAvailable(): void {
    if (!this.isAvailable()) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.WalletNotInstalled,
        'Custom wallet is not available in this environment',
      );
    }
  }

  private assertConnected(): void {
    if (!this.connected) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.WalletNotConnected,
        'Custom wallet is not connected — call connect() first',
      );
    }
  }

  private assertNotRejected(action: string): void {
    if (this.customOptions.simulateUserReject) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.UserRejected,
        `User rejected ${action}`,
      );
    }
  }
}

function resolveNetworkPassphrase(network: TikkaNetwork): string {
  return network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
}

/** Build a tiny payment XDR so the adapter has something real to sign. */
function buildDemoPaymentXdr(source: Keypair, networkPassphrase: string): string {
  const account = new Account(source.publicKey(), '0');
  const tx = new TransactionBuilder(account, {
    fee: '100',
    networkPassphrase,
  })
    .addOperation(
      Operation.payment({
        destination: source.publicKey(),
        asset: Asset.native(),
        amount: '0.0000001',
      }),
    )
    .setTimeout(180)
    .build();

  return tx.toXDR();
}

async function main() {
  const network = (process.env.TIKKA_NETWORK ?? 'testnet') as TikkaNetwork;
  const networkPassphrase = resolveNetworkPassphrase(network);
  const secretKey = process.env.TIKKA_SECRET_KEY ?? Keypair.random().secret();
  const source = Keypair.fromSecret(secretKey);

  console.log('Custom wallet adapter demo');
  console.log(`  Network: ${network}`);
  console.log(`  Passphrase: ${networkPassphrase}\n`);

  // --- Happy path -------------------------------------------------------
  const wallet = new CustomKeypairAdapter({
    secretKey,
    networkPassphrase,
  });

  console.log('1. Availability & capabilities');
  console.log(`   name: ${wallet.name}`);
  console.log(`   isAvailable: ${wallet.isAvailable()}`);
  console.log(`   capabilities:`, wallet.getCapabilities());

  console.log('\n2. Connect & get public key');
  await wallet.connect();
  const publicKey = await wallet.getPublicKey();
  console.log(`   publicKey: ${publicKey}`);

  console.log('\n3. Sign transaction');
  const unsignedXdr = buildDemoPaymentXdr(source, networkPassphrase);
  const { signedXdr } = await wallet.signTransaction(unsignedXdr, {
    networkPassphrase,
    accountToSign: publicKey,
  });
  console.log(`   unsigned length: ${unsignedXdr.length}`);
  console.log(`   signed length:   ${signedXdr.length}`);
  console.log(`   signed prefix:   ${signedXdr.slice(0, 32)}...`);

  console.log('\n4. Sign message (SIWS-style)');
  const message = `Sign in to Tikka — ${new Date().toISOString()}`;
  const signature = await wallet.signMessage(message);
  console.log(`   message:   ${message}`);
  console.log(`   signature: ${signature.slice(0, 32)}...`);

  console.log('\n5. Network + disconnect');
  console.log(`   getNetwork: ${await wallet.getNetwork()}`);
  wallet.disconnect();
  console.log('   disconnected');

  // --- Error mapping demos ---------------------------------------------
  console.log('\n6. Expected error mapping');

  const missing = new CustomKeypairAdapter({
    secretKey,
    networkPassphrase,
    simulateUnavailable: true,
  });
  try {
    await missing.getPublicKey();
  } catch (err) {
    if (err instanceof TikkaSdkError) {
      console.log(`   unavailable → ${err.code}: ${err.message}`);
    }
  }

  const rejected = new CustomKeypairAdapter({
    secretKey,
    networkPassphrase,
    simulateUserReject: true,
  });
  await rejected.connect();
  try {
    await rejected.signTransaction(unsignedXdr, { networkPassphrase });
  } catch (err) {
    if (err instanceof TikkaSdkError) {
      console.log(`   rejected    → ${err.code}: ${err.message}`);
    }
  }

  console.log('\nCustom wallet example completed successfully.');
  console.log('See WALLET_ADAPTER.md for the full integrator contract.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
