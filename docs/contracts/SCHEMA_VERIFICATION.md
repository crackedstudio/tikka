# Contract Schema Verification Guide

> **Purpose:** Easy verification of contract data compatibility before deploy  
> **Audience:** QA engineers, contract developers, DevOps  
> **Tools:** Stellar CLI, Node.js, curl, SQL

---

## Overview

This guide provides step-by-step commands to verify that contract data schemas match expectations across the system.

Compatibility breaks happen when:
1. Contract method returns different type than SDK expects
2. Event field names don't match indexer parser expectations
3. Struct fields change type (e.g., `u32` → `i128`)
4. New required fields are added to contracts

This guide helps catch these **before** deploying.

---

## Part 1: Contract Schema Verification

### 1.1: Fetch Contract ABI

Get the contract's method signatures and return types:

```bash
# Fetch testnet contract ABI
CONTRACT_ID="CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"
stellar contract info \
  --network testnet \
  --contract-id "$CONTRACT_ID" \
  --output json > contract-abi.json

cat contract-abi.json | jq '.spec.functions[] | {name: .name, inputs: .inputs, output: .output}'
```

**Expected Output:**

```json
{
  "name": "create_raffle",
  "inputs": [
    { "name": "params", "type": "RaffleParams" }
  ],
  "output": "u32"
}
```

### 1.2: Compare ABI to SDK Bindings

Check that SDK `ContractFn` enum matches contract ABI:

```bash
cd sdk
node -e "
const { ContractFn } = require('./dist/contract/bindings');
Object.entries(ContractFn).forEach(([key, value]) => {
  console.log(\`\${key}: \${value}\`);
});
"
```

**Verify:**

- [ ] Every method in `ContractFn` exists in contract ABI
- [ ] No extra methods in `ContractFn` that were removed from contract
- [ ] Method names match exactly (case-sensitive)

### 1.3: Fetch Contract Data

Call a read-only method and inspect the response:

```bash
# Create a temporary test transaction to read contract data
SOROBAN_RPC_URL="https://soroban-testnet.stellar.org"
CONTRACT_ID="CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"

# Get all raffle IDs
stellar contract invoke \
  --network testnet \
  --contract-id "$CONTRACT_ID" \
  --function get_all_raffle_ids \
  --source YOUR_KEY \
  --output json
```

Or use the SDK directly:

```typescript
import { TikkaSDK } from '@tikka/sdk';

const sdk = new TikkaSDK({ network: 'testnet' });

// Call read-only method
const raffleIds = await sdk.contract.simulateReadOnly('get_all_raffle_ids', []);
console.log(JSON.stringify(raffleIds, null, 2));

// Get raffle data
const raffleData = await sdk.contract.simulateReadOnly('get_raffle_data', [0]);
console.log('Raffle Data:', raffleData);
console.log('Raffle Status Type:', typeof raffleData.status);
console.log('Raffle Price Type:', typeof raffleData.ticket_price);
```

**Verify:**

- [ ] Response deserializes without errors
- [ ] All expected fields present
- [ ] Field types match schema (e.g., `ticket_price` is `string`, not `number`)

---

## Part 2: Event Schema Verification

### 2.1: Capture Live Events

Use the Stellar CLI to capture actual contract events:

```bash
SOROBAN_RPC_URL="https://soroban-testnet.stellar.org"
CONTRACT_ID="CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"

# Get events from the last 100 ledgers
stellar events \
  --rpc-url "$SOROBAN_RPC_URL" \
  --contract "$CONTRACT_ID" \
  --limit 100 \
  --output json > events.json

cat events.json | jq '.[] | {type: .type, topic: .topic, value: .value}'
```

Or query via the Indexer API:

```bash
# Get stored events from indexer
curl -s 'http://localhost:3000/api/events?contractId=CDLZ...' | jq '.data[] | {type, topics, value}'
```

**Expected Events:**
- `RaffleCreated`
- `TicketPurchased`
- `DrawTriggered`
- `RandomnessRequested`
- `RandomnessReceived`
- `RaffleFinalized`

### 2.2: Compare Event Schema to Parser

Check that indexer event handlers match actual event structure:

```typescript
// Test indexer event handler against real event
import { RaffleCreatedHandler } from '@tikka-indexer/handlers/raffle-created.handler';
import { RawSorobanEvent } from '@tikka-indexer/event-parser.service';

const handler = new RaffleCreatedHandler();
const realEvent: RawSorobanEvent = {
  type: 'RaffleCreated',
  topic: ['...'],
  value: '...',
};

const parsed = handler.parse(realEvent.topic, realEvent.value, realEvent);
console.log('Parsed Event:', JSON.stringify(parsed, null, 2));

// Verify
if (!parsed) {
  console.error('FAIL: Event did not parse');
} else if (!parsed.raffle_id) {
  console.error('FAIL: Missing raffle_id field');
} else {
  console.log('PASS: Event parsed correctly');
}
```

**Verify:**
- [ ] All events in contract have corresponding handlers
- [ ] Handlers extract all expected fields
- [ ] No parsing errors or null values
- [ ] Field names match contract event definition

### 2.3: Verify Indexer Persistence

Check that parsed events are stored in the database:

```sql
-- Connect to indexer database
psql $DATABASE_URL

-- Check raffle_created events
SELECT COUNT(*) as total, 
       COUNT(raffle_id) as has_raffle_id,
       COUNT(creator) as has_creator
FROM raffle_created_events
LIMIT 5;

-- Check a specific event
SELECT * FROM raffle_created_events WHERE raffle_id = 0 LIMIT 1;

-- Verify schema matches contract
\d raffle_created_events
```

**Expected Columns:**
- `raffle_id` (integer)
- `creator` (text)
- `ticket_price` (text)
- `max_tickets` (integer)
- `end_time` (bigint)
- `created_at` (timestamp)

---

## Part 3: SDK Type Compatibility

### 3.1: Test SDK Contract Calls

Verify the SDK can call all contract methods:

```typescript
import { TikkaSDK } from '@tikka/sdk';

const sdk = new TikkaSDK({ network: 'testnet' });

async function testAllMethods() {
  try {
    // Read-only methods (should work without wallet)
    const raffleIds = await sdk.contract.simulateReadOnly('get_all_raffle_ids', []);
    console.log('✓ get_all_raffle_ids:', raffleIds);

    if (raffleIds.length > 0) {
      const raffle = await sdk.contract.simulateReadOnly('get_raffle_data', [raffleIds[0]]);
      console.log('✓ get_raffle_data:', raffle);

      // Verify type expectations
      if (typeof raffle.id === 'number') {
        console.log('  ✓ raffle.id is number');
      } else {
        console.error('  ✗ raffle.id should be number, got:', typeof raffle.id);
      }

      if (typeof raffle.ticket_price === 'string') {
        console.log('  ✓ raffle.ticket_price is string (bigint)');
      } else {
        console.error('  ✗ raffle.ticket_price should be string, got:', typeof raffle.ticket_price);
      }
    }

    const participation = await sdk.contract.simulateReadOnly('get_user_participation', [
      'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
    ]);
    console.log('✓ get_user_participation:', participation);

  } catch (err) {
    console.error('✗ SDK method call failed:', err.message);
    process.exit(1);
  }
}

testAllMethods();
```

**Verify:**
- [ ] All read-only methods callable without error
- [ ] Responses deserialize to correct types
- [ ] No "method not found" errors
- [ ] Field types match TypeScript types in SDK

### 3.2: Test SDK Fee Estimation

Verify fee estimation works with new contract:

```typescript
import { TikkaSDK } from '@tikka/sdk';

const sdk = new TikkaSDK({ network: 'testnet' });

async function testFeeEstimation() {
  try {
    const fee = await sdk.contract.estimateFee('buy_ticket', [
      0,  // raffle_id
      'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
      1,  // quantity
    ]);
    
    console.log('Estimated Fee:', fee, 'stroops');
    
    if (parseInt(fee) > 0) {
      console.log('✓ Fee estimation works');
    } else {
      console.error('✗ Fee is zero');
    }
  } catch (err) {
    console.error('✗ Fee estimation failed:', err.message);
    process.exit(1);
  }
}

testFeeEstimation();
```

**Verify:**
- [ ] Fee estimation succeeds for all methods
- [ ] Fees are reasonable (100 stroops - 1 XLM)
- [ ] No simulation errors

---

## Part 4: Backend Compatibility

### 4.1: Test Backend Contract Service

Verify backend can fetch and serve contract data:

```typescript
import { ContractService } from '@tikka-backend/contract/contract.service';

async function testBackendIntegration() {
  const contractService = new ContractService(/* deps */);
  
  try {
    // Get active raffles
    const raffles = await contractService.getActiveRaffles();
    console.log('✓ getActiveRaffles returned:', raffles.length, 'raffles');

    if (raffles.length > 0) {
      // Get raffle details
      const detail = await contractService.getRaffleData(raffles[0].id);
      console.log('✓ getRaffleData returned fields:', Object.keys(detail));

      // Verify expected fields
      if (detail.status && detail.ticket_price && detail.end_time) {
        console.log('✓ All required fields present');
      } else {
        console.error('✗ Missing required fields');
      }
    }
  } catch (err) {
    console.error('✗ Backend integration failed:', err.message);
    process.exit(1);
  }
}

testBackendIntegration();
```

**Verify:**
- [ ] Backend can fetch raffle list
- [ ] Backend can fetch raffle details
- [ ] All required fields returned
- [ ] No schema mismatches between contract and backend

### 4.2: Test API Responses

Make HTTP requests to backend and verify contract data:

```bash
# Get raffle list
curl -s 'http://localhost:3000/api/raffles' | jq '.data[0] | {id, status, ticket_price, end_time}'

# Expected output:
# {
#   "id": 0,
#   "status": "OPEN",
#   "ticket_price": "1000000",
#   "end_time": 1234567890
# }

# Get specific raffle
curl -s 'http://localhost:3000/api/raffles/0' | jq '.data | {id, status, ticket_price, max_tickets}'
```

**Verify:**
- [ ] API returns raffles without error
- [ ] Status values are valid (`OPEN`, `DRAWING`, `FINALIZED`, `CANCELLED`)
- [ ] Prices are strings (bigint)
- [ ] Timestamps are numbers

---

## Part 5: Client Compatibility

### 5.1: Test Client Contract Config

Verify client config matches contract:

```typescript
// client/src/config/contract.ts
import { CONTRACT_CONFIG } from './contract';

console.log('Contract Address:', CONTRACT_CONFIG.address);
console.log('Network:', CONTRACT_CONFIG.network);
console.log('Methods:', Object.keys(CONTRACT_CONFIG.functions));

// Verify
if (CONTRACT_CONFIG.functions.createRaffle === 'create_raffle') {
  console.log('✓ Method names match');
} else {
  console.error('✗ Method name mismatch');
}
```

**Verify:**
- [ ] Contract address is correct for network
- [ ] All expected methods are in `CONTRACT_CONFIG.functions`
- [ ] Method names match contract

### 5.2: Test Client UI Rendering

Load the frontend and verify it displays contract data:

```bash
# Start client dev server
cd client
npm run dev

# In browser, check:
# - Raffle list loads without errors
# - Raffle details display (name, price, status)
# - No console errors about missing contract data
# - Status badge displays correct state (OPEN, DRAWING, etc.)
```

**Verify:**
- [ ] No 404 for contract address
- [ ] No parsing errors in browser console
- [ ] Raffle data displays correctly
- [ ] Status states match expected enum

---

## Part 6: Oracle Integration

### 6.1: Test Oracle Event Listener

Verify oracle can listen for randomness requests:

```typescript
import { EventListener } from '@tikka-oracle/listener/event-listener';

const listener = new EventListener();

async function testOracleListener() {
  try {
    // Subscribe to RandomnessRequested events
    await listener.subscribe('RandomnessRequested');
    console.log('✓ Oracle subscribed to RandomnessRequested');

    // Simulate event arrival
    const mockEvent = {
      type: 'RandomnessRequested',
      raffleId: 0,
      requestId: 1,
    };

    const queued = listener.queueForProcessing(mockEvent);
    console.log('✓ Event queued for randomness computation');

    if (queued) {
      console.log('✓ Oracle ready to process randomness requests');
    } else {
      console.error('✗ Failed to queue event');
    }
  } catch (err) {
    console.error('✗ Oracle listener failed:', err.message);
    process.exit(1);
  }
}

testOracleListener();
```

**Verify:**
- [ ] Oracle can subscribe to randomness events
- [ ] Events are queued correctly
- [ ] No parsing errors

### 6.2: Test Oracle Randomness Submission

Verify oracle can submit randomness to contract:

```typescript
import { TxSubmitter } from '@tikka-oracle/submitter/tx-submitter';

const submitter = new TxSubmitter();

async function testOracleSubmission() {
  try {
    const tx = await submitter.buildReceiveRandomnessTx(
      raffleId,
      seed,  // BytesN<32>
      proof, // BytesN<64>
    );
    
    console.log('✓ Built receive_randomness transaction');
    console.log('  Method:', tx.operation.functionName); // Should be 'receive_randomness'
    console.log('  Args:', tx.operation.arguments);

    if (tx.operation.functionName === 'receive_randomness') {
      console.log('✓ Correct method name');
    } else {
      console.error('✗ Wrong method name:', tx.operation.functionName);
    }
  } catch (err) {
    console.error('✗ Failed to build randomness submission:', err.message);
    process.exit(1);
  }
}

testOracleSubmission();
```

**Verify:**
- [ ] Oracle can build randomness submission transaction
- [ ] Transaction calls correct method (`receive_randomness`)
- [ ] Seed and proof are passed correctly
- [ ] No schema errors

---

## Quick Checklist

Use this checklist before deploying:

```bash
# 1. Verify contract ABI
stellar contract info --network testnet --contract-id $CONTRACT_ID

# 2. Test SDK
cd sdk && npm run test

# 3. Test Indexer
cd ../indexer && npm run test

# 4. Test Oracle
cd ../oracle && npm run test

# 5. Test Backend
cd ../backend && npm run test

# 6. Test Client
cd ../client && npm run build

# 7. Smoke test contract calls
node -e "
  const { TikkaSDK } = require('@tikka/sdk');
  new TikkaSDK({ network: 'testnet' })
    .contract.simulateReadOnly('get_all_raffle_ids', [])
    .then(ids => console.log('✓ Contract works, found', ids.length, 'raffles'))
    .catch(e => { console.error('✗ Contract call failed:', e.message); process.exit(1); });
"

echo "✓ All verification steps passed!"
```

---

## Troubleshooting

| Error | Cause | Solution |
|-------|-------|----------|
| `Contract not found` | Wrong contract ID or wrong network | Verify contract is deployed and ID is correct |
| `Method not found` | Method name changed in contract | Regenerate SDK bindings, update `ContractFn` |
| `Failed to parse event` | Event field names changed | Update indexer event handlers |
| `Type mismatch in response` | Return type changed (e.g., u32 → i128) | Update SDK type definitions |
| `Database constraint violation` | New required field in event | Create database migration |
| `Oracle submission fails` | Method signature changed for `receive_randomness` | Update TxSubmitter to match new signature |

---

## Related Documents

- **[INTEGRATION_BOUNDARY.md](./INTEGRATION_BOUNDARY.md)** — Full contract interface reference
- **[CONTRACT_UPGRADE_CHECKLIST.md](./CONTRACT_UPGRADE_CHECKLIST.md)** — Complete upgrade process
- **[ARCHITECTURE.md](../ARCHITECTURE.md)** — System architecture overview
