# Batch Ticket Purchase Implementation

## Overview

Implemented `buyBatch()` method in the TicketService to allow users to purchase tickets for multiple raffles in a single operation.

## Branch

`feature/batch-ticket-purchase`

## Changes Made

### 1. Type Definitions (`sdk/src/modules/ticket/ticket.types.ts`)

Added new types to support batch purchases:

- `BatchTicketPurchase`: Represents a single purchase in a batch (raffleId + quantity)
- `BuyBatchParams`: Input parameters for batch purchase (array of purchases + optional memo)
- `BatchPurchaseResult`: Result for individual raffle purchase (success/failure with details)
- `BuyBatchResult`: Overall batch operation result with individual results and transaction info

### 2. Service Implementation (`sdk/src/modules/ticket/ticket.service.ts`)

Implemented `buyBatch()` method with the following features:

#### Validation
- Validates all purchases upfront (raffleId and quantity must be positive integers)
- Throws immediately if purchases array is empty or any purchase has invalid parameters

#### Simulation Phase
- Simulates each purchase individually using `simulateReadOnly()`
- Identifies which purchases are feasible before execution
- Tracks simulation failures separately from execution failures

#### Execution Phase
- Executes only purchases that passed simulation
- Processes purchases sequentially (Soroban limitation - no atomic multi-call)
- Continues processing even if individual purchases fail
- Tracks individual success/failure results with error messages

#### Gas Management
- Pre-filters failed simulations to avoid wasted gas
- Accumulates fees across all successful transactions
- Returns total fee paid in the result

#### Error Handling
- Returns individual success/failure for each raffle
- Throws only if all purchases fail or validation fails
- Provides detailed error messages for each failed purchase
- Handles external contract errors (e.g., token contract rejections)

### 3. Unit Tests (`sdk/src/modules/ticket/ticket.service.spec.ts`)

Added comprehensive test coverage:

- ✅ Successful batch purchase across multiple raffles
- ✅ Partial failure handling (some succeed, some fail)
- ✅ Empty purchases array validation
- ✅ Invalid purchase parameter validation
- ✅ All purchases fail simulation
- ✅ Memo propagation to individual purchases

### 4. Example (`sdk/examples/buy-tickets-batch.ts`)

Created a complete example demonstrating:

- Environment variable configuration
- Pre-purchase raffle verification
- Batch purchase execution
- Result display with success/failure breakdown
- Post-purchase ticket listing

### 5. Documentation (`sdk/src/modules/ticket/README.md`)

Updated README with:

- Usage examples for batch purchases
- Complete API documentation for `buyBatch()`
- Transaction atomicity explanation
- Gas management details
- Error handling behavior
- Implementation notes about Soroban limitations

## Key Design Decisions

### Sequential Execution vs Atomic Transactions

**Decision**: Execute purchases sequentially rather than attempting atomic multi-call.

**Rationale**: 
- Soroban doesn't support true atomic multi-call in a single transaction
- Sequential execution allows partial success (some purchases succeed even if others fail)
- Users get immediate feedback on which purchases succeeded/failed
- Application-level rollback logic can be implemented if atomicity is critical

### Individual Simulation

**Decision**: Simulate each purchase individually before execution.

**Rationale**:
- Identifies infeasible purchases early (closed raffles, insufficient tickets, etc.)
- Avoids wasting gas on purchases that will fail
- Provides better error messages for failed simulations
- Allows filtering out bad purchases before execution

### Partial Failure Handling

**Decision**: Continue processing even if some purchases fail.

**Rationale**:
- Maximizes successful purchases in a batch
- Users don't lose all purchases due to one failure
- Individual results allow users to retry only failed purchases
- Better user experience for large batches

### Gas Budget Management

**Decision**: Pre-validate and filter, accumulate fees across transactions.

**Rationale**:
- Simulation filtering reduces wasted gas
- Fee accumulation provides total cost visibility
- Users can estimate costs before execution
- Supports large batches without hitting gas limits per transaction

## API Usage

```typescript
// Basic batch purchase
const result = await ticketService.buyBatch({
  purchases: [
    { raffleId: 1, quantity: 3 },
    { raffleId: 2, quantity: 5 },
    { raffleId: 3, quantity: 2 },
  ],
});

// With memo for tracking
const result = await ticketService.buyBatch({
  purchases: [
    { raffleId: 1, quantity: 3 },
    { raffleId: 2, quantity: 5 },
  ],
  memo: { type: 'text', value: 'Batch purchase' },
});

// Check results
result.results.forEach((r) => {
  if (r.success) {
    console.log(`Raffle ${r.raffleId}: ${r.ticketIds.join(', ')}`);
  } else {
    console.log(`Raffle ${r.raffleId} failed: ${r.error}`);
  }
});
```

## Testing

Run tests with:
```bash
cd sdk
pnpm install
pnpm test ticket.service.spec.ts
```

Run example with:
```bash
TIKKA_NETWORK=testnet \
TIKKA_PUBLIC_KEY=G... \
TIKKA_RAFFLE_IDS=1,2,3 \
TIKKA_QUANTITIES=5,3,2 \
npx ts-node examples/buy-tickets-batch.ts
```

## Future Enhancements

1. **Contract-Level Batch Support**: If the Soroban contract adds native batch purchase support, update to use atomic transactions
2. **Parallel Execution**: Explore parallel transaction submission if Soroban supports it
3. **Retry Logic**: Add automatic retry for transient failures
4. **Gas Estimation**: Provide upfront gas estimation for entire batch
5. **Transaction Bundling**: Investigate transaction bundling strategies for better atomicity

## Notes

- Each purchase in a batch is a separate transaction
- Purchases are not atomic - some can succeed while others fail
- Failed simulations don't consume gas
- Failed executions do consume gas but are tracked in results
- Memo is applied to all transactions in the batch
- Total fee is accumulated across all successful transactions

## Commit

```
feat: add batch ticket purchase functionality

- Add buyBatch method to TicketService for purchasing tickets across multiple raffles
- Implement individual simulation for each purchase to check feasibility
- Handle partial failures gracefully with individual success/failure results
- Manage gas budget by pre-validating and filtering failed simulations
- Add comprehensive types: BuyBatchParams, BuyBatchResult, BatchPurchaseResult
- Add unit tests covering success, partial failure, and error cases
- Add buy-tickets-batch.ts example demonstrating batch purchase usage
- Update README with detailed documentation on batch purchase behavior
- Note: Soroban doesn't support atomic multi-call, purchases execute sequentially
```
