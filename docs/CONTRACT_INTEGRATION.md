# Contract Integration Guide

This document explains how to use the contract service layer to interact with the Soroban raffle smart contract.

## Overview

The contract service layer provides a clean interface for interacting with the raffle smart contract, including:

- **Configuration**: Contract address and network settings
- **Read Operations**: Fetching raffle data, active raffles, user participation
- **Write Operations**: Creating raffles, buying tickets
- **Error Handling**: User-friendly error messages and proper error types
- **React Integration**: Custom hooks for state management

## Quick Start

### 1. Environment Setup

First, configure your environment variables in `.env`:

```bash
# Contract Configuration
VITE_RAFFLE_CONTRACT_ADDRESS=CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM
VITE_CONTRACT_DEPLOYMENT_HASH=abc123...

# Network Configuration  
VITE_STELLAR_NETWORK=testnet
VITE_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
```

### 2. Basic Usage in React Components

```tsx
import { useContract } from '../hooks/useContract';

function RaffleComponent() {
    const {
        getRaffleData,
        getActiveRaffleIds,
        createRaffle,
        buyTicket,
        isLoading,
        error,
        isConfigured
    } = useContract();

    // Check if contract is configured
    if (!isConfigured) {
        return <div>Contract not configured. Please deploy contract first.</div>;
    }

    // Fetch active raffles
    const loadActiveRaffles = async () => {
        const activeIds = await getActiveRaffleIds();
        console.log('Active raffles:', activeIds);
    };

    // Create a new raffle
    const handleCreateRaffle = async () => {
        const params = {
            metadataId: "supabase-record-id",
            ticketPrice: "1000000", // 1 XLM in stroops
            totalTickets: 100,
            durationInSeconds: 86400 // 24 hours
        };
        
        const txHash = await createRaffle(params);
        if (txHash) {
            console.log('Raffle created! Transaction:', txHash);
        }
    };

    return (
        <div>
            {isLoading && <div>Loading...</div>}
            {error && <div>Error: {error}</div>}
            
            <button onClick={loadActiveRaffles}>
                Load Active Raffles
            </button>
            
            <button onClick={handleCreateRaffle}>
                Create Raffle
            </button>
        </div>
    );
}
```

## API Reference

### ContractService

The main service class for contract interactions.

#### Read Functions

```typescript
// Get raffle data by ID
const result = await ContractService.getRaffleData(raffleId);
if (result.success) {
    console.log('Raffle data:', result.data);
}

// Get active raffle IDs
const activeResult = await ContractService.getActiveRaffleIds();
if (activeResult.success) {
    console.log('Active raffles:', activeResult.data);
}

// Get user participation
const participation = await ContractService.getUserParticipation(userAddress, raffleId);
if (participation.success && participation.data) {
    console.log('User has', participation.data.ticketsPurchased, 'tickets');
}
```

#### Write Functions

```typescript
// Create a raffle
const createParams = {
    metadataId: "metadata-record-id",
    ticketPrice: "1000000", // 1 XLM in stroops
    totalTickets: 100,
    durationInSeconds: 86400
};

const createResult = await ContractService.createRaffle(createParams);
if (createResult.success) {
    console.log('Transaction hash:', createResult.transactionHash);
}

// Buy tickets
const buyParams = {
    raffleId: 1,
    ticketCount: 5,
    maxPricePerTicket: "1000000" // Slippage protection
};

const buyResult = await ContractService.buyTicket(buyParams);
if (buyResult.success) {
    console.log('Tickets purchased! TX:', buyResult.transactionHash);
}
```

### useContract Hook

React hook for contract interactions with state management.

```typescript
const {
    // State
    isLoading,
    error,
    isConfigured,
    
    // Read functions
    getRaffleData,
    getActiveRaffleIds,
    getAllRaffleIds,
    getUserParticipation,
    
    // Write functions
    createRaffle,
    buyTicket,
    
    // Transaction status
    transactionStatus,
    clearTransactionStatus,
    
    // Utilities
    refresh,
    clearError
} = useContract();
```

### useRaffles Hook

Hook for efficiently fetching multiple raffles:

```typescript
const { raffles, isLoading, error, refresh } = useRaffles([1, 2, 3, 4]);

// raffles will contain ContractRaffleData[] for the specified IDs
```

## Error Handling

The contract service provides comprehensive error handling with user-friendly messages:

```typescript
const result = await ContractService.getRaffleData(999);
if (!result.success) {
    switch (result.error) {
        case "Network connection failed":
            // Handle network error
            break;
        case "Raffle not found or has been removed":
            // Handle not found error
            break;
        case "Wallet operation failed":
            // Handle wallet error
            break;
        default:
            // Handle unknown error
    }
}
```

### Error Types

- `NETWORK_ERROR`: Connection or RPC issues
- `CONTRACT_ERROR`: Smart contract execution errors
- `WALLET_ERROR`: Wallet connection or signing issues
- `VALIDATION_ERROR`: Invalid parameters
- `INSUFFICIENT_FUNDS`: Not enough balance
- `RAFFLE_NOT_FOUND`: Raffle doesn't exist
- `RAFFLE_ENDED`: Raffle has ended
- `RAFFLE_FULL`: All tickets sold
- `UNAUTHORIZED`: Permission denied
- `UNKNOWN_ERROR`: Unexpected errors

## Transaction Status Tracking

Monitor transaction status with the `useContract` hook:

```typescript
const { transactionStatus, clearTransactionStatus } = useContract();

useEffect(() => {
    if (transactionStatus) {
        switch (transactionStatus.status) {
            case "pending":
                console.log("Transaction pending...");
                break;
            case "success":
                console.log("Transaction successful:", transactionStatus.hash);
                break;
            case "failed":
                console.log("Transaction failed:", transactionStatus.error?.message);
                break;
        }
    }
}, [transactionStatus]);
```

## Configuration

### Contract Constants

The service includes validation constants:

```typescript
CONTRACT_CONFIG.constants = {
    minTicketPrice: 1000000,    // 0.1 XLM minimum
    maxTickets: 10000,          // Maximum tickets per raffle
    minDuration: 3600,          // 1 hour minimum
    maxDuration: 2592000,       // 30 days maximum
}
```

### Network Configuration

Automatically configured based on environment:

```typescript
CONTRACT_CONFIG = {
    address: "CAAAA...",                    // From VITE_RAFFLE_CONTRACT_ADDRESS
    network: "testnet",                     // From VITE_STELLAR_NETWORK
    networkPassphrase: "Test SDF...",       // Auto-selected
    rpcUrl: "https://soroban-testnet...",   // From VITE_SOROBAN_RPC_URL
}
```

## Integration with Existing Services

### Metadata Service Integration

```typescript
// 1. Upload metadata to Supabase
const metadataId = await MetadataService.uploadRaffleMetadata({
    title: "Amazing Prize Raffle",
    description: "Win an amazing prize!",
    // ... other metadata
});

// 2. Create raffle with metadata ID
const txHash = await createRaffle({
    metadataId,
    ticketPrice: "1000000",
    totalTickets: 100,
    durationInSeconds: 86400
});

// 3. Link contract raffle ID to metadata (after transaction confirms)
await MetadataService.linkToContract(metadataId, contractRaffleId);
```

### Wallet Service Integration

The contract service automatically uses the connected wallet:

```typescript
// Wallet must be connected before contract operations
const { isConnected } = useWalletContext();

if (isConnected) {
    // Contract operations will use the connected wallet
    const result = await createRaffle(params);
}
```

## Testing

### Mock Contract for Development

When `VITE_RAFFLE_CONTRACT_ADDRESS` is not set, the service will warn but not crash:

```typescript
if (!ContractService.isConfigured()) {
    console.log("Contract not configured - using demo data");
    // Fall back to demo data or mock responses
}
```

### Error Simulation

Test error handling by providing invalid parameters:

```typescript
// This will trigger validation error
const result = await ContractService.createRaffle({
    metadataId: "",  // Invalid: empty string
    ticketPrice: "100",  // Invalid: below minimum
    totalTickets: 50000,  // Invalid: above maximum
    durationInSeconds: 60  // Invalid: below minimum
});

console.log(result.error); // "Metadata ID is required"
```

## Best Practices

1. **Always check `isConfigured()`** before using contract functions
2. **Handle errors gracefully** with user-friendly messages
3. **Use loading states** to provide feedback during operations
4. **Validate parameters** before calling contract functions
5. **Monitor transaction status** for write operations
6. **Clear errors** after user actions to reset state
7. **Use the React hooks** instead of calling service directly in components

## Troubleshooting

### Common Issues

1. **"Contract address not configured"**
   - Set `VITE_RAFFLE_CONTRACT_ADDRESS` in your `.env` file
   - Deploy the contract first if not done

2. **"Network connection failed"**
   - Check `VITE_SOROBAN_RPC_URL` is correct
   - Verify network connectivity
   - Try a different RPC endpoint

3. **"Wallet not connected"**
   - Ensure wallet is connected before contract operations
   - Check wallet provider is installed

4. **"Simulation failed"**
   - Check contract parameters are valid
   - Ensure contract is deployed to the correct network
   - Verify contract address is correct

5. **"Insufficient funds"**
   - Check wallet has enough XLM for transaction fees
   - For ticket purchases, ensure enough balance for tickets + fees