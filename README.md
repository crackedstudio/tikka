# Tikka — Decentralized Raffle Platform on Stellar

This repository is the **Tikka ecosystem**: frontend, SDK, backend, indexer, and oracle. Soroban smart contracts (Rust) live in a **separate repo/folder** and are not included here.

## Packages

| Package | Role |
|---------|------|
| [**client**](./client/) | Consumer web app — React 19, Vite, TypeScript. Reads from backend, writes via SDK. |
| [**sdk**](./sdk/) | NestJS library for Soroban contract interaction (tx build, simulate, sign, submit). Published as `@tikka/sdk`. |
| [**backend**](./backend/) | API layer — auth (SIWS), metadata, indexer merge, notifications. NestJS, Fastify, Supabase. |
| [**indexer**](./indexer/) | Blockchain event ingestion — Horizon → decode → PostgreSQL (+ Redis cache). NestJS. |
| [**oracle**](./oracle/) | Randomness oracle — listens for draw requests, computes VRF/PRNG, submits to contract. NestJS. |

## SDK API Docs

Auto-generated TypeDoc reference for `@tikka/sdk`:
**[crackedstudio.github.io/tikka](https://crackedstudio.github.io/tikka)**

Covers all public APIs organized by module: Raffle · Ticket · Wallet · User · Network · Utils.
To regenerate locally: `cd sdk && npm run docs`

## Architecture

Full ecosystem specification: **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** — diagram, data flows, contract interface, API design, and roadmap.

Soroban (Rust) raffle contracts are maintained **outside this repo**. Deploy and invoke them via the SDK once addresses are configured.

## Workspace Management & Local Development

This repository is structured as a **declared pnpm workspace** to manage all packages under a single dependency graph efficiently.

### 1. Installation
To install all dependencies across the entire ecosystem from a clean checkout, simply run from the root:
```bash
pnpm install
```

### 2. Common Workspace Tasks
Root scripts are configured to easily target all or specific packages.

#### Build
- Build all packages:
  ```bash
  pnpm build
  ```
- Build a specific package (e.g. `client`):
  ```bash
  pnpm build:client
  ```

#### Test
- Test all packages:
  ```bash
  pnpm test
  ```
- Test a specific package (e.g. `sdk`):
  ```bash
  pnpm test:sdk
  ```

#### Lint
- Lint all packages:
  ```bash
  pnpm lint
  ```
- Lint a specific package:
  ```bash
  pnpm lint:client
  ```

### 3. Package-Local Operations
Local commands inside individual packages (e.g. `cd client && pnpm run dev`) remain completely unchanged and supported.

