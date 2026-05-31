# Contract Upgrade Checklist

> **Purpose:** Verify all packages are compatible before deploying a contract upgrade  
> **Audience:** Contract developers, SDK maintainers, QA leads  
> **Estimated Time:** 30–60 minutes

---

## Pre-Flight: Contract Readiness

Before considering an upgrade, the contract must be ready.

- [ ] Contract deployed to testnet (if new deployment)
- [ ] Contract passes Soroban test harness tests
- [ ] Contract ABI is stable (no planned method changes)
- [ ] Contract source code is committed to `tikka-contracts` repo
- [ ] Deployment script (`deploy.sh`) is up-to-date
- [ ] Contract ID documented and tested

---

## Phase 1: SDK Updates

The SDK is the first system to integrate with the contract.

### 1.1: Bindings

- [ ] **Regenerate TypeScript bindings** from new contract:
  ```bash
  cd sdk
  stellar contract bindings typescript \
    --network testnet \
    --contract-id <NEW_CONTRACT_ID> \
    --output-dir ./src/contract/generated
  ```

- [ ] **Review generated bindings** for:
  - [ ] New methods match expected additions
  - [ ] Renamed methods are identified
  - [ ] Removed methods are identified
  - [ ] Parameter types are correct

- [ ] **Update manual bindings** in [`sdk/src/contract/bindings.ts`](../../sdk/src/contract/bindings.ts):
  - [ ] Add new entries to `ContractFn` enum
  - [ ] Remove deprecated entries
  - [ ] Rename entries if method renamed
  - [ ] Update `RaffleStatus` enum if states changed

### 1.2: Constants

- [ ] **Update contract ID** in [`sdk/src/contract/constants.ts`](../../sdk/src/contract/constants.ts):
  ```typescript
  testnet: {
    raffle: process.env.TIKKA_CONTRACT_TESTNET ?? '<NEW_CONTRACT_ID>',
  },
  ```

- [ ] **Verify environment variables** are set:
  - [ ] `TIKKA_CONTRACT_TESTNET` (for CI/tests)
  - [ ] `TIKKA_CONTRACT_MAINNET` (empty until mainnet deployment)
  - [ ] `TIKKA_FACTORY_TESTNET` (if factory contract changed)

### 1.3: Contract Service

- [ ] **Review contract service** in [`sdk/src/contract/contract.service.ts`](../../sdk/src/contract/contract.service.ts):
  - [ ] All method calls use updated `ContractFn` names
  - [ ] Parameter types match new `RaffleParams` or other structs
  - [ ] Return types match new contract responses

- [ ] **Update tests** in [`sdk/src/contract/contract.service.spec.ts`](../../sdk/src/contract/contract.service.spec.ts):
  - [ ] Tests still compile after binding changes
  - [ ] Mock contract calls use new method names
  - [ ] Expected return values match new schema

### 1.4: SDK Validation

- [ ] **Run SDK tests:**
  ```bash
  cd sdk
  npm run test
  ```
  - [ ] All tests pass
  - [ ] No type errors

- [ ] **Run SDK linter:**
  ```bash
  npm run lint
  ```
  - [ ] All linting issues resolved

- [ ] **Run SDK build:**
  ```bash
  npm run build
  ```
  - [ ] No TypeScript errors
  - [ ] `dist/` directory generated successfully

---

## Phase 2: Indexer Updates

The indexer parses contract events and stores them.

### 2.1: Event Handlers

- [ ] **Review contract events** in `tikka-contracts/events.rs`:
  - [ ] List all event types
  - [ ] List all event field names

- [ ] **Check event handler registry** in [`indexer/src/ingestor/event-handler-registry.service.ts`](../../indexer/src/ingestor/event-handler-registry.service.ts):
  - [ ] All contract events have registered handlers
  - [ ] New events have new handlers
  - [ ] Removed events have handlers marked for deprecation

- [ ] **Update event handlers** in [`indexer/src/ingestor/handlers/`](../../indexer/src/ingestor/handlers/):
  - [ ] Field extraction in `parse()` method matches new event schema
  - [ ] Type conversions (`toNumber()`, `toString()`) handle all fields
  - [ ] Error handling catches missing/malformed fields

- [ ] **Add new event handlers** if contract added events:
  - [ ] Create `my-event.handler.ts` extending `BaseEventHandler`
  - [ ] Implement `parse()` method
  - [ ] Export from `handlers/index.ts`
  - [ ] Register in event handler config JSON

### 2.2: Event Type Definitions

- [ ] **Review event types** in [`indexer/src/ingestor/event.types.ts`](../../indexer/src/ingestor/event.types.ts):
  - [ ] All contract event fields are represented
  - [ ] Types match contract schema (e.g., `i128` → `string`, addresses → `Address`)
  - [ ] New events have new type definitions

### 2.3: Database Schema

- [ ] **Check if database schema changes needed:**
  - [ ] New event fields that should be indexed separately? → New migration
  - [ ] Changed event types? → Alter table columns
  - [ ] New raffle states? → Update enum

- [ ] **Create migration if needed:**
  ```bash
  cd indexer
  npm run typeorm migration:create src/database/migrations/NNN_contract_upgrade
  ```
  - [ ] Add columns for new fields
  - [ ] Update enums if states changed
  - [ ] Test rollback

- [ ] **Run database migrations:**
  ```bash
  npm run typeorm migration:run
  ```

### 2.4: Indexer Validation

- [ ] **Run indexer tests:**
  ```bash
  cd indexer
  npm run test
  ```
  - [ ] All tests pass
  - [ ] Event parser tests use new event schemas

- [ ] **Run indexer linter:**
  ```bash
  npm run lint
  ```
  - [ ] All linting issues resolved

- [ ] **Run indexer build:**
  ```bash
  npm run build
  ```
  - [ ] No TypeScript errors

---

## Phase 3: Oracle Updates

The oracle listens for randomness requests and submits randomness.

### 3.1: Oracle Listener

- [ ] **Review oracle event listener** in [`oracle/src/listener/`](../../oracle/src/listener/):
  - [ ] Listens for `RandomnessRequested` event (check name/fields)
  - [ ] Correctly extracts `raffle_id` from event
  - [ ] Event handler queue is updated if event name changed

### 3.2: Randomness Submitter

- [ ] **Review randomness submission** in [`oracle/src/submitter/`](../../oracle/src/submitter/):
  - [ ] Calls `receive_randomness` method (check name)
  - [ ] Passes `seed` and `proof` with correct types
  - [ ] Handles transaction simulation and fee estimation

- [ ] **Update method call if signature changed:**
  ```typescript
  // Old
  await sdk.contract.invoke('receive_randomness', [raffleId, seed, proof]);
  
  // New (if method signature changed)
  await sdk.contract.invoke('receive_randomness_v2', [raffleId, seed, proof]);
  ```

### 3.3: Oracle Validation

- [ ] **Run oracle tests:**
  ```bash
  cd oracle
  npm run test
  ```
  - [ ] All tests pass
  - [ ] Listener and submitter tests still work

- [ ] **Run oracle linter:**
  ```bash
  npm run lint
  ```
  - [ ] All linting issues resolved

- [ ] **Run oracle build:**
  ```bash
  npm run build
  ```
  - [ ] No TypeScript errors

---

## Phase 4: Backend Updates

The backend provides REST API and handles metadata.

### 4.1: Contract Config

- [ ] **Update backend contract configuration** in [`backend/src/contract/`](../../backend/src/contract/):
  - [ ] Contract ID updated (via env var or config)
  - [ ] Contract method names reflect new bindings
  - [ ] Handles new contract response types

### 4.2: Database Schema

- [ ] **Check if backend needs schema updates:**
  - [ ] New metadata fields to store? → New migration
  - [ ] Changed data types? → Alter columns
  - [ ] New raffle states? → Update enums

- [ ] **Run backend database migrations** (if any):
  ```bash
  cd backend
  npm run typeorm migration:run
  ```

### 4.3: API Endpoints

- [ ] **Review API endpoints** that call the contract:
  - [ ] `GET /raffles/:id` — calls `get_raffle_data`
  - [ ] `GET /raffles` — calls `get_active_raffle_ids` or `get_all_raffle_ids`
  - [ ] All endpoints handle new/changed contract response types

### 4.4: Backend Validation

- [ ] **Run backend tests:**
  ```bash
  cd backend
  npm run test
  ```
  - [ ] All tests pass
  - [ ] Contract integration tests work

- [ ] **Run backend linter:**
  ```bash
  npm run lint
  ```
  - [ ] All linting issues resolved

- [ ] **Run backend build:**
  ```bash
  npm run build
  ```
  - [ ] No TypeScript errors

---

## Phase 5: Client Updates

The frontend displays raffle data from the contract.

### 5.1: Contract Config

- [ ] **Update client contract config** in [`client/src/config/contract.ts`](../../client/src/config/contract.ts):
  - [ ] Contract address updated
  - [ ] Method names updated in `CONTRACT_CONFIG.functions`
  - [ ] Any new contract constants added

### 5.2: State & Enums

- [ ] **Update raffle status enum** if states changed:
  - [ ] Check [`client/src/types/raffle.ts`](../../client/src/types/raffle.ts)
  - [ ] Add new states to `RaffleStatus` enum
  - [ ] Update UI to handle new states

- [ ] **Update data types** if contract schema changed:
  - [ ] `RaffleData` type matches contract
  - [ ] `RaffleParams` type matches contract
  - [ ] Any new fields reflected in UI components

### 5.3: UI Components

- [ ] **Review components that display contract data:**
  - [ ] Raffle list component (`RaffleList.tsx`)
  - [ ] Raffle detail component (`RaffleDetail.tsx`)
  - [ ] Status indicator component (`RaffleStatus.tsx`)
  - [ ] All handle new states/fields correctly

- [ ] **Update hooks** that call the SDK:
  - [ ] `useContract()` — any new methods to expose?
  - [ ] `useRaffles()` — handles new state transitions?

### 5.4: Client Validation

- [ ] **Run client tests:**
  ```bash
  cd client
  npm run test
  ```
  - [ ] All tests pass
  - [ ] Contract integration tests work

- [ ] **Run client linter:**
  ```bash
  npm run lint
  ```
  - [ ] All linting issues resolved

- [ ] **Run client build:**
  ```bash
  npm run build
  ```
  - [ ] No TypeScript errors
  - [ ] No build warnings

- [ ] **Manual smoke test:**
  - [ ] Open localhost:5173
  - [ ] Contract address loads correctly
  - [ ] Raffle list displays
  - [ ] Can view raffle details
  - [ ] No console errors

---

## Phase 6: Cross-Package Integration

All packages must work together.

### 6.1: Full Build

- [ ] **Build entire workspace:**
  ```bash
  npm run build --workspaces
  ```
  - [ ] All packages build successfully
  - [ ] No TypeScript errors across packages
  - [ ] No dependency conflicts

### 6.2: Integration Tests

- [ ] **Run integration test suite** (if exists):
  ```bash
  npm run test:integration
  ```
  - [ ] SDK → Contract integration works
  - [ ] Indexer → SDK integration works
  - [ ] Oracle → Contract integration works
  - [ ] Backend → Indexer integration works
  - [ ] Client → Backend integration works

### 6.3: End-to-End Tests

- [ ] **Deploy to testnet** and run E2E tests:
  ```bash
  # Deploy contract
  cd ../tikka-contracts
  ./scripts/deploy.sh testnet <NEW_CONTRACT_ID>
  
  # Run E2E tests
  cd ../tikka
  npm run test:e2e
  ```
  - [ ] Create raffle works end-to-end
  - [ ] Buy ticket works end-to-end
  - [ ] List raffles returns correct data
  - [ ] Oracle can submit randomness

---

## Phase 7: Deployment

Once all validation passes, deploy the upgrade.

### 7.1: Announce & Document

- [ ] **Update CHANGELOG.md:**
  - [ ] Document contract upgrade
  - [ ] List breaking changes (if any)
  - [ ] List new features

- [ ] **Update integration boundary docs:**
  - [ ] [`INTEGRATION_BOUNDARY.md`](./INTEGRATION_BOUNDARY.md)
  - [ ] Update contract ID references
  - [ ] Update method signatures if changed
  - [ ] Update event schemas if changed

- [ ] **Announce in Discord:**
  - [ ] Notify developers of upgrade
  - [ ] Link to CHANGELOG and docs
  - [ ] Expected downtime (if any)

### 7.2: Mainnet Deployment (if applicable)

- [ ] **Deploy contract to mainnet:**
  ```bash
  cd ../tikka-contracts
  ./scripts/deploy.sh mainnet
  ```
  - [ ] Capture new contract ID
  - [ ] Verify contract code hash matches testnet
  - [ ] Add contract ID to docs

- [ ] **Update all packages with mainnet contract ID:**
  - [ ] `sdk/src/contract/constants.ts`
  - [ ] Backend env vars
  - [ ] Client env vars
  - [ ] Oracle env vars

- [ ] **Re-run validation on mainnet:**
  - [ ] Bindings still work
  - [ ] Events still parse
  - [ ] Randomness flow works

---

## Post-Deployment Validation

After deployment, verify the upgrade is working.

- [ ] **Monitor logs:**
  - [ ] No "contract not found" errors
  - [ ] No event parsing failures
  - [ ] Oracle processing randomness requests

- [ ] **Smoke test in production:**
  - [ ] Create test raffle
  - [ ] Buy test ticket
  - [ ] Verify event indexed
  - [ ] Verify in API response

- [ ] **User communication:**
  - [ ] Announce successful upgrade in Discord
  - [ ] Monitor for user issues
  - [ ] Be ready to rollback if critical bugs found

---

## Rollback Plan

If critical issues are discovered:

1. **Identify root cause** — contract code, SDK binding, indexer parser, etc.
2. **Deploy previous contract version** to testnet
3. **Revert code changes** in affected packages
4. **Re-run validation checklist**
5. **Deploy rollback to mainnet**
6. **Notify users** of rollback and ETA for fix

---

## Related Resources

- **[INTEGRATION_BOUNDARY.md](./INTEGRATION_BOUNDARY.md)** — Contract interface reference
- **[SCHEMA_VERIFICATION.md](./SCHEMA_VERIFICATION.md)** — How to verify schema compatibility
- **[ARCHITECTURE.md](../ARCHITECTURE.md)** — System-wide architecture
- **[CHANGELOG.md](../../CHANGELOG.md)** — Version history and breaking changes
