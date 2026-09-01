# Open Source Contribution Issues

This document contains well-scoped issues for contributors to work on. Each issue is designed to be completable within a single Wave cycle and includes clear context, implementation guidelines, and expectations.

**Complexity Levels:**
- **Trivial (100 points)**: Small, clearly bounded changes
- **Medium (150 points)**: Standard features touching multiple parts
- **High (200 points)**: Complex engineering work like integrations

---

## Issue #1: Integrate Stellar SDK and Configure RPC Connection

**Complexity:** Medium (150 points)  
**Status:** Open  
**Labels:** `blockchain`, `infrastructure`, `setup`

### Description

Install and configure the Stellar SDK with Soroban client support, and set up RPC connection configuration for both testnet and mainnet environments. This is foundational work required before implementing wallet integration and contract interactions.

### Requirements and Context

The project currently operates in demo mode without any blockchain connectivity. To enable real raffle operations, we need:

- Stellar SDK installed and configured
- Soroban client initialized
- RPC endpoint configuration for testnet (primary) and mainnet (future)
- Environment variable management for network selection
- Error handling for network connection failures

**Current State:**
- No Stellar SDK dependencies installed
- No RPC configuration exists
- Environment variables template exists in README but not implemented

**Reference Files:**
- `package.json` - Add dependencies here
- `src/config/supabase.ts` - Use as pattern for config structure
- `README.md` - Environment variables section (lines 263-279)

### Suggested Execution

1. **Fork the repo and create a branch**
   ```bash
   git checkout -b feature/stellar-sdk-setup
   ```

2. **Install dependencies**
   ```bash
   pnpm add @stellar/stellar-sdk
   pnpm add -D @types/node
   ```

3. **Create configuration file**
   - Create `src/config/stellar.ts`
   - Export network configuration (testnet/mainnet)
   - Export RPC URLs based on environment
   - Export Horizon URLs
   - Handle missing environment variables gracefully

4. **Create RPC client service**
   - Create `src/services/rpcService.ts`
   - Initialize Soroban RPC client
   - Implement connection health check
   - Handle connection errors with user-friendly messages

5. **Update environment setup**
   - Create `.env.example` with required variables
   - Document variables in DEVELOPMENT.md
   - Ensure fallback values for development

6. **Test and commit**
   - Test RPC connection to testnet
   - Verify environment variable loading
   - Test error handling for invalid configurations
   - Include test output in PR description

**Example commit message:**
```
feat: add Stellar SDK and RPC configuration

- Install @stellar/stellar-sdk
- Create stellar config with testnet/mainnet support
- Implement RPC service with connection handling
- Add environment variable management
```

### Guidelines

- **Assignment required before starting**
- PR description must include: `Closes #[issue_id]`
- Must handle both testnet and mainnet (use testnet as default)
- Include TypeScript types for all configurations
- Add error handling for network failures
- Update DEVELOPMENT.md with new environment variables

### Acceptance Criteria

- [ ] Stellar SDK installed and configured
- [ ] RPC service created with testnet connection working
- [ ] Environment variables properly loaded and validated
- [ ] Error handling implemented for connection failures
- [ ] Documentation updated (DEVELOPMENT.md, .env.example)
- [ ] Code follows existing TypeScript patterns
- [ ] No console errors in browser console

---

## Issue #2: Implement Stellar Wallet Service with Freighter Integration

**Complexity:** High (200 points)  
**Status:** Open  
**Labels:** `blockchain`, `wallet`, `integration`

### Description

Build a comprehensive wallet service that integrates with Freighter (Stellar's browser extension wallet) to enable wallet connection, account management, and transaction signing. This service will replace the current demo mode and enable real blockchain interactions.

### Requirements and Context

Currently, the app shows a "Demo Mode" badge instead of wallet functionality. Users need to connect their Stellar wallets to participate in raffles. This issue implements the core wallet infrastructure.

**Current State:**
- `src/components/WalletButton.tsx` shows static "Demo Mode" badge
- No wallet service exists
- No wallet state management

**Design Reference:**
- See `design.md` for UI/UX patterns
- Wallet button should match existing design system (dark theme, rounded borders)

**Key Requirements:**
- Support Freighter wallet (primary)
- Detect wallet installation
- Handle wallet connection/disconnection
- Get and display account address
- Sign transactions (preparation for future issues)
- Manage wallet state across app
- Handle wallet errors gracefully

### Suggested Execution

1. **Fork the repo and create a branch**
   ```bash
   git checkout -b feature/wallet-service
   ```

2. **Install Freighter SDK**
   ```bash
   pnpm add @stellar/freighter-api
   ```

3. **Create wallet service**
   - Create `src/services/walletService.ts`
   - Implement `connectWallet()` function
   - Implement `disconnectWallet()` function
   - Implement `getAccountAddress()` function
   - Implement `isWalletInstalled()` check
   - Implement `signTransaction()` (for future use)
   - Handle wallet state (connected/disconnected/error)

4. **Create wallet context/hook**
   - Create `src/hooks/useWallet.ts`
   - Manage wallet connection state
   - Provide wallet address to components
   - Handle wallet events (connect/disconnect)
   - Persist connection state (optional: localStorage)

5. **Update WalletButton component**
   - Replace demo mode badge with wallet connection UI
   - Show "Connect Wallet" when disconnected
   - Show truncated address when connected (e.g., "GABC...XYZ")
   - Add disconnect functionality
   - Handle loading states during connection
   - Show error messages for failed connections

6. **Add wallet provider** (if using context)
   - Create `src/providers/WalletProvider.tsx`
   - Wrap app with provider in `App.tsx`
   - Manage global wallet state

7. **Test and commit**
   - Test with Freighter extension installed
   - Test without Freighter (show installation prompt)
   - Test connection/disconnection flow
   - Test error scenarios (user rejection, network errors)
   - Include screenshots of wallet connection UI in PR

**Example commit message:**
```
feat: implement Freighter wallet integration

- Add @stellar/freighter-api dependency
- Create walletService with connect/disconnect/sign functions
- Implement useWallet hook for wallet state management
- Update WalletButton with real wallet connection UI
- Add wallet error handling and user feedback
```

### Guidelines

- **Assignment required before starting**
- PR description must include: `Closes #[issue_id]`
- Must handle Freighter not installed (show helpful message)
- UI must match existing design system
- Include loading states during wallet operations
- Handle all error cases gracefully
- Consider mobile responsiveness

### Acceptance Criteria

- [ ] Wallet service created with all core functions
- [ ] Freighter integration working (connect/disconnect)
- [ ] WalletButton shows connected state with address
- [ ] Error handling for missing wallet, rejected connections
- [ ] Loading states during wallet operations
- [ ] Wallet state persists across page refreshes (optional)
- [ ] UI matches design system (dark theme, styling)
- [ ] Mobile responsive wallet button
- [ ] No console errors or warnings

---

## Issue #3: Create Soroban Contract Configuration and Service Layer

**Complexity:** High (200 points)  
**Status:** Open  
**Labels:** `blockchain`, `contracts`, `soroban`

### Description

Build the contract service layer that will handle all interactions with the Soroban raffle smart contract. This includes contract configuration, function definitions, and a service class for reading and writing contract data.

### Requirements and Context

The raffle contract needs to be integrated into the frontend. This issue creates the infrastructure for contract interactions, though the actual contract address may be TBD initially.

**Current State:**
- No contract configuration exists
- No contract service exists
- Contract address is "TBD" in README
- Contract ABI/interface not defined

**Contract Functions Needed** (based on README):
- `create_raffle()` - Create new raffle
- `buy_ticket()` - Purchase ticket
- `get_raffle_data()` - Get raffle information
- `get_active_raffle_ids()` - Get active raffles
- `get_all_raffle_ids()` - Get all raffles
- `get_user_raffle_participation()` - Get user's participation

**Reference:**
- README.md lines 339-361 show expected contract interface
- Use RPC service from Issue #1

### Suggested Execution

1. **Fork the repo and create a branch**
   ```bash
   git checkout -b feature/contract-service
   ```

2. **Create contract configuration**
   - Create `src/config/contract.ts`
   - Define contract address (use env variable with fallback)
   - Define contract interface/ABI structure
   - Export contract constants

3. **Create contract service**
   - Create `src/services/contractService.ts`
   - Initialize Soroban client (use RPC service)
   - Implement `getRaffleData(raffleId)` - read function
   - Implement `getActiveRaffleIds()` - read function
   - Implement `getAllRaffleIds()` - read function
   - Implement `getUserParticipation(address)` - read function
   - Implement `createRaffle(params)` - write function (preparation)
   - Implement `buyTicket(raffleId, amount)` - write function (preparation)
   - Handle contract errors and parse responses

4. **Create contract types**
   - Update `src/types/types.ts`
   - Add `ContractRaffleData` interface
   - Add `ContractUserParticipation` interface
   - Add contract function parameter types
   - Add contract response types

5. **Add error handling**
   - Define contract-specific error types
   - Handle network errors
   - Handle contract execution errors
   - Provide user-friendly error messages

6. **Test and commit**
   - Test read functions with mock/test contract (if available)
   - Test error handling for invalid contract address
   - Test error handling for network failures
   - Document contract interface in code comments
   - Include example usage in PR description

**Example commit message:**
```
feat: add Soroban contract configuration and service

- Create contract config with address and interface
- Implement contractService with read/write functions
- Add TypeScript types for contract data
- Handle contract errors and network failures
- Prepare for wallet integration in future issues
```

### Guidelines

- **Assignment required before starting**
- PR description must include: `Closes #[issue_id]`
- Contract address can be placeholder initially (document this)
- Focus on read functions first (write functions can be stubs)
- Use TypeScript strictly (no `any` types)
- Include JSDoc comments for all functions
- Handle all error cases

### Acceptance Criteria

- [ ] Contract configuration file created
- [ ] Contract service with all read functions implemented
- [ ] Write function stubs created (for future issues)
- [ ] TypeScript types defined for all contract data
- [ ] Error handling for network and contract errors
- [ ] Code documented with JSDoc comments
- [ ] Service integrates with RPC service from Issue #1
- [ ] No TypeScript errors
- [ ] Follows existing code patterns

---

## Issue #4: Replace Demo Data with Real Contract Calls

**Complexity:** Medium (150 points)  
**Status:** Open  
**Dependencies:** Issue #3 (Contract Service)  
**Labels:** `data`, `integration`, `refactoring`

### Description

Replace the demo/mock data system with real contract calls to fetch raffle data from the Soroban contract. Update all hooks and components to use live blockchain data instead of static demo data.

### Requirements and Context

Currently, the app uses `src/data/demoRaffles.ts` and mock hooks to display raffles. This needs to be replaced with real contract interactions to fetch actual raffle data from the blockchain.

**Current State:**
- `src/hooks/useRaffles.ts` uses demo data
- `src/data/demoRaffles.ts` contains 6 mock raffles
- Components display demo raffles throughout the app

**Files to Update:**
- `src/hooks/useRaffles.ts` - Replace demo logic
- `src/pages/Home.tsx` - May need updates for loading states
- `src/components/landing/TrendingRaffles.tsx` - Uses useRaffles hook
- `src/pages/RaffleDetails.tsx` - Uses useRaffle hook
- `src/pages/MyRaffles.tsx` - Uses useRaffle hook

**Reference:**
- Contract service from Issue #3
- Existing demo data structure in `src/data/demoRaffles.ts`

### Suggested Execution

1. **Fork the repo and create a branch**
   ```bash
   git checkout -b feature/replace-demo-data
   ```

2. **Update useRaffles hook**
   - Modify `src/hooks/useRaffles.ts`
   - Replace `demoRaffles` import with contract service
   - Update `useActiveRaffles()` to call `contractService.getActiveRaffleIds()`
   - Update `useRaffle(raffleId)` to call `contractService.getRaffleData()`
   - Add proper loading states
   - Add error handling
   - Transform contract data to match existing component expectations

3. **Update data transformation**
   - Create helper function to transform contract data to UI format
   - Ensure countdown, progress, and formatting match existing UI
   - Handle metadata fetching from Supabase (if needed)
   - Maintain backward compatibility with component props

4. **Update components for loading states**
   - Ensure all components handle loading states properly
   - Add skeleton loaders where appropriate
   - Handle empty states (no raffles found)
   - Handle error states gracefully

5. **Remove or deprecate demo data**
   - Keep `demoRaffles.ts` for now (can be removed later)
   - Add comment indicating it's deprecated
   - Or remove entirely if confident in contract integration

6. **Test and commit**
   - Test with real contract (or mock contract responses)
   - Test loading states
   - Test error states
   - Test empty states
   - Verify UI still works correctly
   - Include before/after screenshots in PR

**Example commit message:**
```
feat: replace demo data with real contract calls

- Update useRaffles hook to fetch from Soroban contract
- Add data transformation layer for contract responses
- Implement loading and error states
- Update components to handle async data fetching
- Deprecate demoRaffles.ts
```

### Guidelines

- **Assignment required before starting**
- PR description must include: `Closes #[issue_id]`
- Must maintain existing component interfaces (don't break UI)
- Handle all edge cases (no raffles, network errors, etc.)
- Preserve existing UI/UX behavior
- Add proper TypeScript types

### Acceptance Criteria

- [ ] useRaffles hook fetches from contract instead of demo data
- [ ] Loading states implemented and working
- [ ] Error states handled gracefully
- [ ] Empty states handled (no raffles found)
- [ ] UI components still render correctly
- [ ] Data transformation maintains existing format
- [ ] No breaking changes to component props
- [ ] Demo data file deprecated or removed
- [ ] All TypeScript types correct

---

## Issue #5: Implement Real Raffle Creation with Contract Integration

**Complexity:** High (200 points)  
**Status:** Open  
**Dependencies:** Issue #2 (Wallet Service), Issue #3 (Contract Service)  
**Labels:** `feature`, `blockchain`, `contracts`

### Description

Implement the complete raffle creation flow that uploads metadata to Supabase, creates a raffle on the Soroban contract, and links them together. This enables users to create real raffles on the blockchain.

### Requirements and Context

Currently, the raffle creation form exists but only simulates creation. This issue implements the full end-to-end flow including metadata storage, contract interaction, and transaction handling.

**Current State:**
- `src/pages/CreateRaffle.tsx` - Multi-step form exists
- `src/components/CreateRaffleButton.tsx` - Has demo flow only
- `src/services/metadataService.ts` - Ready for use
- Contract service exists (from Issue #3)

**User Flow:**
1. User fills out raffle creation form
2. Upload metadata to Supabase
3. Get metadata record ID
4. Create raffle on contract with metadata reference
5. Link Supabase record to contract raffle ID
6. Show success/error feedback

**Key Requirements:**
- Integrate with wallet service (user must be connected)
- Upload metadata to Supabase first
- Call contract `create_raffle()` function
- Link metadata record to contract raffle ID
- Handle transaction confirmation
- Show progress during creation
- Handle errors at each step

### Suggested Execution

1. **Fork the repo and create a branch**
   ```bash
   git checkout -b feature/real-raffle-creation
   ```

2. **Update CreateRaffleButton component**
   - Modify `src/components/CreateRaffleButton.tsx`
   - Add wallet connection check (use wallet service)
   - Implement real creation flow:
     a. Upload metadata to Supabase
     b. Get metadata record ID
     c. Build contract parameters
     d. Sign and submit transaction
     e. Wait for confirmation
     f. Link metadata to contract ID
   - Update progress modal with real steps
   - Handle errors at each step

3. **Create transaction helpers**
   - Create helper to build contract parameters
   - Convert form data to contract format
   - Handle XLM/asset price conversion
   - Calculate end time from duration

4. **Update metadata service** (if needed)
   - Ensure `uploadRaffleMetadata()` works correctly
   - Ensure `linkToContract()` works correctly
   - Add error handling

5. **Update success modal**
   - Show real contract raffle ID
   - Show real transaction hash
   - Link to Stellar explorer (if possible)
   - Update navigation to new raffle

6. **Add validation**
   - Validate form data before submission
   - Check wallet balance (if possible)
   - Validate ticket price format
   - Validate end time (must be future)

7. **Test and commit**
   - Test full creation flow on testnet
   - Test error scenarios (insufficient balance, network errors)
   - Test with different form inputs
   - Verify metadata links correctly
   - Include transaction hashes in PR description

**Example commit message:**
```
feat: implement real raffle creation with contract integration

- Integrate wallet service for transaction signing
- Upload metadata to Supabase before contract call
- Create raffle on Soroban contract
- Link metadata record to contract raffle ID
- Add transaction confirmation handling
- Update progress modal with real steps
- Add form validation and error handling
```

### Guidelines

- **Assignment required before starting**
- PR description must include: `Closes #[issue_id]`
- Must require wallet connection before allowing creation
- Handle transaction fees (inform user)
- Show clear progress during multi-step process
- Handle rollback if metadata upload succeeds but contract fails
- Include user-friendly error messages

### Acceptance Criteria

- [ ] Wallet connection required before creation
- [ ] Metadata uploaded to Supabase successfully
- [ ] Raffle created on contract with correct parameters
- [ ] Metadata linked to contract raffle ID
- [ ] Transaction confirmation handled
- [ ] Progress modal shows real steps
- [ ] Error handling at each step
- [ ] Success modal shows real raffle ID and transaction hash
- [ ] Form validation prevents invalid submissions
- [ ] User redirected to new raffle after creation

---

## Issue #6: Implement Real Ticket Purchasing with Payment Transactions

**Complexity:** High (200 points)  
**Status:** Open  
**Dependencies:** Issue #2 (Wallet Service), Issue #3 (Contract Service)  
**Labels:** `feature`, `blockchain`, `payments`

### Description

Implement the complete ticket purchasing flow that allows users to buy raffle tickets by sending XLM or Stellar assets to the contract. This includes payment calculation, transaction signing, and UI updates.

### Requirements and Context

Currently, ticket purchasing is simulated with a demo flow. This issue implements real blockchain transactions for purchasing tickets.

**Current State:**
- `src/components/EnterRaffleButton.tsx` - Has demo flow only
- `src/components/EnterRaffle.tsx` - UI for ticket quantity selection
- Contract service exists (from Issue #3)

**User Flow:**
1. User selects ticket quantity
2. System calculates total cost
3. User confirms purchase
4. Transaction signed and submitted
5. Wait for confirmation
6. Update UI with new ticket count

**Key Requirements:**
- Integrate with wallet service
- Calculate total cost (ticket price × quantity)
- Handle XLM payments
- Handle Stellar asset payments (if supported)
- Sign and submit transaction
- Handle transaction confirmation
- Update UI optimistically
- Handle errors (insufficient balance, etc.)

### Suggested Execution

1. **Fork the repo and create a branch**
   ```bash
   git checkout -b feature/real-ticket-purchasing
   ```

2. **Update EnterRaffleButton component**
   - Modify `src/components/EnterRaffleButton.tsx`
   - Add wallet connection check
   - Implement real purchase flow:
     a. Calculate total cost
     b. Check wallet balance (if possible)
     c. Build transaction
     d. Sign transaction with wallet
     e. Submit to network
     f. Wait for confirmation
     g. Update UI
   - Handle loading states
   - Handle error states

3. **Update EnterRaffle component**
   - Modify `src/components/EnterRaffle.tsx` if needed
   - Show real ticket price from contract
   - Calculate and display total cost
   - Handle quantity selection
   - Show transaction fee estimate

4. **Create payment helpers**
   - Create helper to calculate total cost
   - Convert ticket price to proper format (stroops for XLM)
   - Handle asset payments (if applicable)
   - Calculate transaction fees

5. **Update ticket confirmation modal**
   - Show real transaction details
   - Show real cost breakdown
   - Show wallet address
   - Handle transaction submission

6. **Add balance checking** (if possible)
   - Check wallet balance before allowing purchase
   - Show error if insufficient balance
   - Include transaction fee in balance check

7. **Update UI after purchase**
   - Optimistically update ticket count
   - Refresh raffle data after confirmation
   - Show success message
   - Update "My Raffles" if applicable

8. **Test and commit**
   - Test single ticket purchase
   - Test multiple ticket purchase
   - Test with insufficient balance
   - Test error scenarios
   - Verify UI updates correctly
   - Include transaction hashes in PR

**Example commit message:**
```
feat: implement real ticket purchasing with payments

- Integrate wallet service for payment transactions
- Calculate ticket costs and total payment
- Sign and submit purchase transactions
- Handle transaction confirmation
- Update UI with new ticket counts
- Add balance checking and error handling
- Support XLM and asset payments
```

### Guidelines

- **Assignment required before starting**
- PR description must include: `Closes #[issue_id]`
- Must require wallet connection
- Handle transaction fees properly
- Show clear cost breakdown to user
- Implement optimistic UI updates
- Handle all error cases (balance, network, rejection)
- Consider gas/transaction fee estimation

### Acceptance Criteria

- [ ] Wallet connection required for purchase
- [ ] Ticket cost calculated correctly
- [ ] Transaction signed and submitted successfully
- [ ] Transaction confirmation handled
- [ ] UI updates with new ticket count
- [ ] Balance checking implemented (if possible)
- [ ] Error handling for insufficient balance
- [ ] Error handling for network failures
- [ ] Error handling for user rejection
- [ ] Success feedback shown to user
- [ ] Transaction details displayed correctly

---

## Issue #7: Add Environment Configuration and Documentation

**Complexity:** Trivial (100 points)  
**Status:** Open  
**Labels:** `documentation`, `configuration`, `setup`

### Description

Create comprehensive environment configuration setup with `.env.example` file and update documentation to guide developers through proper configuration for Stellar testnet and Supabase integration.

### Requirements and Context

The project needs clear environment variable documentation and example files to help developers set up the project correctly. Currently, environment variables are mentioned in README but not fully documented.

**Current State:**
- README mentions environment variables (lines 263-279)
- No `.env.example` file exists
- DEVELOPMENT.md doesn't cover environment setup in detail
- Supabase config exists but needs documentation

**Required Variables:**
- Stellar network configuration
- Contract address
- RPC URLs
- Supabase credentials
- Other service configurations

### Suggested Execution

1. **Fork the repo and create a branch**
   ```bash
   git checkout -b feature/env-config-docs
   ```

2. **Create .env.example file**
   - List all required environment variables
   - Include descriptions for each variable
   - Show example values (not real secrets)
   - Organize by category (Stellar, Supabase, etc.)

3. **Update DEVELOPMENT.md**
   - Add environment setup section
   - Explain how to create `.env` file
   - Explain where to get each value
   - Include links to Stellar testnet setup
   - Include links to Supabase setup

4. **Update README.md** (if needed)
   - Ensure environment section is accurate
   - Link to DEVELOPMENT.md for details
   - Update any outdated information

5. **Add validation** (optional)
   - Create simple script to validate env vars
   - Or add runtime validation in config files
   - Show helpful error messages for missing vars

6. **Test and commit**
   - Verify .env.example is complete
   - Test that a new developer can follow docs
   - Ensure no real secrets are exposed
   - Include example .env setup in PR description

**Example commit message:**
```
docs: add environment configuration and setup guide

- Create .env.example with all required variables
- Add environment setup section to DEVELOPMENT.md
- Document where to obtain each configuration value
- Add validation for required environment variables
- Update README with links to setup guide
```

### Guidelines

- **Assignment required before starting**
- PR description must include: `Closes #[issue_id]`
- Never include real secrets or API keys
- Use placeholder values in examples
- Make it easy for new contributors to get started
- Include links to external resources where helpful

### Acceptance Criteria

- [ ] `.env.example` file created with all variables
- [ ] Each variable has clear description
- [ ] DEVELOPMENT.md updated with setup instructions
- [ ] Links to external resources included
- [ ] No real secrets or keys exposed
- [ ] New developer can follow docs successfully
- [ ] README.md updated if needed
- [ ] Validation added (optional but recommended)

---

## Summary

These issues are designed to be tackled in order, with dependencies clearly marked. Each issue is scoped to be completable within a single Wave cycle and includes:

- Clear context and requirements
- Implementation guidelines without micromanaging
- Explicit acceptance criteria
- Appropriate complexity tags
- Real impact on the project

Contributors should read the full issue description, check dependencies, and request assignment before starting work.

