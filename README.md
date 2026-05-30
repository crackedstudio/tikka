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

## Documentation

- **[ARCHITECTURE.md](./docs/ARCHITECTURE.md)** — Full ecosystem specification with diagrams, data flows, contract interface, and API design
- **[RAFFLE_LIFECYCLE.md](./docs/RAFFLE_LIFECYCLE.md)** — Complete raffle lifecycle guide from creation through leaderboard update, with sequence diagrams and directory references

## Release & Versioning

Release policy, versioning rules, and changelog procedures: **[docs/RELEASE.md](./docs/RELEASE.md)**

- SDK: Semantic Versioning (`MAJOR.MINOR.PATCH`)
- Apps: Calendar Versioning (`YYYY.MM.PATCH`)
- Database: Timestamped migrations with rollback procedures

See [CHANGELOG.md](./CHANGELOG.md) for release history.

Module boundary and package ownership guidance: **[docs/contributing/MODULE_BOUNDARIES.md](./docs/contributing/MODULE_BOUNDARIES.md)**.

## Contracts

Soroban (Rust) raffle contracts are maintained **outside this repo**. Deploy and invoke them via the SDK once addresses are configured.
