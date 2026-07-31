# Wallet Adapter Interface

Third-party integrators can plug any Stellar wallet into the Tikka SDK by implementing the `WalletAdapter` contract in [`src/wallet/wallet.interface.ts`](./src/wallet/wallet.interface.ts).

Built-in adapters (`FreighterAdapter`, `XBullAdapter`, `AlbedoAdapter`, `LobstrAdapter`, `RabetAdapter`, `MockWalletAdapter`) all follow this same interface. Use this document plus the [custom-wallet example](./examples/custom-wallet.ts) when adding a new wallet.

## Contract overview

| Member | Required | Purpose |
|--------|----------|---------|
| `name` | yes | Stable string identifier (`WalletName` enum or any custom string) |
| `isAvailable()` | yes | Detect whether the wallet can be used in the current environment |
| `getPublicKey()` | yes | Return the active Stellar account (`G…`) |
| `signTransaction(xdr, opts?)` | yes | Sign a base64 transaction envelope XDR |
| `getCapabilities()` | yes | Advertise supported operations for adaptive UI |
| `connect()` | optional | Explicit connection / authorization handshake |
| `disconnect()` | optional | Clear cached session state |
| `signMessage(message)` | optional* | Sign arbitrary text (SIWS / auth). Default throws |
| `getNetwork()` | optional* | Return the wallet's selected network passphrase. Default `undefined` |

\*Optional methods have default implementations on the abstract base class. Override them when the wallet supports the feature, and keep `getCapabilities()` in sync.

Constructor options (`WalletAdapterOptions`):

```ts
interface WalletAdapterOptions {
  /** Stellar network passphrase (e.g. Networks.TESTNET) */
  networkPassphrase?: string;
}
```

## Signing flow

Typical write-path flow when the SDK submits a Soroban transaction:

```
1. App constructs WalletAdapter and passes it to AppModule.forRoot({ wallet })
2. Service builds an unsigned transaction envelope (XDR)
3. SDK calls wallet.signTransaction(unsignedXdr, { networkPassphrase, accountToSign? })
4. Adapter prompts the user / HSM / custody API and returns { signedXdr }
5. SDK submits signedXdr to Soroban RPC
```

Recommended adapter lifecycle inside your app:

```ts
const wallet = new MyWalletAdapter({ networkPassphrase: Networks.TESTNET });

if (!wallet.isAvailable()) {
  // Show install / connect guidance
}

await wallet.connect?.();                 // if the wallet needs an explicit handshake
const publicKey = await wallet.getPublicKey();
const caps = wallet.getCapabilities();

const { signedXdr } = await wallet.signTransaction(xdr, {
  networkPassphrase: Networks.TESTNET,
  accountToSign: publicKey,               // optional; useful for multi-account wallets
});

wallet.disconnect?.();                    // when the user logs out
```

`signTransaction` must:

- Accept a **base64-encoded transaction envelope XDR**
- Prefer `opts.networkPassphrase` when provided, otherwise fall back to `this.options.networkPassphrase`
- Return `{ signedXdr: string }` — the fully signed envelope XDR
- Never mutate or strip signatures already present on the envelope

## Expected errors

Adapters should throw `TikkaSdkError` with a stable `TikkaSdkErrorCode` so UI code can branch reliably:

| Code | When to throw |
|------|----------------|
| `WalletNotInstalled` | Extension / SDK / bridge is missing in this environment |
| `WalletNotConnected` | Wallet is present but not authorized / connected |
| `UserRejected` | User cancelled a connect, public-key, or signing prompt |
| `InvalidParams` | XDR / network passphrase / account is malformed |
| `Unknown` | Unexpected wallet or bridge failure (include cause) |

Example:

```ts
import { TikkaSdkError, TikkaSdkErrorCode } from '@tikka/sdk';

if (!this.isAvailable()) {
  throw new TikkaSdkError(
    TikkaSdkErrorCode.WalletNotInstalled,
    'MyWallet is not available in this environment',
  );
}

try {
  // …call wallet bridge…
} catch (err: unknown) {
  if (isUserCancellation(err)) {
    throw new TikkaSdkError(
      TikkaSdkErrorCode.UserRejected,
      'User rejected transaction signing',
      err,
    );
  }
  throw new TikkaSdkError(
    TikkaSdkErrorCode.Unknown,
    `MyWallet signTransaction failed: ${String((err as Error)?.message ?? err)}`,
    err,
  );
}
```

Consumers should catch with `instanceof TikkaSdkError` and switch on `err.code`.

## Capabilities

Return accurate flags from `getCapabilities()` so the host UI can hide unsupported actions:

```ts
interface WalletCapabilities {
  supportsGetPublicKey: boolean;      // default expectation: true
  supportsSignTransaction: boolean;   // default expectation: true
  supportsSignMessage: boolean;       // default: false
  supportsGetNetwork: boolean;        // default: false
}
```

If `supportsSignMessage` is `false`, leave the base `signMessage` implementation (it throws). Do not advertise a capability you cannot fulfill.

## Minimal custom adapter

```ts
import {
  WalletAdapter,
  WalletName,
  SignTransactionResult,
  WalletCapabilities,
  TikkaSdkError,
  TikkaSdkErrorCode,
} from '@tikka/sdk';

class MyWalletAdapter extends WalletAdapter {
  readonly name = WalletName.Custom; // or any string, e.g. 'acme-custody'

  isAvailable(): boolean {
    return typeof (globalThis as any).myWallet !== 'undefined';
  }

  async getPublicKey(): Promise<string> {
    this.assertAvailable();
    return (globalThis as any).myWallet.getPublicKey();
  }

  async signTransaction(
    xdr: string,
    opts?: { networkPassphrase?: string; accountToSign?: string },
  ): Promise<SignTransactionResult> {
    this.assertAvailable();
    const networkPassphrase =
      opts?.networkPassphrase ?? this.options.networkPassphrase;
    const signedXdr = await (globalThis as any).myWallet.signTx(xdr, {
      networkPassphrase,
      accountToSign: opts?.accountToSign,
    });
    return { signedXdr };
  }

  getCapabilities(): WalletCapabilities {
    return {
      supportsGetPublicKey: true,
      supportsSignTransaction: true,
      supportsSignMessage: false,
      supportsGetNetwork: false,
    };
  }

  private assertAvailable(): void {
    if (!this.isAvailable()) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.WalletNotInstalled,
        'MyWallet is not installed',
      );
    }
  }
}
```

Wire it into the SDK the same way as built-ins:

```ts
const wallet = new MyWalletAdapter({ networkPassphrase: Networks.TESTNET });
const app = await NestFactory.createApplicationContext(
  AppModule.forRoot({ network: 'testnet', wallet }),
);
```

## Runnable example

See [`examples/custom-wallet.ts`](./examples/custom-wallet.ts) for a complete, compile-checked custom adapter (local keypair signer) that exercises availability, capabilities, public key retrieval, transaction signing, message signing, and error mapping.

Verify examples still type-check:

```bash
cd sdk
npm run examples:check
```

## Related

- Source: [`src/wallet/wallet.interface.ts`](./src/wallet/wallet.interface.ts)
- Built-ins: [`src/wallet/`](./src/wallet/)
- Errors: [`src/utils/errors.ts`](./src/utils/errors.ts)
- SDK README — [Wallet Adapters](./README.md#wallet-adapters)
