**Tikka SDK v0.1.0**

***

# Tikka SDK

NestJS library for Soroban contract interaction: transaction building, simulation, fee estimation, signing, and submission. The frontend and third-party integrators use this instead of calling Soroban directly.

**Stack:** NestJS, TypeScript, Stellar SDK. Published as `@tikka/sdk`.

**Consumers:** Frontend (client), third-party developers.

## Core Features

- **Customizable RpcService**: Support for custom fetch clients, headers, and automatic failover across multiple nodes.
- **Automatic RPC Retries**: Built-in retry with exponential backoff for transient 429/5xx/timeout errors, with per-call opt-out.
- **Contract Interaction**: Type-safe transaction building and simulation for Soroban contracts.
- **Wallet Integration**: Unified `WalletAdapter` interface supporting Freighter, xBull, and Albedo.
- **Local Mocking Utilities**: `MockWalletAdapter` and `MockRpcService` for Storybook, UI tests, and offline development.
- **Modular Design**: Domain-specific modules for Raffles, Tickets, and Users.

## Read-Only Entry Point (`@tikka/sdk/read`)

Consumers that only need to **query** raffle data (public dashboards, SSR pages, analytics) can import from the read-only sub-path. This avoids bundling wallet adapters and signing code, producing a significantly smaller bundle.

```ts
import { ReadOnlyRaffleService, ReadOnlyUserService, RpcService, resolveNetworkConfig } from '@tikka/sdk/read';

const networkConfig = resolveNetworkConfig('mainnet');
const rpcService = new RpcService(networkConfig);

const raffleService = new ReadOnlyRaffleService(rpcService, networkConfig);
const userService = new ReadOnlyUserService(rpcService, networkConfig);

// List all raffle IDs
const { value: allIds } = await raffleService.getAll();

// Fetch a single raffle
const { value: raffle } = await raffleService.getById(42);

// User participation profile
const { value: profile } = await userService.getProfile('GBIQ4VH3...');

// User raffle ID history
const { value: history } = await userService.getHistory('GBIQ4VH3...');
```

### What is included

| Export | Description |
|--------|-------------|
| `ReadOnlyRaffleService` | `getAll()` — all raffle IDs; `getById(id)` — single raffle data |
| `ReadOnlyUserService` | `getProfile(addr)` — participation stats; `getHistory(addr)` — raffle IDs |
| `RpcService` | Soroban RPC client (simulate, getLedger) |
| `HorizonService` | Horizon account/fee queries |
| `resolveNetworkConfig`, `NetworkConfig` | Network configuration helpers |
| `ContractFn`, `RaffleStatus` | Contract constants |
| `ContractResponse` | Shared response envelope type |
| Read-only types | `RaffleData`, `UserParticipation`, `AssetDescriptor`, etc. |
| Utils | Formatting, validation, errors, retry, BigNumber |

### What is excluded

The read-only bundle intentionally excludes all signing-related code:
- `ContractService` (requires wallet + TransactionBuilder)
- `TransactionLifecycle` (requires wallet + signing)
- All wallet adapters (Freighter, xBull, Albedo, LOBSTR, Rabet)
- `FeeEstimatorService`
- `sep10` auth helpers
- Write-side service classes (`RaffleService`, `TicketService`)
- NestJS modules

### Building the read-only bundle

```bash
cd sdk
pnpm run build:read   # outputs to dist/read/
```

## Project Structure

- `src/network/` — Customizable Soroban RPC and Horizon services.
- `src/contract/` — Core transaction logic and Soroban bindings.
- `src/wallet/` — Multi-wallet adapter system.
- `src/modules/` — Feature modules (Raffle, Ticket, User).
- `src/utils/` — Shared utilities for formatting, validation, and error handling.
- `bin/tikka.cjs` — Developer CLI for network testing and contract interaction.

## CLI Commands

The Tikka SDK includes a command-line interface for smoke testing, network configuration, and contract interaction.

### Installation

After building the SDK:
```bash
npm run build
npm run cli -- --help
```

### Global Options

- `-n, --network <type>` — Target network: `testnet` (default) or `mainnet`
- `-j, --json` — Output results in JSON format (useful for scripting)
- `--help` — Show help for a command
- `--version` — Show CLI version

### Read-Only Commands (no secrets required)

These commands don't require wallet signing and are safe for smoke testing:

#### `config-check`
Verify CLI configuration and SDK initialization.
```bash
tikka config-check                 # Check on testnet
tikka -n mainnet config-check      # Check on mainnet
tikka config-check --json          # Output as JSON
```

#### `fee-quote <contractId>`
Get estimated fees for a transaction.
```bash
tikka fee-quote CONTRACT_ABC123
tikka fee-quote CONTRACT_ABC123 --function transfer
tikka fee-quote CONTRACT_ABC123 --json
tikka -n mainnet fee-quote CONTRACT_ABC123
```

#### `read <contractId>`
Read contract data or state.
```bash
tikka read CONTRACT_ABC123
tikka read CONTRACT_ABC123 --key account_balance
tikka read CONTRACT_ABC123 --json
tikka -n mainnet read CONTRACT_ABC123
```

#### `list`
List active raffles on the network.
```bash
tikka list                    # List on testnet
tikka list --limit 20         # Limit results
tikka list --json             # Output as JSON
tikka -n mainnet list         # List on mainnet
```

#### `info`
Get contract status and network information.
```bash
tikka info                    # Get info on testnet
tikka info --json             # Output as JSON
tikka -n mainnet info         # Get info on mainnet
```

### Interactive Commands (wallet signing required)

These commands require wallet integration for signing transactions:

#### `create`
Create a new raffle (interactive).
```bash
tikka create              # Guided setup on testnet
tikka -n mainnet create   # Guided setup on mainnet
```

#### `buy`
Purchase raffle tickets (interactive).
```bash
tikka buy                 # Purchase on testnet
tikka -n mainnet buy      # Purchase on mainnet
```

### Examples

```bash
# Smoke test network configuration
cd sdk
npm run build
npm run cli -- config-check

# Get fee estimate for a contract (testnet)
npm run cli -- fee-quote CBVG2R3YLEDVGIQKHY6K2HGX55CPJMK5QX2YQE7WALLVIQG5IHVIGISQ

# Query contract state on mainnet
npm run cli -- -n mainnet read CBVG2R3YLEDVGIQKHY6K2HGX55CPJMK5QX2YQE7WALLVIQG5IHVIGISQ --json

# List raffles as JSON for automation
npm run cli -- list --json > raffles.json

# Get help for a specific command
npm run cli -- fee-quote --help
```

### JSON Output

All commands support the `--json` flag for machine-readable output:

```bash
# Output as JSON
$ tikka config-check --json
{
  "version": "0.1.0",
  "network": "testnet",
  "rpcAvailable": true,
  "contractAvailable": true,
  "status": "OK"
}

# Errors also format as JSON
$ tikka fee-quote INVALID --json
{
  "error": "Invalid contract ID"
}
```

### Error Handling

The CLI provides safe error messages that don't leak sensitive information:

- **Read-only commands** fail gracefully with helpful error messages
- **Interactive commands** confirm before executing wallet operations
- **JSON output** includes error details in structured format
- **Invalid commands** suggest the help flag for usage information

## API Documentation

Full TypeDoc reference is auto-generated and hosted on GitHub Pages:
**[crackedstudio.github.io/tikka](https://crackedstudio.github.io/tikka)**

To build locally:
```bash
npm run docs        # generates sdk/docs/
npm run docs:watch  # rebuilds on file change
```

## SEP-10 Backend Integration

The SDK includes SEP-10 helpers for building and verifying Stellar web authentication challenges.

### Server-side challenge creation

```ts
import { buildChallenge } from '@tikka/sdk';
import { Networks } from '@stellar/stellar-sdk';

const challengeXdr = buildChallenge({
  serverSecret: process.env.SEP10_SERVER_SECRET!,
  clientAccount: clientPublicKey,
  anchorDomain: 'example.com',
  webAuthDomain: 'auth.example.com',
  timeout: 300,
  networkPassphrase: Networks.TESTNET,
});

return { xdr: challengeXdr };
```

### Server-side response verification

```ts
import { Sep10VerificationError, Sep10VerificationErrorCode, verifyResponse } from '@tikka/sdk';
import { Networks } from '@stellar/stellar-sdk';

const verifiedClient = await verifyResponse({
  signedChallenge: responseXdr,
  serverAccount: serverPublicKey,
  clientAccount: clientPublicKey,
  anchorDomain: 'example.com',
  networkPassphrase: Networks.TESTNET,
  nonceValidator: async (nonceBase64) => {
    const key = `sep10:nonce:${nonceBase64}`;
    const added = await redis.set(key, '1', { NX: true, EX: 300 });
    return added === 'OK';
  },
});

console.log('Authenticated client:', verifiedClient);
```

### Handling verification failures

```ts
try {
  await verifyResponse(...);
} catch (err) {
  if (err instanceof Sep10VerificationError) {
    if (err.code === Sep10VerificationErrorCode.ChallengeExpired) {
      // prompt client to request a new challenge
    }
  }
  throw err;
}
```

The docs are organized by module: **Raffle** · **Ticket** · **Wallet** · **User** · **Network** · **Utils**.

## Architecture

Full ecosystem spec: [../docs/ARCHITECTURE.md](_media/ARCHITECTURE.md) (section 2 — tikka-sdk).

## Examples

All runnable examples live in [`examples/`](_media/examples). They use `MockWalletAdapter` so they compile and run without a browser wallet — swap it for `FreighterAdapter` or another adapter when you need real signing.

**Setup:**
```bash
cp examples/.env.example examples/.env
# fill in TIKKA_PUBLIC_KEY and any other vars you need
```

**Type-check all examples (no network required):**
```bash
npm run examples:check
```

### [quickstart.ts](_media/quickstart.ts)

End-to-end walkthrough: bootstrap → create raffle → buy tickets → read state.

| Env var | Required | Default | Description |
|---|---|---|---|
| `TIKKA_NETWORK` | no | `testnet` | `testnet` \| `mainnet` \| `standalone` |
| `TIKKA_PUBLIC_KEY` | no | mock key | Stellar G… address |

```bash
TIKKA_NETWORK=testnet npx ts-node examples/quickstart.ts
```

### [create-raffle.ts](_media/create-raffle.ts)

Create a new raffle on-chain with configurable price, asset, and duration.

| Env var | Required | Default | Description |
|---|---|---|---|
| `TIKKA_NETWORK` | no | `testnet` | Network |
| `TIKKA_PUBLIC_KEY` | **yes** | — | Signer address |
| `TIKKA_TICKET_PRICE` | no | `1` | Amount per ticket |
| `TIKKA_ASSET_CODE` | no | `XLM` | Asset code |
| `TIKKA_ASSET_ISSUER` | no | `""` | Issuer for non-native assets |
| `TIKKA_MAX_TICKETS` | no | `50` | Max tickets available |
| `TIKKA_DURATION_HOURS` | no | `24` | Hours until raffle closes |
| `TIKKA_METADATA_CID` | no | `""` | IPFS CID for metadata |

```bash
TIKKA_PUBLIC_KEY=G... npx ts-node examples/create-raffle.ts
# USDC example:
TIKKA_ASSET_CODE=USDC TIKKA_ASSET_ISSUER=GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN \
  TIKKA_PUBLIC_KEY=G... npx ts-node examples/create-raffle.ts
```

### [buy-tickets.ts](_media/buy-tickets.ts)

Purchase tickets for an existing raffle, with pre-flight status checks.

| Env var | Required | Default | Description |
|---|---|---|---|
| `TIKKA_NETWORK` | no | `testnet` | Network |
| `TIKKA_PUBLIC_KEY` | **yes** | — | Buyer address |
| `TIKKA_RAFFLE_ID` | **yes** | — | Numeric raffle ID |
| `TIKKA_QUANTITY` | no | `1` | Number of tickets |

```bash
TIKKA_PUBLIC_KEY=G... TIKKA_RAFFLE_ID=1 npx ts-node examples/buy-tickets.ts
```

### [listen-events.ts](_media/listen-events.ts)

Poll Soroban contract events (`RaffleCreated`, `TicketPurchased`, `RaffleFinalized`) with optional raffle filter. Runs until Ctrl+C.

> **Network required** — connects to the Soroban RPC to stream events.

| Env var | Required | Default | Description |
|---|---|---|---|
| `TIKKA_NETWORK` | no | `testnet` | Network |
| `TIKKA_RAFFLE_ID` | no | all | Filter events for one raffle |
| `TIKKA_POLL_MS` | no | `5000` | Polling interval (ms) |
| `TIKKA_CONTRACT_ID` | no | built-in | Override contract address |

```bash
TIKKA_NETWORK=testnet npx ts-node examples/listen-events.ts
# filter to raffle #1:
TIKKA_RAFFLE_ID=1 npx ts-node examples/listen-events.ts
```

### [offline-signing.ts](_media/offline-signing.ts)

Cold-wallet / air-gapped signing flow. Step 1 builds an unsigned XDR; Step 3 submits a pre-signed XDR. Useful for multisig and hardware wallets.

> **Network required** — Step 1 calls `simulateTransaction`; Step 3 submits to the network.

| Env var | Required | Default | Description |
|---|---|---|---|
| `TIKKA_NETWORK` | no | `testnet` | Network |
| `TIKKA_PUBLIC_KEY` | **yes** | — | Source account address |
| `TIKKA_SIGNED_XDR` | no | — | Provide to skip to Step 3 (submit) |

```bash
# Step 1 — build unsigned XDR:
TIKKA_PUBLIC_KEY=G... npx ts-node examples/offline-signing.ts

# Step 3 — submit after signing offline:
TIKKA_PUBLIC_KEY=G... TIKKA_SIGNED_XDR=<xdr> npx ts-node examples/offline-signing.ts
```

### [albedo-wallet.ts](_media/albedo-wallet.ts) · [rabet-wallet.ts](_media/rabet-wallet.ts)

Browser-wallet integration demos. These require a browser environment (Albedo opens a popup; Rabet needs the extension installed).

> **Browser + wallet required** — not runnable via `ts-node` in a plain terminal.

## Wallet Adapters

The SDK provides a unified interface for multiple Stellar wallets. All adapters implement the same `WalletAdapter` interface with `getPublicKey()` and `signTransaction(xdr)` methods.

### Supported Wallets

| Wallet | Installation | Notes |
|---|---|---|
| Freighter | Browser extension | Most popular, requires extension |
| xBull | Browser extension / PWA | Mobile-friendly |
| Albedo | Web-based | No extension required, popup-based |
| LOBSTR | Browser extension | Large user base |
| Rabet | Browser extension | Lightweight, open-source |

### Albedo Wallet

Albedo is a web-based wallet that doesn't require browser extensions. It opens a popup window for authentication and transaction signing, making it ideal for users who prefer not to install extensions.

**Key Features:**
- No browser extension required
- Works in any modern browser
- Popup-based authentication
- Supports message signing for SIWS (Sign In With Stellar)
- Network switching support

**Installation:**
```bash
npm install @albedo-link/intent
```

**Basic Usage:**
```typescript
import { AlbedoAdapter } from '@tikka/sdk';
import { Networks } from '@stellar/stellar-sdk';

// Create adapter with network configuration
const adapter = new AlbedoAdapter({
  networkPassphrase: Networks.TESTNET
});

// Check availability (always true in browser)
if (adapter.isAvailable()) {
  // Get public key (opens Albedo popup)
  const publicKey = await adapter.getPublicKey();
  console.log('User public key:', publicKey);
  
  // Sign transaction (opens Albedo popup)
  const { signedXdr } = await adapter.signTransaction(xdr, {
    networkPassphrase: Networks.TESTNET
  });
  
  // Sign message for authentication
  const signature = await adapter.signMessage('Sign in to MyApp');
}
```

**Advanced Usage:**
```typescript
// Specify which account should sign (for multi-account users)
const { signedXdr } = await adapter.signTransaction(xdr, {
  networkPassphrase: Networks.TESTNET,
  accountToSign: 'GBQW4KLMRXIMSDWBEWX4AWQKWYW7R3E7SFPSHTUDTFFT22NNUC6COL72'
});

// Get configured network
const network = await adapter.getNetwork();
console.log('Network:', network);
```

**Error Handling:**
```typescript
import { TikkaSdkError, TikkaSdkErrorCode } from '@tikka/sdk';

try {
  const publicKey = await adapter.getPublicKey();
} catch (err) {
  if (err instanceof TikkaSdkError) {
    switch (err.code) {
      case TikkaSdkErrorCode.UserRejected:
        console.log('User cancelled the request');
        break;
      case TikkaSdkErrorCode.WalletNotInstalled:
        console.log('@albedo-link/intent package not installed');
        break;
      default:
        console.log('Unknown error:', err.message);
    }
  }
}
```

**Complete Example:**
See [examples/albedo-wallet.ts](_media/albedo-wallet.ts) for a full working example.

### Rabet Wallet

Rabet is a lightweight, open-source browser extension wallet for Stellar. It provides a simple and secure way to manage Stellar assets and interact with dApps.

**Key Features:**
- Lightweight browser extension
- Open-source and community-driven
- Simple and intuitive interface
- Supports transaction signing
- Network switching support

**Installation:**
Rabet doesn't require an npm package - it uses the global `window.rabet` object injected by the browser extension.

**Basic Usage:**
```typescript
import { RabetAdapter } from '@tikka/sdk';
import { Networks } from '@stellar/stellar-sdk';

// Create adapter with network configuration
const adapter = new RabetAdapter({
  networkPassphrase: Networks.TESTNET
});

// Check if Rabet extension is installed
if (adapter.isAvailable()) {
  // Get public key (prompts user to connect)
  const publicKey = await adapter.getPublicKey();
  console.log('User public key:', publicKey);
  
  // Sign transaction
  const { signedXdr } = await adapter.signTransaction(xdr, {
    networkPassphrase: Networks.TESTNET
  });
}
```

**Advanced Usage:**
```typescript
// Use different network
const { signedXdr } = await adapter.signTransaction(xdr, {
  networkPassphrase: Networks.PUBLIC
});

// Get configured network
const network = await adapter.getNetwork();
console.log('Network:', network);
```

**Error Handling:**
```typescript
import { TikkaSdkError, TikkaSdkErrorCode } from '@tikka/sdk';

try {
  const publicKey = await adapter.getPublicKey();
} catch (err) {
  if (err instanceof TikkaSdkError) {
    switch (err.code) {
      case TikkaSdkErrorCode.UserRejected:
        console.log('User cancelled the request');
        break;
      case TikkaSdkErrorCode.WalletNotInstalled:
        console.log('Rabet extension not installed. Get it at https://rabet.io');
        break;
      default:
        console.log('Unknown error:', err.message);
    }
  }
}
```

**Important Notes:**
- Rabet requires a network passphrase for transaction signing
- Message signing is not supported by Rabet
- Users must have the Rabet browser extension installed from [rabet.io](https://rabet.io)

### General Wallet Usage

```typescript
import { FreighterAdapter, XBullAdapter, AlbedoAdapter, LobstrAdapter, RabetAdapter } from '@tikka/sdk';

// Create adapter instance
const adapter = new FreighterAdapter({
  networkPassphrase: Networks.TESTNET
});

// Check availability
if (adapter.isAvailable()) {
  // Get public key
  const publicKey = await adapter.getPublicKey();
  
  // Sign transaction
  const { signedXdr } = await adapter.signTransaction(xdr, {
    networkPassphrase: Networks.TESTNET
  });
}
```

### Selecting Adapters

You can select adapters by name or auto-detect available wallets:

```typescript
const adapters = {
  freighter: new FreighterAdapter(),
  xbull: new XBullAdapter(),
  albedo: new AlbedoAdapter(),
  lobstr: new LobstrAdapter(),
};

// Check which are available
const availableAdapters = Object.entries(adapters)
  .filter(([, adapter]) => adapter.isAvailable())
  .map(([name]) => name);

// Auto-select first available
const selectedAdapter = availableAdapters[0] ? adapters[availableAdapters[0]] : null;
```

## React Native Notes

- Provide a fetch implementation explicitly when needed:
  - `new RpcService(networkConfig, { endpoint, fetchClient: fetch })`
- Wallet adapters that rely on browser extension globals are not available in React Native; use app-native signing or the mock adapter for local prototyping.
- Ensure required polyfills are present in your RN app entrypoint (`buffer`, `crypto`, and `stream` when your environment requires them).
