# Ticket Module

## Overview

The Ticket module provides methods for buying tickets, refunding tickets, and querying user tickets for raffles. It supports both single and batch ticket purchases.

## Usage

### Single Purchase

```typescript
import { TicketService } from '@tikka/sdk';

// Buy tickets
const purchase = await ticketService.buy({
  raffleId: 1,
  quantity: 3,
});
console.log(purchase);
// {
//   ticketIds: [101, 102, 103],
//   txHash: '0xabc...',
//   ledger: 12345,
//   feePaid: '0.001'
// }
```

### Batch Purchase

```typescript
// Buy tickets for multiple raffles in one operation
const batchPurchase = await ticketService.buyBatch({
  purchases: [
    { raffleId: 1, quantity: 3 },
    { raffleId: 2, quantity: 5 },
    { raffleId: 3, quantity: 2 },
  ],
  memo: { type: 'text', value: 'Batch purchase' },
});

console.log(batchPurchase);
// {
//   results: [
//     { raffleId: 1, ticketIds: [101, 102, 103], success: true },
//     { raffleId: 2, ticketIds: [201, 202, 203, 204, 205], success: true },
//     { raffleId: 3, ticketIds: [], success: false, error: 'Raffle closed' }
//   ],
//   txHash: '0xabc...',
//   ledger: 12345,
//   feePaid: '0.003'
// }
```

### Other Operations

```typescript
// Refund a ticket (when raffle is cancelled)
const refund = await ticketService.refund({
  raffleId: 1,
  ticketId: 101,
});
console.log(refund);
// {
//   txHash: '0xdef...',
//   ledger: 12346
// }

// Get user's tickets for a raffle (read-only)
const tickets = await ticketService.getUserTickets({
  raffleId: 1,
  userAddress: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
});
console.log(tickets); // [101, 102, 103]
```

## API

### `buy(params: BuyTicketParams): Promise<BuyTicketResult>`

Purchases tickets for a raffle. Requires wallet signature.

**Parameters:**
- `params.raffleId` (number): The raffle ID
- `params.quantity` (number): Number of tickets to purchase
- `params.memo` (TxMemo, optional): Transaction memo for tracking

**Returns:** `BuyTicketResult`
- `ticketIds`: Array of purchased ticket IDs
- `txHash`: Transaction hash
- `ledger`: Ledger number where transaction was confirmed
- `feePaid`: Transaction fee in XLM

**Contract call:** `buy_ticket(raffle_id, buyer, quantity)`

---

### `buyBatch(params: BuyBatchParams): Promise<BuyBatchResult>`

Purchases tickets for multiple raffles. Each purchase is simulated first to check feasibility, then executed. Returns individual success/failure results for each raffle.

**Parameters:**
- `params.purchases` (BatchTicketPurchase[]): Array of purchases
  - `raffleId` (number): The raffle ID
  - `quantity` (number): Number of tickets to purchase
- `params.memo` (TxMemo, optional): Transaction memo applied to all purchases

**Returns:** `BuyBatchResult`
- `results`: Array of individual purchase results
  - `raffleId`: The raffle ID
  - `ticketIds`: Array of purchased ticket IDs (empty if failed)
  - `success`: Whether the purchase succeeded
  - `error`: Error message if failed
- `txHash`: Last successful transaction hash
- `ledger`: Last successful ledger number
- `feePaid`: Total fees paid across all purchases

**Features:**
- Pre-validates all purchases before execution
- Simulates each purchase individually to check feasibility
- Manages gas budget for large batches
- Returns individual success/failure results
- Continues processing even if some purchases fail
- Throws only if all purchases fail or validation fails

**Contract calls:** Multiple `buy_ticket(raffle_id, buyer, quantity)` calls

---

### `refund(params: RefundTicketParams): Promise<RefundTicketResult>`

Refunds a ticket when raffle is cancelled. Requires wallet signature.

**Parameters:**
- `params.raffleId` (number): The raffle ID
- `params.ticketId` (number): The ticket ID to refund
- `params.memo` (TxMemo, optional): Transaction memo for tracking

**Returns:** `RefundTicketResult`
- `txHash`: Transaction hash
- `ledger`: Ledger number where transaction was confirmed

**Contract call:** `refund_ticket(raffle_id, ticket_id)`

---

### `getUserTickets(params: GetUserTicketsParams): Promise<number[]>`

Gets all ticket IDs owned by a user for a specific raffle. Read-only (no signing required).

**Parameters:**
- `params.raffleId` (number): The raffle ID
- `params.userAddress` (string): Stellar address (G... format)

**Returns:** Array of ticket IDs

**Contract call:** `get_user_tickets(raffle_id, user_address)` (read-only)

## Batch Purchase Details

### Transaction Atomicity

The `buyBatch` method handles multiple ticket purchases with the following behavior:

1. **Pre-validation**: All purchases are validated for correct parameters
2. **Simulation**: Each purchase is simulated individually to check feasibility
3. **Execution**: Valid purchases are executed sequentially
4. **Result tracking**: Individual success/failure results are returned for each raffle

**Note**: Soroban doesn't support true atomic multi-call in a single transaction. Each purchase is executed as a separate transaction, but results are tracked together. If atomicity is critical for your use case, consider implementing application-level rollback logic.

### Gas Management

The implementation manages gas budgets by:
- Simulating each purchase before execution
- Filtering out failed simulations to avoid wasted gas
- Tracking cumulative fees across all purchases
- Providing detailed error messages for failed purchases

### Error Handling

- **Validation errors**: Thrown immediately if any purchase has invalid parameters
- **Simulation failures**: Tracked in results, execution continues for valid purchases
- **Execution failures**: Tracked in results with error messages
- **Complete failure**: Throws if all purchases fail simulation

## Implementation Status

✅ Module structure created  
✅ TypeScript types defined  
✅ Service methods implemented  
✅ Batch purchase functionality added
✅ Unit tests for all methods
⏳ ContractService transaction building needs Stellar SDK integration  
⏳ WalletAdapter integration for signing  

## Next Steps

1. Implement transaction building in ContractService
2. Add WalletAdapter for signature requests
3. Parse contract results to extract ticket IDs and fees
4. Add integration tests against Stellar testnet
5. Optimize batch purchases if contract adds native batch support

## Notes

- `buy()`, `buyBatch()`, and `refund()` require wallet connection and user approval
- `getUserTickets()` is read-only and doesn't require signing
- Ticket IDs are assigned sequentially by the contract
- Refunds are only available when raffle is cancelled
- Batch purchases execute sequentially, not atomically
- Failed purchases in a batch don't prevent other purchases from succeeding
