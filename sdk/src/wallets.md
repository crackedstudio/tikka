# Tikka SDK — Supported Wallets

## Overview

The SDK uses a `WalletAdapter` interface so that `ContractService` never
depends on a specific wallet. All adapters share the same XDR contract:

- **Input** to `signTransaction`: base64-encoded Stellar `TransactionEnvelope` XDR
- **Output** from `signTransaction`: base64-encoded signed `TransactionEnvelope` XDR

This is identical to the format used by Freighter, xBull, and Albedo natively.

---

## Supported Wallets

| Wallet   | Type              | Availability                          |
|----------|-------------------|---------------------------------------|
| xBull    | Extension + PWA   | Chrome/Firefox extension or web app   |
| Albedo   | Web popup         | Any modern browser (no install needed)|

---

## Installation

Install the Stellar Wallets Kit (wraps all wallet APIs):

```bash
npm install @creit.tech/stellar-wallets-kit
```

---

## Usage

### Select a wallet by name

Use this when you have a wallet picker UI and know which wallet the user selected:

```ts
import { WalletAdapterFactory, WalletName } from './src/wallet';
import { Networks } from '@stellar/stellar-sdk';

const adapter = WalletAdapterFactory.create(WalletName.XBull, {
  networkPassphrase: Networks.TESTNET,
});

const pubKey = await adapter.getPublicKey();
const signedXdr = await adapter.signTransaction(unsignedXdr, Networks.TESTNET);
```

### Auto-detect the available wallet

Use this for a simple "Connect Wallet" button. Priority: xBull → Albedo.

```ts
import { WalletAdapterFactory } from './src/wallet';
import { Networks } from '@stellar/stellar-sdk';

const adapter = WalletAdapterFactory.autoDetect({
  networkPassphrase: Networks.TESTNET,
});

if (!adapter) {
  throw new Error('No supported wallet found. Please install xBull or use Albedo.');
}

const pubKey = await adapter.getPublicKey();
```

### Show available wallets (wallet selection modal)

```ts
import { WalletAdapterFactory } from './src/wallet';

const available = WalletAdapterFactory.getAvailable({
  networkPassphrase: Networks.TESTNET,
});

// e.g. render available.map(a => a.name) as buttons
```

### Handle errors

All adapters throw `TikkaSdkError` with typed codes:

```ts
import { TikkaSdkError, TikkaSdkErrorCode } from './src/utils';

try {
  const signedXdr = await adapter.signTransaction(xdr, Networks.TESTNET);
} catch (err) {
  if (err instanceof TikkaSdkError) {
    switch (err.code) {
      case TikkaSdkErrorCode.UserRejected:
        // User dismissed the wallet popup — show a gentle message
        break;
      case TikkaSdkErrorCode.NetworkError:
        // Wallet extension not found or popup was blocked
        break;
      case TikkaSdkErrorCode.TransactionFailed:
        // Wallet rejected the transaction for another reason
        break;
    }
  }
}
```

---

## xBull

- **Extension**: Install from the [Chrome Web Store](https://chrome.google.com/webstore)
- **PWA**: Available at [xbull.app](https://xbull.app) — no install needed
- `isAvailable()` checks for `window.xBullSDK` (injected by the extension)
- Falls back to the web app automatically if the extension is not installed

## Albedo

- **Web-based**: No extension required — opens a secure popup at [albedo.link](https://albedo.link)
- `isAvailable()` returns `true` in any browser environment
- **Important**: Ensure popups are not blocked in your browser
- The popup closes automatically after the user approves or rejects

---

## Adding a new wallet adapter

1. Create `src/wallet/mywallet.adapter.ts` implementing `WalletAdapter`
2. Add a new `WalletName` enum value in `wallet.adapter.ts`
3. Add the case to `WalletAdapterFactory.create()` and the candidates list in `autoDetect()`
4. Export from `src/wallet/index.ts`
5. Document it here

The `ContractService` requires zero changes — it depends only on `WalletAdapter`.
