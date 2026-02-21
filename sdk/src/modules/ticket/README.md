# Ticket Module

## Overview

The Ticket module provides methods for buying tickets, refunding tickets, and querying user tickets for raffles.

## Usage

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

**Returns:** `BuyTicketResult`
- `ticketIds`: Array of purchased ticket IDs
- `txHash`: Transaction hash
- `ledger`: Ledger number where transaction was confirmed
- `feePaid`: Transaction fee in XLM

**Contract call:** `buy_ticket(raffle_id, buyer, quantity)`

---

### `refund(params: RefundTicketParams): Promise<RefundTicketResult>`

Refunds a ticket when raffle is cancelled. Requires wallet signature.

**Parameters:**
- `params.raffleId` (number): The raffle ID
- `params.ticketId` (number): The ticket ID to refund

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

## Implementation Status

✅ Module structure created  
✅ TypeScript types defined  
✅ Service methods implemented  
⏳ ContractService transaction building needs Stellar SDK integration  
⏳ WalletAdapter integration for signing  

## Next Steps

1. Implement transaction building in ContractService
2. Add WalletAdapter for signature requests
3. Parse contract results to extract ticket IDs and fees
4. Add unit tests for TicketService
5. Add integration tests against Stellar testnet

## Notes

- `buy()` and `refund()` require wallet connection and user approval
- `getUserTickets()` is read-only and doesn't require signing
- Ticket IDs are assigned sequentially by the contract
- Refunds are only available when raffle is cancelled
