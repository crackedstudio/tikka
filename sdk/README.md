# Tikka SDK

NestJS library for Soroban contract interaction: transaction building, simulation, fee estimation, signing, and submission. The frontend and third-party integrators use this instead of calling Soroban directly.

**Stack:** NestJS, TypeScript, Stellar SDK. Published as `@tikka/sdk`.

**Consumers:** Frontend (client), third-party developers.

## Core Features

- **Customizable RpcService**: Support for custom fetch clients, headers, and automatic failover across multiple nodes.
- **Contract Interaction**: Type-safe transaction building and simulation for Soroban contracts.
- **Wallet Integration**: Unified `WalletAdapter` interface supporting Freighter, xBull, and Albedo.
- **Modular Design**: Domain-specific modules for Raffles, Tickets, and Users.

## Project Structure

- `src/network/` — Customizable Soroban RPC and Horizon services.
- `src/contract/` — Core transaction logic and Soroban bindings.
- `src/wallet/` — Multi-wallet adapter system.
- `src/modules/` — Feature modules (Raffle, Ticket, User).
- `src/utils/` — Shared utilities for formatting, validation, and error handling.

## Architecture

Full ecosystem spec: [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) (section 2 — tikka-sdk).
