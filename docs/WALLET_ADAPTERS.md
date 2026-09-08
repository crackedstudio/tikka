# Wallet Adapters

`@tikka/sdk` ships with six built-in wallet adapters for the Stellar ecosystem and a defined contract that lets you add a seventh (or more) without touching SDK internals.

**Quick links**

- [Built-in adapters at a glance](#built-in-adapters-at-a-glance)
- [Adapter interface](#adapter-interface)
- [Using the built-in adapters](#using-the-built-in-adapters)
  - [Freighter](#freighter)
  - [Albedo](#albedo)
  - [Rabet](#rabet)
  - [xBull](#xbull)
  - [LOBSTR](#lobstr)
  - [MockWalletAdapter (testing)](#mockwalletadapter-testing)
- [Error handling](#error-handling)
- [Writing a custom adapter](#writing-a-custom-adapter)
- [Adding the adapter to the conformance suite](#adding-the-adapter-to-the-conformance-suite)
- [Related documentation](#related-documentation)

---

## Built-in adapters at a glance

| Adapter | `WalletName` | Extension? | `signMessage` | `getNetwork` | Requires `connect()` | Network passphrase required for `signTransaction` |
|---------|-------------|:----------:|:-------------:|:------------:|:--------------------:|:-------------------------------------------------:|
| `FreighterAdapter` | `freighter` | ✅ | ✅ | ✅ | optional | ❌ |
| `AlbedoAdapter` | `albedo` | ❌ (popup) | ✅ | ✅ | ❌ | ✅ |
| `RabetAdapter` | `rabet` | ✅ | ❌ | ✅ (from options) | ❌ | ✅ |
| `XBullAdapter` | `xbull` | ✅ | ❌ | ❌ | ✅ | ❌ |
| `LobstrAdapter` | `lobstr` | ✅ | ❌ | ❌ | ✅ | ❌ |
| `MockWalletAdapter` | `mock` | N/A | ✅ | ✅ | ❌ | ❌ |

---

## Adapter interface

Every adapter extends the abstract `WalletAdapter` class defined in
`sdk/src/wallet/wallet.interface.ts`.

```typescript
abstract class WalletAdapter {
  abstract readonly name: string;

  // Required
  abstract isAvailable(): boolean;
  abstract getPublicKey(): Promise<string>;
  abstract signTransaction(
    xdr: string,
    opts?: { networkPassphrase?: string; accountToSign?: string },
  ): Promise<SignTransactionResult>;
  abstract getCapabilities(): WalletCapabilities;

  // Optional — override as needed
  async connect?(): Promise<void>;
  disconnect?(): void;
  async signMessage(message: string): Promise<string>;   // default throws
  async getNetwork(): Promise<string | undefined>;        // default returns undefined
}
```

### SignTransactionResult

```typescript
interface SignTransactionResult {
  signedXdr: string; // Base64-encoded signed transaction envelope
}
```

### WalletCapabilities

```typescript
interface WalletCapabilities {
  supportsGetPublicKey: boolean;
  supportsSignTransaction: boolean;
  supportsSignMessage: boolean;
  supportsGetNetwork: boolean;
}
```

Keep capability flags honest. The conformance suite checks that
`supportsSignMessage: false` adapters actually throw when `signMessage` is called,
and that `true` adapters actually return a string.

### Error codes

Throw `TikkaSdkError` with one of these codes:

| Code | When to use |
|------|-------------|
| `WalletNotInstalled` | Bridge / extension missing from the environment |
| `WalletNotConnected` | Extension present but not authorized / `connect()` not called |
| `UserRejected` | User cancelled a prompt |
| `InvalidParams` | Bad XDR, missing network passphrase, wrong account |
| `Unknown` | Unexpected failure — attach `cause` for debugging |

```typescript
import { TikkaSdkError, TikkaSdkErrorCode } from '@tikka/sdk';

throw new TikkaSdkError(
  TikkaSdkErrorCode.UserRejected,
  'User rejected transaction signing',
  originalError, // optional cause
);
```

### Signing flow

```
SDK builds unsigned XDR
  → adapter.signTransaction(xdr, { networkPassphrase })
  → adapter returns { signedXdr }
  → SDK submits signedXdr to Soroban RPC
```

Never strip pre-existing signatures from a multi-sig transaction — return the
full signed envelope as received from the wallet library.

---

## Using the built-in adapters

### Freighter

[Freighter](https://freighter.app) is a browser extension by the Stellar Development Foundation. It is the most widely used Stellar wallet for dApps.

**Key behaviour**

- Detected via `window.freighter`. Uses `@stellar/freighter-api` under the hood.
- Supports auto-reconnect on page load: if the user was already connected, the
  constructor silently restores the session so `getPublicKey()` returns
  immediately without a permission prompt.
- `connect()` is optional; calling it explicitly will trigger the auto-reconnect
  path and prompt the user only if needed.
- Supports `signMessage` (Freighter v5.3+) and `getNetwork`.
- `disconnect()` clears the cached public key.

**Installation**

```bash
pnpm add @stellar/freighter-api
```

**Usage**

```typescript
import { FreighterAdapter } from '@tikka/sdk';
import { Networks } from '@stellar/stellar-sdk';

const adapter = new FreighterAdapter({
  networkPassphrase: Networks.TESTNET,
});

if (adapter.isAvailable()) {
  // Optional explicit connect — auto-reconnect runs in the constructor
  await adapter.connect();

  const publicKey = await adapter.getPublicKey();
  const { signedXdr } = await adapter.signTransaction(xdr);

  // Sign in with Stellar (SIWS)
  const signature = await adapter.signMessage('Sign in to Tikka');

  // Get currently selected network
  const network = await adapter.getNetwork(); // e.g. "Test SDF Network ; September 2015"
}
```

**Network passphrase** — Freighter passes the active network from the extension
to its API; you don't need to supply it for `signTransaction`. You may still pass
`opts.networkPassphrase` as an override.

---

### Albedo

[Albedo](https://albedo.link) is a web-based popup wallet. No browser extension is needed, making it ideal for users who prefer not to install extensions.

**Key behaviour**

- Available whenever `document` is defined (any browser environment).
- Uses `@albedo-link/intent` (dynamically imported); install it or Albedo
  operations throw `WalletNotInstalled`.
- **Requires** `networkPassphrase` for `signTransaction` — throws `InvalidParams`
  if it is omitted.
- Supports `signMessage` (returns a hex-encoded signature via Albedo's
  `sign_message` intent).
- Supports `getNetwork` — returns the configured network from adapter options
  (Albedo does not expose the user's selected network).
- Does not expose `connect()` / `disconnect()`.

**Installation**

```bash
pnpm add @albedo-link/intent
```

**Usage**

```typescript
import { AlbedoAdapter } from '@tikka/sdk';
import { Networks } from '@stellar/stellar-sdk';

const adapter = new AlbedoAdapter({
  networkPassphrase: Networks.TESTNET,
});

// Opens an Albedo popup
const publicKey = await adapter.getPublicKey();

// Network passphrase is required; opts.networkPassphrase overrides the one set at construction
const { signedXdr } = await adapter.signTransaction(xdr, {
  networkPassphrase: Networks.TESTNET,
  accountToSign: publicKey, // optional — specify which account should sign
});

// Message signing for SIWS
const signature = await adapter.signMessage('Sign in to Tikka');
```

**Error detection keywords** — Albedo surfaces user rejection via `cancel`,
`rejected`, or `denied` in the error message. The adapter maps these to
`TikkaSdkErrorCode.UserRejected` automatically.

---

### Rabet

[Rabet](https://rabet.io) is a lightweight, open-source browser extension for Stellar. It communicates via the `window.rabet` global.

**Key behaviour**

- Detected via `window.rabet`.
- **Requires** `networkPassphrase` for `signTransaction` — throws `InvalidParams`
  if it is omitted.
- Does **not** support `signMessage` — calling it throws the standard
  `"rabet does not support signMessage"` error.
- `getNetwork` returns the configured network from adapter options (Rabet does
  not expose the user's selected network directly).
- Does not expose `connect()` / `disconnect()`.

**Usage**

```typescript
import { RabetAdapter } from '@tikka/sdk';
import { Networks } from '@stellar/stellar-sdk';

const adapter = new RabetAdapter({
  networkPassphrase: Networks.TESTNET,
});

if (adapter.isAvailable()) {
  // Calls window.rabet.connect() internally
  const publicKey = await adapter.getPublicKey();

  const { signedXdr } = await adapter.signTransaction(xdr, {
    networkPassphrase: Networks.TESTNET,
  });
}
```

**Error response field** — Rabet returns `{ error: string }` in its response
objects on failure in addition to throwing. The adapter checks both paths and
throws a typed `TikkaSdkError`.

**Limitation** — `accountToSign` is silently ignored; Rabet always signs with
the active account in the extension.

---

### xBull

[xBull](https://xbull.app) is a non-custodial browser extension. It communicates via the `window.xbull` global.

**Key behaviour**

- Detected via `window.xbull`.
- **Requires** an explicit `connect()` call before `getPublicKey()` or
  `signTransaction()` — both throw `WalletNotConnected` until connected.
- `connect()` is idempotent; calling it a second time removes then re-adds
  listeners to prevent listener stacking.
- `disconnect()` clears all registered event listeners and resets state.
- Does **not** support `signMessage` or `getNetwork`.

**Usage**

```typescript
import { XBullAdapter } from '@tikka/sdk';
import { Networks } from '@stellar/stellar-sdk';

const adapter = new XBullAdapter({
  networkPassphrase: Networks.TESTNET,
});

if (adapter.isAvailable()) {
  await adapter.connect();

  const publicKey = await adapter.getPublicKey();
  const { signedXdr } = await adapter.signTransaction(xdr, {
    networkPassphrase: Networks.TESTNET,
    accountToSign: publicKey,
  });

  // Clean up listeners on unmount
  await adapter.disconnect();
}
```

---

### LOBSTR

[LOBSTR](https://lobstr.co) provides both a browser extension and an in-app web-view for the LOBSTR mobile app. The adapter uses the
`@lobstrco/signer-extension-api` package.

**Key behaviour**

- Available whenever `window` is defined (browser or LOBSTR mobile web-view).
- **Requires** an explicit `connect()` call before `getPublicKey()` or
  `signTransaction()` — both throw `WalletNotConnected` until connected.
- After each operation, the adapter re-verifies live extension state via
  `isConnected()`. If the user disconnects inside the extension after `connect()`
  was called, the next operation throws `WalletNotConnected` and resets state.
- Does **not** support `signMessage` or `getNetwork`.

For full LOBSTR-specific environment details (desktop browsers, mobile web-view),
see **[docs/LOBSTR_INTEGRATION.md](./LOBSTR_INTEGRATION.md)**.

**Installation**

```bash
pnpm add @lobstrco/signer-extension-api
```

**Usage**

```typescript
import { LobstrAdapter } from '@tikka/sdk';

const adapter = new LobstrAdapter({
  networkPassphrase: 'Test SDF Network ; September 2015',
});

try {
  await adapter.connect();

  const publicKey = await adapter.getPublicKey();
  const { signedXdr } = await adapter.signTransaction(xdr);

  await adapter.disconnect();
} catch (err) {
  if (err instanceof TikkaSdkError) {
    // WalletNotConnected if the extension isn't installed or the user declined
    console.error(err.code, err.message);
  }
}
```

---

### MockWalletAdapter (testing)

`MockWalletAdapter` provides deterministic wallet behaviour for unit and
integration tests, with no browser environment required.

**Key behaviour**

- Always `isAvailable() === true`.
- Configured public key is returned as-is; signed XDR is prefixed with
  `mock-signed:`.
- Supports all capabilities (`signMessage`, `getNetwork`).
- Individual operations can be configured to fail via options flags.

**Usage**

```typescript
import { MockWalletAdapter } from '@tikka/sdk';

// Happy path
const wallet = new MockWalletAdapter({
  publicKey: 'GBIQ4VH3TRO5A72SCCSHV5QZJVUHMFAZVD5K4PIWL3RBQFKBDLPHJ36',
  networkPassphrase: 'Test SDF Network ; September 2015',
  delayMs: 50, // simulate latency
});

const key = await wallet.getPublicKey();
// → 'GBIQ4VH3TRO5A72SCCSHV5QZJVUHMFAZVD5K4PIWL3RBQFKBDLPHJ36'

const { signedXdr } = await wallet.signTransaction('my-xdr');
// → { signedXdr: 'mock-signed:my-xdr' }

// Simulate failures
const rejecting = new MockWalletAdapter({ failSignTransaction: true });
await rejecting.signTransaction('tx'); // throws Error('MockWalletAdapter: signTransaction failure')
```

**MockWalletOptions flags**

| Flag | Effect |
|------|--------|
| `publicKey` | Return this string from `getPublicKey()` |
| `delayMs` | Artificial delay on all operations |
| `failGetPublicKey` | `getPublicKey()` throws |
| `failSignTransaction` | `signTransaction()` throws |
| `failSignMessage` | `signMessage()` throws |

---

## Error handling

All adapters throw `TikkaSdkError` for expected failure conditions. Use a
`switch` on `err.code` to react appropriately:

```typescript
import { TikkaSdkError, TikkaSdkErrorCode } from '@tikka/sdk';

try {
  const publicKey = await adapter.getPublicKey();
} catch (err) {
  if (!(err instanceof TikkaSdkError)) throw err; // re-throw unexpected errors

  switch (err.code) {
    case TikkaSdkErrorCode.WalletNotInstalled:
      // Prompt user to install the extension
      break;
    case TikkaSdkErrorCode.WalletNotConnected:
      // The extension is present but not yet authorised; call connect()
      break;
    case TikkaSdkErrorCode.UserRejected:
      // User dismissed the popup — surface a friendly message
      break;
    case TikkaSdkErrorCode.InvalidParams:
      // Bad XDR or missing network passphrase — check your call site
      break;
    default:
      // TikkaSdkErrorCode.Unknown — attach err.cause for debugging
      console.error('Wallet error:', err.message, err.cause);
  }
}
```

---

## Writing a custom adapter

To integrate a wallet that is not in the built-in set:

1. Extend `WalletAdapter`.
2. Implement the four required members: `name`, `isAvailable()`,
   `getPublicKey()`, `signTransaction()`, `getCapabilities()`.
3. Override `connect()`, `disconnect()`, `signMessage()`, `getNetwork()` as
   appropriate.
4. Map every thrown error to a `TikkaSdkError` with the correct code.
5. Register your adapter in the conformance suite (see next section).

```typescript
import {
  WalletAdapter,
  WalletAdapterOptions,
  WalletName,
  SignTransactionResult,
  WalletCapabilities,
} from '@tikka/sdk';
import { TikkaSdkError, TikkaSdkErrorCode } from '@tikka/sdk';

export class MyWalletAdapter extends WalletAdapter {
  // Use WalletName.Custom for in-house adapters, or any unique string
  readonly name = WalletName.Custom;

  private connected = false;

  constructor(options: WalletAdapterOptions = {}) {
    super(options);
  }

  isAvailable(): boolean {
    // Return true only when the wallet is actually usable
    return typeof (globalThis as any).myWallet !== 'undefined';
  }

  async connect(): Promise<void> {
    if (!this.isAvailable()) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.WalletNotInstalled,
        'MyWallet is not installed',
      );
    }
    // Authorise session with the extension / service
    await (globalThis as any).myWallet.requestAccess();
    this.connected = true;
  }

  disconnect(): void {
    this.connected = false;
  }

  async getPublicKey(): Promise<string> {
    this.assertConnected();
    try {
      return await (globalThis as any).myWallet.getAddress();
    } catch (err: any) {
      if (this.isUserRejection(err)) {
        throw new TikkaSdkError(TikkaSdkErrorCode.UserRejected, 'User rejected public key request', err);
      }
      throw new TikkaSdkError(TikkaSdkErrorCode.Unknown, `MyWallet getPublicKey failed: ${err?.message}`, err);
    }
  }

  async signTransaction(
    xdr: string,
    opts?: { networkPassphrase?: string; accountToSign?: string },
  ): Promise<SignTransactionResult> {
    this.assertConnected();
    const networkPassphrase = opts?.networkPassphrase ?? this.options.networkPassphrase;

    try {
      const signedXdr = await (globalThis as any).myWallet.sign(xdr, networkPassphrase);
      return { signedXdr };
    } catch (err: any) {
      if (this.isUserRejection(err)) {
        throw new TikkaSdkError(TikkaSdkErrorCode.UserRejected, 'User rejected transaction signing', err);
      }
      throw new TikkaSdkError(TikkaSdkErrorCode.Unknown, `MyWallet signTransaction failed: ${err?.message}`, err);
    }
  }

  getCapabilities(): WalletCapabilities {
    return {
      supportsGetPublicKey: true,
      supportsSignTransaction: true,
      supportsSignMessage: false,  // set to true and override signMessage() if supported
      supportsGetNetwork: false,
    };
  }

  private assertConnected(): void {
    if (!this.connected) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.WalletNotConnected,
        'MyWallet is not connected — call connect() first',
      );
    }
  }

  private isUserRejection(err: any): boolean {
    const msg = String(err?.message ?? err).toLowerCase();
    return msg.includes('cancel') || msg.includes('reject') || msg.includes('denied');
  }
}
```

See `sdk/examples/custom-wallet.ts` for a fully working adapter backed by a
local Stellar Keypair with connect/disconnect lifecycle, error mapping, and
`signMessage` support.

---

## Adding the adapter to the conformance suite

The conformance suite lives in
`sdk/src/wallet/wallet.conformance.spec.ts`. It runs 22+ assertions per adapter
to verify the integrator contract is honoured. Adding a new adapter is a
**one-file, one-array change**:

1. Add your mock setup and teardown helpers:

```typescript
async function setupMyWallet(): Promise<MyWalletAdapter> {
  (globalThis as any).myWallet = {
    requestAccess: jest.fn().mockResolvedValue(undefined),
    getAddress: jest.fn().mockResolvedValue(MOCK_PUBLIC_KEY),
    sign: jest.fn().mockResolvedValue(MOCK_SIGNED_XDR),
  };
  const adapter = new MyWalletAdapter({ networkPassphrase: Networks.TESTNET });
  await adapter.connect();
  return adapter;
}

function teardownMyWallet(): void {
  delete (globalThis as any).myWallet;
  jest.clearAllMocks();
}
```

2. Register a descriptor in the `ADAPTERS` array:

```typescript
{
  label: 'MyWalletAdapter',
  expectedName: WalletName.Custom,          // or your custom string
  setup: setupMyWallet,
  teardown: teardownMyWallet,
  requiresExplicitConnect: true,            // true if connect() must be called first
  requiresNetworkPassphrase: false,         // true if signTransaction throws without it
  expectedPublicKey: MOCK_PUBLIC_KEY,
  expectedSignedXdr: MOCK_SIGNED_XDR,
},
```

The full conformance suite then runs against your adapter automatically — no
other change is needed.

**Run the suite:**

```bash
cd sdk
pnpm test -- --testPathPatterns="wallet.conformance"
```

All six built-in adapters must continue to pass after you add your own.

---

## Related documentation

- **[docs/LOBSTR_INTEGRATION.md](./LOBSTR_INTEGRATION.md)** — LOBSTR-specific
  environments (desktop extension, mobile web-view) and auto-detection patterns.
- **[sdk/examples/custom-wallet.ts](../sdk/examples/custom-wallet.ts)** —
  Runnable end-to-end custom adapter example with a local Keypair signer.
- **[sdk/examples/albedo-wallet.ts](../sdk/examples/albedo-wallet.ts)** —
  Albedo-specific example: public key, transaction signing, message signing, and
  error handling.
- **[sdk/examples/rabet-wallet.ts](../sdk/examples/rabet-wallet.ts)** —
  Rabet-specific example: connect, sign, error handling.
- **[sdk/src/wallet/wallet.conformance.spec.ts](../sdk/src/wallet/wallet.conformance.spec.ts)** —
  Shared conformance suite (run this to validate any new adapter).
- **[sdk/src/wallet/wallet.interface.ts](../sdk/src/wallet/wallet.interface.ts)** —
  Authoritative TypeScript types for `WalletAdapter`, `WalletCapabilities`,
  `SignTransactionResult`, `WalletName`, and `TikkaSdkError`.
