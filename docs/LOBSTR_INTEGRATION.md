# LOBSTR Wallet Integration Guide

This guide describes how the `@tikka/sdk` implements and interacts with LOBSTR, enabling seamless interaction across both desktop environments and the LOBSTR mobile app web view.

## Supported Environments
Our Wallet Adapter for LOBSTR fully integrates the official `@lobstrco/signer-extension-api` npm package, which natively supports:
1. **Desktop Browsers**: Via the LOBSTR browser extension (Chrome, Edge, Brave, Opera).
2. **LOBSTR Mobile App**: Within the in-app web-view.

## How to connect

You can use the built-in `WalletAdapterFactory` from `@tikka/sdk` to request a LOBSTR connection explicitly or auto-detect it.

### Option 1: Explicit Connection
If you are building a UI with specific "Connect <Wallet>" buttons, you can pass `WalletName.Lobstr` to the factory:

```typescript
import { WalletAdapterFactory, WalletName } from '@tikka/sdk/wallet';

try {
  const adapter = WalletAdapterFactory.create(WalletName.Lobstr, {
    networkPassphrase: 'Test SDF Network ; September 2015',
  });

  const pubKey = await adapter.getPublicKey();
  console.log('Connected to LOBSTR with pubkey:', pubKey);
} catch (e) {
  console.error('LOBSTR connect failed:', e);
}
```

### Option 2: Auto Detection
The Tikka SDK can auto-detect the available wallets in the user's environment. The mobile web-view or browser extension injects necessary flags that make LOBSTR correctly announce itself as available:

```typescript
import { WalletAdapterFactory } from '@tikka/sdk/wallet';

const adapter = WalletAdapterFactory.autoDetect({
  networkPassphrase: 'Test SDF Network ; September 2015',
});

if (adapter) {
  const pubKey = await adapter.getPublicKey();
  // proceed ...
}
```

## Signing Transactions
Signing is handled naturally through the standard adapter interface. When called from a mobile web view, the LOBSTR app captures the request natively, allowing users to securely review and approve it on their phone.

```typescript
// Assume `xdr` is a built Soroban transaction envelope
const signedXdr = await adapter.signTransaction(xdr);
```

## Need Help?
For additional resources, check the [LOBSTR developer tools documentation](https://lobstr.co).
