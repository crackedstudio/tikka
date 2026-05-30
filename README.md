# Tikka — Decentralized Raffle Platform on Stellar

This repository is the **Tikka ecosystem**: frontend, SDK, backend, indexer, and oracle. Soroban smart contracts (Rust) live in a **separate repo/folder** and are not included here.

## Packages

| Package | Name | Role |
|---------|------|------|
| [**client**](./client/) | `tikka-client` | Consumer web app — React 19, Vite, TypeScript. Reads from backend, writes via SDK. |
| [**sdk**](./sdk/) | `@tikka/sdk` | NestJS library for Soroban contract interaction (tx build, simulate, sign, submit). |
| [**backend**](./backend/) | `tikka-backend` | API layer — auth (SIWS), metadata, indexer merge, notifications. NestJS, Fastify, Supabase. |
| [**indexer**](./indexer/) | `tikka-indexer` | Blockchain event ingestion — Horizon → decode → PostgreSQL (+ Redis cache). NestJS. |
| [**oracle**](./oracle/) | `tikka-oracle` | Randomness oracle — listens for draw requests, computes VRF/PRNG, submits to contract. NestJS. |

## Workspace Setup

This repo uses **pnpm workspaces**. All five packages are declared in [`pnpm-workspace.yaml`](./pnpm-workspace.yaml).

### Prerequisites

- **Node.js** ≥ 20
- **pnpm** ≥ 9 (or use [Corepack](https://nodejs.org/api/corepack.html): `corepack enable`)
- Docker and Docker Compose v2 (for infrastructure services)

### Install all dependencies

```bash
pnpm install
```

This single command installs dependencies for **every** workspace package.

### Build / test / lint all packages

```bash
pnpm run build        # build all packages
pnpm run test         # test all packages
pnpm run lint         # lint all packages
```

### Target a single package

Use `pnpm --filter <name>` or the convenience root scripts:

```bash
# Using --filter directly
pnpm --filter tikka-client run dev
pnpm --filter tikka-backend run build
pnpm --filter @tikka/sdk run test

# Using root convenience scripts
pnpm run build:client
pnpm run test:backend
pnpm run dev:client
```

### Available root scripts

| Script | Description |
|--------|-------------|
| `build` | Build all packages |
| `build:<pkg>` | Build a single package (`client`, `sdk`, `backend`, `indexer`, `oracle`) |
| `test` | Run tests in all packages |
| `test:<pkg>` | Run tests in a single package |
| `lint` | Lint all packages |
| `lint:<pkg>` | Lint a single package |
| `dev:client` | Start Vite dev server |
| `dev:backend` | Start backend in watch mode |
| `dev:indexer` | Start indexer in watch mode |
| `dev:oracle` | Start oracle in watch mode |

## Local Development

### Setup

```bash
cp .env.example .env
cp backend/.env.example backend/.env.local   # fill in SUPABASE_URL, JWT_SECRET, ADMIN_TOKEN
cp indexer/.env.example indexer/.env.local   # fill in SOROBAN_RPC_URL, TIKKA_CONTRACT_ID
cp oracle/.env.example oracle/.env.local
```

### Docker Compose Profiles

| Profile | What starts |
|---------|-------------|
| `deps` | Postgres + Redis only |
| `backend` | deps + backend API (port 3001) |
| `indexer` | deps + indexer (port 3002) |
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
pnpm run dev:client
```

### Tear down

```bash
docker compose --profile full down -v
```

---

## SDK API Docs

Auto-generated TypeDoc reference for `@tikka/sdk`:
**[crackedstudio.github.io/tikka](https://crackedstudio.github.io/tikka)**

Covers all public APIs organized by module: Raffle · Ticket · Wallet · User · Network · Utils.
To regenerate locally: `pnpm --filter @tikka/sdk run docs`

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
