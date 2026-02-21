# User Participation Module

## Overview

The User module exposes read-only participation data from the Soroban contract via the `getParticipation` method. This allows querying user raffle history without requiring wallet signatures.

## Usage

```typescript
import { UserService } from '@tikka/sdk';

// Inject UserService via NestJS DI
const participation = await userService.getParticipation({
  address: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'
});

console.log(participation);
// {
//   address: 'GXXX...',
//   totalRafflesEntered: 5,
//   totalTicketsBought: 12,
//   totalRafflesWon: 1,
//   raffleIds: [1, 3, 7, 9, 15]
// }
```

## API

### `getParticipation(params: GetParticipationParams): Promise<UserParticipation>`

Retrieves user participation summary from the contract's `get_user_participation` function.

**Parameters:**
- `params.address` (string): Stellar address (G... format)

**Returns:** `UserParticipation`
- `address`: User's Stellar address
- `totalRafflesEntered`: Number of unique raffles participated in
- `totalTicketsBought`: Total tickets purchased across all raffles
- `totalRafflesWon`: Number of raffles won
- `raffleIds`: Array of raffle IDs the user has entered

**Notes:**
- Read-only operation (no signing required)
- Uses Soroban RPC simulation
- For detailed historical data (timestamps, transaction hashes, prize amounts), use the backend/indexer API

## Implementation Status

✅ Module structure created  
✅ TypeScript types defined  
✅ Service method implemented  
⏳ ContractService.simulateReadOnly needs Stellar SDK integration  

## Next Steps

1. Implement `ContractService.simulateReadOnly` with Stellar SDK
2. Add contract address configuration per network (testnet/mainnet)
3. Add unit tests for UserService
4. Add integration tests against Stellar testnet
