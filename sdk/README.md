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

## React Native Notes

- Provide a fetch implementation explicitly when needed:
  - `new RpcService(networkConfig, { endpoint, fetchClient: fetch })`
- Wallet adapters that rely on browser extension globals are not available in React Native; use app-native signing or the mock adapter for local prototyping.
- Ensure required polyfills are present in your RN app entrypoint (`buffer`, `crypto`, and `stream` when your environment requires them).
