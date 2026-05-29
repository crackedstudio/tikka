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

## Contracts

Soroban (Rust) raffle contracts are maintained **outside this repo**. Deploy and invoke them via the SDK once addresses are configured.

## Contributor Quickstart (Local Development)

Welcome to the Tikka project! Follow this guide to set up your local development environment and run the full system or individual packages.

### Prerequisites

- **Node.js**: v18+ or v20+ recommended.
- **npm**: v9+ (comes with Node.js).
- **PostgreSQL**: v14+ (or a local Supabase instance).
- **Redis**: v6+ (required for the oracle and indexer queues).

### Global Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone <repo-url>
   cd tikka
   ```

2. **Install dependencies:**
   Navigate to the specific package directory and run `npm install`.

3. **Environment Setup (`.env` files):**
   Each package requires its own environment variables. Copy the `.env.example` to `.env` in the respective package folders:
   ```bash
   cp client/.env.example client/.env
   cp backend/.env.example backend/.env
   cp oracle/.env.example oracle/.env
   cp indexer/.env.example indexer/.env
   ```
   *Tip: For local development, the default `.env.example` values are usually configured to connect to localhost services (e.g., Redis on `localhost:6379`).*

### Running the System Locally

To run the core stack (Client + Backend), follow these steps in separate terminal windows:

#### 1. Start External Dependencies
Ensure your local PostgreSQL and Redis instances are running. If you're using Docker:
```bash
docker run -d -p 6379:6379 redis:alpine
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:alpine
```

#### 2. Start the Backend API
The backend provides data to the client.
```bash
cd backend
npm install
npm run start:dev
```
*Runs on **http://localhost:3000** by default. See [backend/README.md](./backend/README.md) for more details.*

#### 3. Start the Client (Frontend)
The client can run against a real or mocked backend (configured in `.env`).
```bash
cd client
npm install
npm run dev
```
*Runs on **http://localhost:5173** by default. See [client/README.md](./client/README.md) for more details.*

#### 4. (Optional) Run the Indexer or Oracle
If you are developing blockchain-syncing features or randomness generation:
- **Indexer**: `cd indexer && npm install && npm run start:dev` (Default port: 3001, see [indexer/README.md](./indexer/README.md))
- **Oracle**: `cd oracle && npm install && npm run start:dev` (Default port: 3002, see [oracle/README.md](./oracle/README.md))

### Troubleshooting Common Failures

- **`ECONNREFUSED` on port 6379**: Redis is not running. Ensure your local Redis server or Docker container is active.
- **Missing `RAFFLE_CONTRACT_ID`**: The oracle and indexer require a valid Soroban contract ID. Ensure you've deployed the contracts and added the ID to your `.env` files.
- **Supabase/PostgreSQL connection errors**: Verify that your database URL in `.env` is correct and the database is actively accepting connections.
- **Node-Gyp build errors**: If you encounter native compilation errors during `npm install`, ensure you have Python and C++ build tools installed, or use a pre-built binary.
- **Eslint/TypeScript errors during build**: Run `npm run lint` and `npm run build` in the specific package to isolate the error.
