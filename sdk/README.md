# Tikka SDK

NestJS library for Soroban contract interaction: transaction building, simulation, fee estimation, signing, and submission. The frontend and third-party integrators use this instead of calling Soroban directly.

**Stack:** NestJS, TypeScript, Stellar SDK. Published as `@tikka/sdk`.

**Consumers:** Frontend (client), third-party developers.

## Intended structure (from spec)

- `src/modules/raffle` — create, get, list, cancel
- `src/modules/ticket` — buy, refund, query
- `src/modules/user` — participation history
- `src/contract/` — bindings, XDR tx builder, contract addresses
- `src/wallet/` — WalletAdapter interface and adapters (Freighter, xBull, Albedo, LOBSTR)
- `src/network/` — Soroban RPC, Horizon
- `src/utils/` — formatting, validation, errors

Implementation to be added.

## Architecture

Full ecosystem spec: [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) (section 2 — tikka-sdk).
