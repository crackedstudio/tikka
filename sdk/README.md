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

## Architecture

Full ecosystem spec: [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) (section 2 — tikka-sdk).

## Wallet Adapters

The SDK provides a unified interface for multiple Stellar wallets. All adapters implement the same `WalletAdapter` interface with `getPublicKey()` and `signTransaction(xdr)` methods.

### Supported Wallets

| Wallet | Installation | Notes |
|---|---|---|
| Freighter | Browser extension | Most popular, requires extension |
| xBull | Browser extension / PWA | Mobile-friendly |
| Albedo | Web-based | No extension required |
| LOBSTR | Browser extension | Large user base |

### Usage

```typescript
import { FreighterAdapter, XBullAdapter, AlbedoAdapter, LobstrAdapter } from '@tikka/sdk';

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
