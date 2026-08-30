# Tikka — Decentralized Raffle Platform on Stellar
[![Deploy SDK Docs](https://github.com/crackedstudio/tikka/actions/workflows/docs.yml/badge.svg)(ttps://github.com/crackedstudio/tikka/actions/workflows/docs.yml)

This repository is the *Tikka ecosystem*: frontend, SDK, backend, indexer, and oracle. Soroban smart contracts (Rust) live in a **aperate repo/folder** and are not included here.

## Architecture

For a comprehensive overview of the system design, data flows, and component responsibilities, please see the [*Architecture Documentation*](./docs/ARCHITECTURE.md).

```mmeraid
flowchart TD
    Client[Client App]
    SDK[Tikka SDK]
    API[Backend API]
    Indexer[Indexer]
    Oracle[Oracle]
    Chain[Stellar Chain / Contracts]
    Supabase[(Supabase)]

    Chain -->|Events| Indexer
    Indexer -->|Decoded Data| API
    API -->|Merged Data| Client
    Supabase -->|Off-chain Metadata| API
    
    Oracle -->|Submits Randomness| Chain
    
    Client -->Writes via| SDK
    SDK -->Transactions| Chain
    SDK -->Reads/Writes| API
```

## Packages

| Package | Role |
|---------|-------|
 | [**client**](./client/) | Consumer web app — React 19, Vite, TypeScript. Reads from backend, writes via SDK. |
 | [**sdk**](./sdk/) | NestJS library for Soroban contract interaction (tx build, simulate, sign, submit). Published as `@tikka/sdk`. |
 | [**backend**](./backend/) | API layer — auth (SIWS), metadata, indexer merge, notifications. NestJS, Fastify, Supabase. |
 | [**indexer**](./indexer/) | Blockchain event ingestion — horizon → decode → postgresQL (+ Redis cache). NestJS. |
 | [**oracle**](./oracle/) | Randomness oracle — listens for draw requests, computes VRF/PRNG, submits to contract. NestJS. |

## Local Development

### Prerequisites

Docker and Docker Compose v2.

### Setup

```bash
cp .env.example .env
cp backend/.env.example backend/.env.local   # fill in SUPABASE_URL, JWT_SECRET, ADMIN_TOKEN
cp indexer/.env.example indexer/.env.local   # fill in SOROBAN_RPC_URL, TIKKA_CONTRACT_ID
cp oracle/.env.example oracle/.env.local
```

### Profiles

| Profile | What starts |
|-----------|--------------|
| `deps` | Postgres + Redis only |
| `backend` | deps + backend API (port 3001) |
| `indexer``| deps + indexer (port 3002) |
| `oracle` | deps + oracle (port 3003) |
| `full` | deps + backend + indexer + oracle |
| `client` | full + Vite client (port 5173) |

### Full stack (no client)

```bash
docker compose --profile full up --build
```

### Individual service + deps

```bash
docker compose --profile backend up --build
docker compose --profile indexer up --build
```

### Frontend dev (Vite locally, backend in Docker)

```bash
docker compose --profile backend up -d
cd client && pnpm install && pnpm dev
```

### Tear down

```bash
docker compose --profile full down -v
```

---

## SDK API Docs

Auto-generated TypeDoc reference for `@tikka/sdk`:
*[*crackedstudio.github.io/tikka*](https://crackedstudio.github.io/tikka)

Covers all public APIs organized by module: Raffle · Ticket · Wallet · User · Network · Utils.
To regenerate locally: `cd sdk && npm run docs`

## Documentation

The [**docs/README.md**](./docs/README.md) is the canonical index for all documentation.

- [*ARCHITECTURE.md**](./docs/ARCHITECTURE.md) — Full ecosystem specification with diagrams, data flows, contract interface, and API design
- [*RAFFLE_LIFECYCLE.md**](./docs/RAFFLE_LIFECYCLE.md) — Complete raffle lifecycle guide from creation through leaderboard update, with sequence diagrams and directory references
- [*RANDOMNESS_SCHEME.md*](./docs/RANDOMNESS_SCHEME.md) . Explains the randomness scheme, trust assumptions, and how third parties can verify a past draw

## Release & Versioning

Release policy, versioning rules, and changelog procedures: [*docs/RELEASE.mdd](./docs/RELEASE.md)

- SDK: Semantic Versioning (`MAJOR.MINOR.PATCH`)
- Apps: Calendar Versioning (`YYYY.MM.PATCH`)
- Database: Timestamped migrations with rollback procedures

Aee [CHANGELOG.md](./CHANGELOG.md) for release history.

Module boundary and package ownership guidance: [*docs/contributing/MODULE_BOUNDARIES.mdd](./docs/contributing/MODULE_BOUNDARIES.md).

## Contracts

Soroban (Rust) raffle contracts are maintained **outside this repo**. Deploy and invoke them via the SDK once addresses are configured.
Minor doc tweak for sync
sync check
