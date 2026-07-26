# Tikka SDK Examples

This directory contains runnable examples demonstrating common workflows with the Tikka SDK.

## Quick Start

1. **Copy the environment template:**
   ```bash
   cp .env.example .env
   ```

2. **Fill in your configuration** (see [Environment Variables](#environment-variables) below)

3. **Run an example** using `npm run` from the SDK root:
   ```bash
   npm run example:quickstart
   npm run example:create-raffle
   npm run example:buy-tickets
   npm run example:listen-events
   npm run example:offline-signing
   ```

## Examples

### [quickstart.ts](./quickstart.ts)

**Purpose:** End-to-end walkthrough demonstrating all major SDK features

**What it does:**
- Initializes the SDK with a network and wallet
- Creates a new raffle
- Purchases tickets
- Queries raffle state

**Environment variables required:**
- `TIKKA_NETWORK` (optional, defaults to testnet)
- `TIKKA_PUBLIC_KEY` (optional for testing)

**Run:**
```bash
npm run example:quickstart
```

**Notes:**
- Uses `MockWalletAdapter` by default for testing without a real wallet
- Swap `MockWalletAdapter` for `FreighterAdapter` or `XBullAdapter` in a browser environment

---

### [create-raffle.ts](./create-raffle.ts)

**Purpose:** Create a new raffle with custom parameters

**What it does:**
- Validates input parameters
- Creates a raffle with configurable:
  - Ticket price (XLM or any asset)
  - Asset type (native or issued)
  - Maximum tickets
  - Duration
  - Metadata (IPFS CID)

**Environment variables required:**
- `TIKKA_PUBLIC_KEY` ✓ (wallet creating the raffle)
- `TIKKA_NETWORK` (optional, defaults to testnet)

**Environment variables optional:**
- `TIKKA_TICKET_PRICE` (default: 1)
- `TIKKA_ASSET_CODE` (default: XLM)
- `TIKKA_ASSET_ISSUER` (for non-native assets)
- `TIKKA_MAX_TICKETS` (default: 50)
- `TIKKA_DURATION_HOURS` (default: 24)
- `TIKKA_METADATA_CID` (default: empty)

**Run:**
```bash
# Create XLM raffle
TIKKA_NETWORK=testnet TIKKA_PUBLIC_KEY=G... npm run example:create-raffle

# Create USDC raffle
TIKKA_ASSET_CODE=USDC \
TIKKA_ASSET_ISSUER=GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN \
TIKKA_PUBLIC_KEY=G... \
npm run example:create-raffle
```

---

### [buy-tickets.ts](./buy-tickets.ts)

**Purpose:** Purchase tickets for an existing raffle

**What it does:**
- Validates that a raffle exists and is open
- Checks ticket availability
- Purchases specified quantity of tickets
- Shows updated ticket holdings for the buyer

**Environment variables required:**
- `TIKKA_PUBLIC_KEY` ✓ (wallet buying tickets)
- `TIKKA_RAFFLE_ID` ✓ (which raffle to buy into)
- `TIKKA_NETWORK` (optional, defaults to testnet)

**Environment variables optional:**
- `TIKKA_QUANTITY` (default: 1)

**Run:**
```bash
TIKKA_NETWORK=testnet \
TIKKA_PUBLIC_KEY=G... \
TIKKA_RAFFLE_ID=1 \
TIKKA_QUANTITY=5 \
npm run example:buy-tickets
```

---

### [listen-events.ts](./listen-events.ts)

**Purpose:** Poll contract events (RaffleCreated, TicketPurchased, RaffleFinalized)

**What it does:**
- Connects to the Soroban RPC
- Polls for contract events every N milliseconds
- Displays event topics and values
- Optionally filters by raffle ID

**Environment variables required:**
- `TIKKA_NETWORK` (optional, defaults to testnet)

**Environment variables optional:**
- `TIKKA_RAFFLE_ID` (filter events for specific raffle)
- `TIKKA_POLL_MS` (polling interval, default: 5000ms)
- `TIKKA_CONTRACT_ID` (override contract address)

**Run:**
```bash
# Listen to all events
TIKKA_NETWORK=testnet npm run example:listen-events

# Filter for specific raffle
TIKKA_NETWORK=testnet TIKKA_RAFFLE_ID=1 npm run example:listen-events

# Poll every 2 seconds
TIKKA_NETWORK=testnet TIKKA_POLL_MS=2000 npm run example:listen-events
```

**Notes:**
- Press Ctrl+C to stop listening
- Network-required: needs active Soroban RPC connection

---

### [offline-signing.ts](./offline-signing.ts)

**Purpose:** Build transactions offline and sign them separately (air-gapped workflows, multisig)

**What it does:**
- **Step 1:** Builds an unsigned XDR for a sample operation
- **Step 2:** Output the XDR for signing (offline, hardware wallet, etc.)
- **Step 3:** Accepts a signed XDR and submits to the network

**Environment variables required:**
- `TIKKA_PUBLIC_KEY` ✓ (transaction source account)
- `TIKKA_NETWORK` (optional, defaults to testnet)

**Environment variables optional:**
- `TIKKA_SIGNED_XDR` (provide to skip Step 1, go straight to submission)

**Typical workflow:**

```bash
# Step 1: Build unsigned transaction
TIKKA_NETWORK=testnet \
TIKKA_PUBLIC_KEY=G... \
npm run example:offline-signing

# Output:
# unsignedXdr: AQAAA...
# simulatedResult: { ... }

# Step 2: Sign the XDR offline
# (hardware wallet, CLI, air-gapped machine, etc.)
# → produces signedXdr: BQAAA...

# Step 3: Submit the signed transaction
TIKKA_NETWORK=testnet \
TIKKA_PUBLIC_KEY=G... \
TIKKA_SIGNED_XDR=BQAAA... \
npm run example:offline-signing
```

---

### [estimate-fee.ts](./estimate-fee.ts)

**Purpose:** Preview XLM costs before signing (fee estimation)

**What it does:**
- Estimates fee for `buy_ticket` operation (write operation)
- Estimates fee for `get_raffle_data` operation (read-only)
- Shows breakdown: base fee, resource fee, CPU, disk I/O

**Environment variables required:**
- `TIKKA_PUBLIC_KEY` ✓ (transaction source)
- `TIKKA_RAFFLE_ID` (optional, default: 1)
- `TIKKA_NETWORK` (optional, defaults to testnet)

**Environment variables optional:**
- `TIKKA_QUANTITY` (default: 1)

**Run:**
```bash
TIKKA_NETWORK=testnet \
TIKKA_PUBLIC_KEY=G... \
TIKKA_RAFFLE_ID=42 \
npm run example:estimate-fee
```

**Output example:**
```
▶  buy_ticket(raffleId=42, quantity=1)
   Total fee    : 0.0025 XLM  (25000 stroops)
   Base fee     : 10000 stroops
   Res. fee     : 15000 stroops
   CPU          : 1,234,567 instructions
   Disk reads   : 12.5 KB
   Disk writes  : 8.2 KB
```

---

## Environment Variables Reference

See [.env.example](./.env.example) for a complete template.

### Core Configuration

| Variable | Example | Required? | Used In |
|----------|---------|-----------|---------|
| `TIKKA_NETWORK` | `testnet` \| `mainnet` \| `standalone` | No (default: `testnet`) | All examples |
| `TIKKA_PUBLIC_KEY` | `GBIQ4VH3...` | ✓ for most | `create-raffle`, `buy-tickets`, `estimate-fee`, `offline-signing` |

### Raffle & Ticket Parameters

| Variable | Example | Default | Used In |
|----------|---------|---------|---------|
| `TIKKA_RAFFLE_ID` | `1` | — | `buy-tickets`, `listen-events`, `estimate-fee` |
| `TIKKA_QUANTITY` | `5` | `1` | `buy-tickets`, `estimate-fee` |
| `TIKKA_TICKET_PRICE` | `1.5` | `1` | `create-raffle` |
| `TIKKA_MAX_TICKETS` | `100` | `50` | `create-raffle` |
| `TIKKA_DURATION_HOURS` | `48` | `24` | `create-raffle` |

### Asset Configuration

| Variable | Example | Default | Used In |
|----------|---------|---------|---------|
| `TIKKA_ASSET_CODE` | `USDC` | `XLM` | `create-raffle` |
| `TIKKA_ASSET_ISSUER` | `GA5ZS...` | — | `create-raffle` |
| `TIKKA_METADATA_CID` | `Qm...` | — | `create-raffle` |

### Event Listening

| Variable | Example | Default | Used In |
|----------|---------|---------|---------|
| `TIKKA_POLL_MS` | `2000` | `5000` | `listen-events` |
| `TIKKA_CONTRACT_ID` | `CA...` | Auto-detected | `listen-events` |

### Offline Signing

| Variable | Example | Default | Used In |
|----------|---------|---------|---------|
| `TIKKA_SIGNED_XDR` | `BQAA...` | — | `offline-signing` |

---

## Running Examples in Different Environments

### 1. Local Development

All examples work with `MockWalletAdapter` for testing without a real wallet:

```bash
npm run example:quickstart  # No env vars needed for mock
```

### 2. Browser (with real wallet)

To use in a browser application, import and configure with a real wallet:

```typescript
import { FreighterAdapter, RaffleService } from '@tikka/sdk';

const wallet = new FreighterAdapter();
const app = await NestFactory.createApplicationContext(
  AppModule.forRoot({ network: 'testnet', wallet })
);
const raffle = app.get(RaffleService);
```

### 3. Node.js CLI

All examples run as CLI scripts with `ts-node`:

```bash
npm run example:create-raffle
npm run example:listen-events
npm run example:offline-signing
```

### 4. Air-gapped / Multisig

Use `offline-signing.ts` workflow:
1. Build XDR on online machine
2. Transfer XDR to air-gapped machine
3. Sign with hardware wallet or CLI
4. Transfer signed XDR back to online machine
5. Submit

---

## Verifying Examples Compile

```bash
npm run examples:check
```

This TypeScript compilation check verifies that all examples are syntactically correct and type-safe.

---

## Troubleshooting

### "TIKKA_PUBLIC_KEY is required"

Set your Stellar public key:
```bash
export TIKKA_PUBLIC_KEY=GBIQ4VH3TRO5A72SCCSHV5QZJVUHMFAZVD5K4PIWL3RBQFKBDLPHJ36
npm run example:buy-tickets
```

### "Raffle not found" or network errors

Check your network configuration:
```bash
# Verify testnet is accessible
TIKKA_NETWORK=testnet npm run example:listen-events
```

### Examples don't compile

Ensure the SDK itself builds:
```bash
npm run build
npm run examples:check
```

---

## Contributing

When adding new examples:

1. Create a new `.ts` file in this directory
2. Add comprehensive JSDoc comments with:
   - What the example demonstrates
   - Required and optional environment variables
   - Usage instructions
3. Include error handling and user feedback
4. Test with `npm run examples:check`
5. Update this README with a new section

---

## Next Steps

- **[Architecture Guide](../docs/ARCHITECTURE.md)** — Deep dive into SDK design
- **[API Documentation](https://crackedstudio.github.io/tikka)** — Full TypeDoc reference
- **[Stellar Docs](https://developers.stellar.org/)** — Protocol documentation
