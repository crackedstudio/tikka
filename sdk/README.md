# Tikka SDK

NestJS library for Soroban contract interaction: transaction building, simulation, fee estimation, signing, and submission. The frontend and third-party integrators use this instead of calling Soroban directly.

**Stack:** NestJS, TypeScript, Stellar SDK. Published as `@tikka/sdk`.

**Consumers:** Frontend (client), third-party developers.

## Core Features

- **Customizable RpcService**: Support for custom fetch clients, headers, and automatic failover across multiple nodes.
- **Automatic RPC Retries**: Built-in retry with exponential backoff for transient 429/5xx/timeout errors, with per-call opt-out.
- **Contract Interaction**: Type-safe transaction building and simulation for Soroban contracts.
- **Wallet Integration**: Unified `WalletAdapter` interface supporting Freighter, xBull, and Albedo.
- **Local Mocking Utilities**: `MockWalletAdapter` and `MockRpcService` for Storybook, UI tests, and offline development.
- **Modular Design**: Domain-specific modules for Raffles, Tickets, and Users.

## Project Structure

- `src/network/` — Customizable Soroban RPC and Horizon services.
- `src/contract/` — Core transaction logic and Soroban bindings.
- `src/wallet/` — Multi-wallet adapter system.
- `src/modules/` — Feature modules (Raffle, Ticket, User).
- `src/utils/` — Shared utilities for formatting, validation, and error handling.

## API Documentation

Full TypeDoc reference is auto-generated and hosted on GitHub Pages:
**[crackedstudio.github.io/tikka](https://crackedstudio.github.io/tikka)**

To build locally:
```bash
npm run docs        # generates sdk/docs/
npm run docs:watch  # rebuilds on file change
```

The docs are organized by module: **Raffle** · **Ticket** · **Wallet** · **User** · **Network** · **Utils**.

## Architecture

Full ecosystem spec: [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) (section 2 — tikka-sdk).

## Wallet Adapters

The SDK provides a unified interface for multiple Stellar wallets. All adapters implement the same `WalletAdapter` interface with `getPublicKey()` and `signTransaction(xdr)` methods.

### Supported Wallets

| Wallet | Installation | Notes |
|---|---|---|
| Freighter | Browser extension | Most popular, requires extension |
| xBull | Browser extension / PWA | Mobile-friendly |
| Albedo | Web-based | No extension required, popup-based |
| LOBSTR | Browser extension | Large user base |
| Rabet | Browser extension | Lightweight, open-source |

### Albedo Wallet

Albedo is a web-based wallet that doesn't require browser extensions. It opens a popup window for authentication and transaction signing, making it ideal for users who prefer not to install extensions.

**Key Features:**
- No browser extension required
- Works in any modern browser
- Popup-based authentication
- Supports message signing for SIWS (Sign In With Stellar)
- Network switching support

**Installation:**
```bash
npm install @albedo-link/intent
```

**Basic Usage:**
```typescript
import { AlbedoAdapter } from '@tikka/sdk';
import { Networks } from '@stellar/stellar-sdk';

// Create adapter with network configuration
const adapter = new AlbedoAdapter({
  networkPassphrase: Networks.TESTNET
});

// Check availability (always true in browser)
if (adapter.isAvailable()) {
  // Get public key (opens Albedo popup)
  const publicKey = await adapter.getPublicKey();
  console.log('User public key:', publicKey);
  
  // Sign transaction (opens Albedo popup)
  const { signedXdr } = await adapter.signTransaction(xdr, {
    networkPassphrase: Networks.TESTNET
  });
  
  // Sign message for authentication
  const signature = await adapter.signMessage('Sign in to MyApp');
}
```

**Advanced Usage:**
```typescript
// Specify which account should sign (for multi-account users)
const { signedXdr } = await adapter.signTransaction(xdr, {
  networkPassphrase: Networks.TESTNET,
  accountToSign: 'GBQW4KLMRXIMSDWBEWX4AWQKWYW7R3E7SFPSHTUDTFFT22NNUC6COL72'
});

// Get configured network
const network = await adapter.getNetwork();
console.log('Network:', network);
```

**Error Handling:**
```typescript
import { TikkaSdkError, TikkaSdkErrorCode } from '@tikka/sdk';

try {
  const publicKey = await adapter.getPublicKey();
} catch (err) {
  if (err instanceof TikkaSdkError) {
    switch (err.code) {
      case TikkaSdkErrorCode.UserRejected:
        console.log('User cancelled the request');
        break;
      case TikkaSdkErrorCode.WalletNotInstalled:
        console.log('@albedo-link/intent package not installed');
        break;
      default:
        console.log('Unknown error:', err.message);
    }
  }
}
```

**Complete Example:**
See [examples/albedo-wallet.ts](./examples/albedo-wallet.ts) for a full working example.

### Rabet Wallet

Rabet is a lightweight, open-source browser extension wallet for Stellar. It provides a simple and secure way to manage Stellar assets and interact with dApps.

**Key Features:**
- Lightweight browser extension
- Open-source and community-driven
- Simple and intuitive interface
- Supports transaction signing
- Network switching support

**Installation:**
Rabet doesn't require an npm package - it uses the global `window.rabet` object injected by the browser extension.

**Basic Usage:**
```typescript
import { RabetAdapter } from '@tikka/sdk';
import { Networks } from '@stellar/stellar-sdk';

// Create adapter with network configuration
const adapter = new RabetAdapter({
  networkPassphrase: Networks.TESTNET
});

// Check if Rabet extension is installed
if (adapter.isAvailable()) {
  // Get public key (prompts user to connect)
  const publicKey = await adapter.getPublicKey();
  console.log('User public key:', publicKey);
  
  // Sign transaction
  const { signedXdr } = await adapter.signTransaction(xdr, {
    networkPassphrase: Networks.TESTNET
  });
}
```

**Advanced Usage:**
```typescript
// Use different network
const { signedXdr } = await adapter.signTransaction(xdr, {
  networkPassphrase: Networks.PUBLIC
});

// Get configured network
const network = await adapter.getNetwork();
console.log('Network:', network);
```

**Error Handling:**
```typescript
import { TikkaSdkError, TikkaSdkErrorCode } from '@tikka/sdk';

try {
  const publicKey = await adapter.getPublicKey();
} catch (err) {
  if (err instanceof TikkaSdkError) {
    switch (err.code) {
      case TikkaSdkErrorCode.UserRejected:
        console.log('User cancelled the request');
        break;
      case TikkaSdkErrorCode.WalletNotInstalled:
        console.log('Rabet extension not installed. Get it at https://rabet.io');
        break;
      default:
        console.log('Unknown error:', err.message);
    }
  }
}
```

**Important Notes:**
- Rabet requires a network passphrase for transaction signing
- Message signing is not supported by Rabet
- Users must have the Rabet browser extension installed from [rabet.io](https://rabet.io)

### General Wallet Usage

```typescript
import { FreighterAdapter, XBullAdapter, AlbedoAdapter, LobstrAdapter, RabetAdapter } from '@tikka/sdk';

// Create adapter instance
const adapter = new FreighterAdapter({
  networkPassphrase: Networks.TESTNET
});

// Check availability
if (adapter.isAvailable()) {
  // Get public key
  const publicKey = await adapter.getPublicKey();
  
  // Sign transaction
  const { signedXdr } = await adapter.signTransaction(xdr, {
    networkPassphrase: Networks.TESTNET
  });
}
```

### Selecting Adapters

You can select adapters by name or auto-detect available wallets:

```typescript
const adapters = {
  freighter: new FreighterAdapter(),
  xbull: new XBullAdapter(),
  albedo: new AlbedoAdapter(),
  lobstr: new LobstrAdapter(),
};

// Check which are available
const availableAdapters = Object.entries(adapters)
  .filter(([, adapter]) => adapter.isAvailable())
  .map(([name]) => name);

// Auto-select first available
const selectedAdapter = availableAdapters[0] ? adapters[availableAdapters[0]] : null;
```

## React Native Notes

- Provide a fetch implementation explicitly when needed:
  - `new RpcService(networkConfig, { endpoint, fetchClient: fetch })`
- Wallet adapters that rely on browser extension globals are not available in React Native; use app-native signing or the mock adapter for local prototyping.
- Ensure required polyfills are present in your RN app entrypoint (`buffer`, `crypto`, and `stream` when your environment requires them).
