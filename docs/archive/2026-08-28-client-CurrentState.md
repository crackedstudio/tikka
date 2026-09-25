> **⚠ ARCHIVED** — This document is historical and no longer maintained.
> For current documentation see the [docs/ index](../README.md) or the superseded-by link in [archive/README.md](./README.md).

---

# Current State of Tikka Project

**Last Updated:** February 2025  
**Project Phase:** Alpha – Stellar infrastructure in place, raffle data still demo  
**Primary Focus:** Wallet & RPC integrated; contract layer present; UI still driven by mock data

---

## Executive Summary

Tikka is in an **alpha state with Stellar integration scaffolded**. The frontend has a full UI, **real Stellar wallet connection** (Freighter via Stellar Wallets Kit), **Soroban RPC connection**, and a **contract service layer** with read/write interfaces. Raffle **data is still mock-only**: `useRaffles` and the create/enter flows use demo data and simulated steps. Contract address is **TBD** until a Soroban raffle contract is deployed; `createRaffle` and `buyTicket` in the contract service are **stubs**. Environment configuration is documented and validated (`.env.example`, `scripts/validate-env.js`, DEVELOPMENT.md, docs).

---

## ✅ What Has Been Completed

### Frontend Architecture
- **React 19 + TypeScript + Vite** setup complete
- **Tailwind CSS** design system implemented
- **React Router** routing configured
- **Component structure** organized and modular
- **Type definitions** in `src/types/types.ts` (including contract-related types)

### UI Components & Pages
- **Landing Page** (`src/pages/LandingPage.tsx`) – Hero, featured raffles, discover section
- **Home Page** (`src/pages/Home.tsx`) – Browse raffles, featured section, trending
- **Create Raffle** (`src/pages/CreateRaffle.tsx`) – Multi-step form with live preview
- **Raffle Details** (`src/pages/RaffleDetails.tsx`) – Individual raffle view
- **My Raffles** (`src/pages/MyRaffles.tsx`) – User’s created/participated raffles (demo data)
- **Leaderboard** (`src/pages/Leaderboard.tsx`) – Placeholder UI (no real data)
- **Winner Demo** (`src/pages/WinnerDemo.tsx`) – Winner announcement demo

Component library (cards, modals, forms, navbar, landing blocks) is in place as previously documented.

### Stellar & Wallet Integration
- **Stellar SDK** (`@stellar/stellar-sdk`) and **Stellar Wallets Kit** (`@creit.tech/stellar-wallets-kit`) in dependencies
- **Wallet service** (`src/services/walletService.ts`) – connect/disconnect, get address, sign transactions, network passphrase from env
- **WalletProvider** (`src/providers/WalletProvider.tsx`) and **useWallet** (`src/hooks/useWallet.ts`) – app-wide wallet state
- **WalletButton** (`src/components/WalletButton.tsx`) – real connect/disconnect UI (no “Demo Mode” badge when wallet is used)
- **RPC service** (`src/services/rpcService.ts`) – Soroban RPC server instance and `checkConnection()`; used in `App.tsx` on load

### Contract & Config Layer
- **Contract config** (`src/config/contract.ts`) – address from env (default `"TBD"`), function names, constants, validation on load
- **Contract service** (`src/services/contractService.ts`) – `ContractService` with:
  - **Reads (implemented):** `getRaffleData`, `getActiveRaffleIds`, `getAllRaffleIds`, `getUserParticipation`
  - **Writes (stubs):** `createRaffle`, `buyTicket` (log params only, no transaction)
- **Stellar config** (`src/config/stellar.ts`) – network, RPC URL, Horizon URL, passphrase from env
- **Env config** (`src/config/env.ts`) – typed `env` object, validation, defaults, debug logging (network, sorobanRpc, contractConfigured, useDemoData)

### Demo Data & Raffle UI Data Flow
- **Demo raffles** (`src/data/demoRaffles.ts`) – sample raffles
- **useRaffles** (`src/hooks/useRaffles.ts`) – still uses `demoRaffles` only (no contract calls yet)
- **CreateRaffleButton** – simulates creation with timeouts and a random ID; does not call `ContractService.createRaffle` or Supabase

### Environment & Documentation
- **`.env.example`** – all variables listed with comments (Stellar, Soroban, Supabase, wallet, app, features, dev)
- **`scripts/validate-env.js`** – validates presence of `.env` and required variables
- **DEVELOPMENT.md** – environment setup, Stellar testnet (Horizon, Friendbot, Lab), Supabase setup, env verification notes
- **docs/ENVIRONMENT_SETUP.md** – environment setup details
- **docs/CONTRACT_INTEGRATION.md** – contract integration and env usage
- **README.md** – references env and DEVELOPMENT.md for configuration

### Services & Infrastructure
- **Supabase** – `src/config/supabase.ts`, metadata service; ready for use when wired into create flow
- **Metadata service** – CRUD for raffle metadata (not yet used by CreateRaffleButton)

### Design & Assets
- Design system, typography, assets, and `design.md` as previously documented.

---

## ❌ What Has NOT Been Completed

### Contract Deployment & Address
- **Contract address** – `VITE_RAFFLE_CONTRACT_ADDRESS` is unset; config uses `"TBD"`. Contract reads will fail until a Soroban raffle contract is deployed and address is set.
- **createRaffle / buyTicket** – Implemented as stubs in `ContractService`; no real transactions.

### Data Layer (Still Demo)
- **Raffle list and detail** – `useRaffles` / `useRaffle` use only `demoRaffles`; no `ContractService.getActiveRaffleIds` / `getRaffleData` in the UI.
- **Create flow** – CreateRaffleButton does not call contract or persist metadata to Supabase.
- **Enter / buy ticket** – No integration with `ContractService.buyTicket` or wallet signing.

### Core Functionality
- **Real raffle creation** – Not implemented (demo simulation only).
- **Real ticket purchasing** – Not implemented.
- **Winner selection** – No onchain randomness or finalization.
- **Prize distribution** – Not implemented.
- **Leaderboard** – UI only; no real data source.

### Testing & Quality
- **Unit / integration / E2E tests** – Not present.
- **Type safety** – Types exist; no test or runtime validation beyond env.

---

## 🔧 What Is Needed to Move Forward

### Priority 1: Deploy Contract & Set Address
- Deploy Soroban raffle contract to testnet.
- Set `VITE_RAFFLE_CONTRACT_ADDRESS` in `.env` (and document in README/DEVELOPMENT.md if needed).

### Priority 2: Wire Raffle Data to Contract
- In **useRaffles** (or a new hook), use `ContractService.getActiveRaffleIds` and `ContractService.getRaffleData` when contract is configured (and optionally when `VITE_USE_DEMO_DATA` is false).
- Keep demo data as fallback for UI development when contract is not deployed.

### Priority 3: Real Create & Enter Flows
- **CreateRaffleButton:** upload metadata to Supabase, call `ContractService.createRaffle` with signed transaction, show real tx hash and raffle ID.
- **EnterRaffleButton:** call `ContractService.buyTicket` with wallet-signed transaction and update UI (ticket count, participation).

### Priority 4: Winner Selection & Payouts
- Implement onchain randomness/finalization and prize distribution per contract design.

### Priority 5: Leaderboard & My Raffles
- Source leaderboard from contract/backend; My Raffles from contract participation data.

### Priority 6: Testing
- Add unit tests for hooks and services; integration tests for wallet and contract flows.

---

## 📊 Implementation Status by Feature

| Feature | Status | Notes |
|--------|--------|-------|
| UI components & pages | ✅ Complete | All main pages and component library |
| Demo data system | ✅ Complete | demoRaffles, useRaffles (demo only) |
| Design system | ✅ Complete | Tailwind, dark theme, responsive |
| Stellar wallet | ✅ Implemented | WalletProvider, useWallet, walletService (Freighter) |
| Soroban RPC | ✅ Implemented | rpcService, checkConnection, used in App |
| Contract config & service | ✅ Present | Reads implemented; createRaffle/buyTicket stubs |
| Environment & docs | ✅ Complete | .env.example, validate-env.js, DEVELOPMENT.md, docs |
| Supabase integration | ✅ Ready | Config and metadata service; not wired to create flow |
| Contract address | ❌ TBD | Not deployed; config uses "TBD" |
| Real raffle creation | ❌ Not done | CreateRaffleButton is demo-only |
| Real ticket purchasing | ❌ Not done | No buyTicket integration |
| Raffle data from contract | ❌ Not done | useRaffles still uses demoRaffles only |
| Winner selection / payouts | ❌ Not done | — |
| Leaderboard data | ❌ Not done | UI only |
| Testing | ❌ Not done | No test files |

---

## 🎯 Recommended Next Steps

1. **Deploy Soroban raffle contract** to testnet and set `VITE_RAFFLE_CONTRACT_ADDRESS`.
2. **Switch raffle data source** – use contract reads in hooks when address is set (with demo fallback).
3. **Implement create flow** – Supabase metadata + `ContractService.createRaffle` + WalletButton/signing in CreateRaffleButton.
4. **Implement buy flow** – `ContractService.buyTicket` + signing in EnterRaffleButton.
5. **Replace stubs** – implement real transaction building and signing in `ContractService.createRaffle` and `buyTicket`.
6. **Add tests** – at least for config, wallet state, and contract service.

---

## 🔍 Key Files (Current Roles)

- **Wallet:** `src/components/WalletButton.tsx`, `src/providers/WalletProvider.tsx`, `src/hooks/useWallet.ts`, `src/services/walletService.ts`
- **Contract & RPC:** `src/services/contractService.ts`, `src/services/rpcService.ts`, `src/config/contract.ts`, `src/config/stellar.ts`
- **Env:** `src/config/env.ts`, `.env.example`, `scripts/validate-env.js`
- **Data (still demo):** `src/hooks/useRaffles.ts`, `src/data/demoRaffles.ts`
- **To connect to contract:** `src/components/CreateRaffleButton.tsx`, `src/components/EnterRaffleButton.tsx`, `src/pages/MyRaffles.tsx`, `src/pages/Leaderboard.tsx`
- **Docs:** `DEVELOPMENT.md`, `docs/ENVIRONMENT_SETUP.md`, `docs/CONTRACT_INTEGRATION.md`

---

## 📝 Notes

- **Wallet:** Real Stellar wallet connection is in place; WalletButton shows connect/disconnect and address (truncated).
- **RPC:** App runs `checkConnection()` on load; Soroban RPC URL comes from env.
- **Contract:** Service is written for a specific contract interface (get_raffle_data, get_active_raffle_ids, create_raffle, buy_ticket, etc.); address must be set after deployment.
- **Demo mode:** `VITE_USE_DEMO_DATA` and `env.dev.useDemoData` control use of demo data; hooks do not yet branch on this for contract vs demo.
- **ISSUES.md:** Contains open issues (e.g. env/config, SDK, wallet, contract integration); several env/docs items are already done (`.env.example`, DEVELOPMENT.md, validation script).

---

## 🚨 Blockers

1. **No contract address** – Deploy Soroban raffle contract and set `VITE_RAFFLE_CONTRACT_ADDRESS`.
2. **Create/buy stubs** – `ContractService.createRaffle` and `buyTicket` need real transaction building and signing (wallet integration exists).
3. **Raffle data not from contract** – `useRaffles` and related UI still use only `demoRaffles`; need to call contract when configured.

---

**Next action items:**  
1) Deploy Soroban contract and set env contract address.  
2) Wire useRaffles (or equivalent) to contract reads with demo fallback.  
3) Implement real create (metadata + contract + wallet) and buy (contract + wallet) in the UI and in ContractService.
