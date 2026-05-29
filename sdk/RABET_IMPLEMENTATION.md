# Rabet Wallet Adapter Implementation

## Overview

This document describes the implementation of the RabetAdapter for the Tikka SDK, enabling integration with the Rabet Stellar wallet extension.

## What is Rabet?

Rabet is a lightweight, open-source browser extension wallet for the Stellar network. It provides users with a simple and secure way to manage their Stellar assets and interact with decentralized applications (dApps).

**Key Features:**
- Lightweight browser extension
- Open-source and community-driven
- Simple and intuitive interface
- Supports transaction signing
- Network switching support

**Official Links:**
- Website: https://rabet.io
- Documentation: https://docs.rabet.io
- GitHub: https://github.com/rabetofficial/rabet-extension

## Implementation Details

### Files Created/Modified

1. **sdk/src/wallet/rabet.adapter.ts** - Main adapter implementation
2. **sdk/src/wallet/rabet.adapter.spec.ts** - Comprehensive test suite
3. **sdk/src/wallet/wallet.interface.ts** - Added `Rabet` to `WalletName` enum
4. **sdk/src/wallet/index.ts** - Exported `RabetAdapter`
5. **sdk/README.md** - Added Rabet documentation and examples
6. **sdk/examples/rabet-wallet.ts** - Complete working example

### API Integration

The RabetAdapter integrates with Rabet's browser extension API through the global `window.rabet` object:

#### Connection & Public Key
```typescript
interface ConnectResult {
  publicKey: string;
  error?: string;
}

rabet.connect(): Promise<ConnectResult>
```

#### Transaction Signing
```typescript
interface SignResult {
  xdr: string;
  error: string;
}

rabet.sign(xdr: string, network: string): Promise<SignResult>
```

### Implementation Highlights

#### 1. Availability Check
```typescript
isAvailable(): boolean {
  return typeof globalThis !== 'undefined' && 
         typeof (globalThis as any).rabet !== 'undefined';
}
```

#### 2. Get Public Key
```typescript
async getPublicKey(): Promise<string> {
  const rabet = this.getRabetApi();
  const result = await rabet.connect();
  
  if (result.error) {
    throw new Error(result.error);
  }
  
  return result.publicKey;
}
```

#### 3. Sign Transaction
```typescript
async signTransaction(
  xdr: string,
  opts?: { networkPassphrase?: string; accountToSign?: string }
): Promise<SignTransactionResult> {
  const networkPassphrase = opts?.networkPassphrase ?? this.options.networkPassphrase;
  
  if (!networkPassphrase) {
    throw new TikkaSdkError(
      TikkaSdkErrorCode.InvalidParams,
      'Network passphrase is required for Rabet transaction signing'
    );
  }
  
  const rabet = this.getRabetApi();
  const result = await rabet.sign(xdr, networkPassphrase);
  
  if (result.error) {
    throw new Error(result.error);
  }
  
  return { signedXdr: result.xdr };
}
```

### Error Handling

The adapter properly maps Rabet errors to SDK error codes:

- **UserRejected**: User cancelled or declined the request
- **WalletNotInstalled**: Rabet extension not detected
- **InvalidParams**: Missing required parameters (e.g., network passphrase)
- **Unknown**: Other unexpected errors

Error detection patterns:
```typescript
private isUserRejection(err: any): boolean {
  const msg = String(err?.message ?? err).toLowerCase();
  return (
    msg.includes('user declined') ||
    msg.includes('user rejected') ||
    msg.includes('rejected') ||
    msg.includes('cancelled') ||
    msg.includes('denied')
  );
}
```

## Network Compatibility

Rabet supports all Stellar networks:
- **Testnet**: `Networks.TESTNET`
- **Mainnet**: `Networks.PUBLIC`
- **Custom networks**: Any valid network passphrase

The network passphrase must be provided either:
1. During adapter initialization: `new RabetAdapter({ networkPassphrase })`
2. When signing transactions: `adapter.signTransaction(xdr, { networkPassphrase })`

## Limitations

1. **Message Signing**: Rabet does not support arbitrary message signing (used for SIWS authentication flows). The `signMessage()` method will throw an error.

2. **Network Detection**: Rabet doesn't expose a method to detect the user's currently selected network. The adapter returns the configured network from options.

3. **Account Selection**: Unlike some wallets, Rabet doesn't support the `accountToSign` parameter. The active account in the extension will be used.

## Testing

The implementation includes comprehensive tests covering:

- ✅ Wallet name and availability checks
- ✅ Public key retrieval (success and error cases)
- ✅ Transaction signing (success and error cases)
- ✅ Network passphrase handling
- ✅ Error mapping (UserRejected, WalletNotInstalled, etc.)
- ✅ Interface consistency with other adapters
- ✅ Rabet-specific behavior (error field handling)

Run tests:
```bash
npm test -- rabet.adapter.spec.ts
```

## Usage Examples

### Basic Usage

```typescript
import { RabetAdapter } from '@tikka/sdk';
import { Networks } from '@stellar/stellar-sdk';

const adapter = new RabetAdapter({
  networkPassphrase: Networks.TESTNET
});

if (adapter.isAvailable()) {
  const publicKey = await adapter.getPublicKey();
  const { signedXdr } = await adapter.signTransaction(xdr);
}
```

### With Error Handling

```typescript
import { TikkaSdkError, TikkaSdkErrorCode } from '@tikka/sdk';

try {
  const publicKey = await adapter.getPublicKey();
} catch (err) {
  if (err instanceof TikkaSdkError) {
    switch (err.code) {
      case TikkaSdkErrorCode.UserRejected:
        console.log('User cancelled');
        break;
      case TikkaSdkErrorCode.WalletNotInstalled:
        console.log('Install Rabet from https://rabet.io');
        break;
    }
  }
}
```

### Complete Example

See `sdk/examples/rabet-wallet.ts` for a full working example that:
- Connects to Rabet
- Retrieves the user's public key
- Verifies raffle status
- Purchases tickets
- Verifies the purchase

## Integration Checklist

- ✅ Researched Rabet's API documentation
- ✅ Implemented `RabetAdapter` class
- ✅ Added comprehensive test suite
- ✅ Updated `WalletName` enum
- ✅ Exported adapter from index
- ✅ Checked network compatibility
- ✅ Added to supported wallets list in README
- ✅ Created usage examples
- ✅ Documented limitations
- ✅ Verified TypeScript compilation

## References

- [Rabet Official Website](https://rabet.io)
- [Rabet API Documentation](https://docs.rabet.io/api)
- [Rabet GitHub Repository](https://github.com/rabetofficial/rabet-extension)
- [Stellar Networks Documentation](https://developers.stellar.org/docs/learn/fundamentals/networks)

## Future Enhancements

Potential improvements for future versions:

1. **Event Listeners**: Implement support for Rabet's `accountChanged` and `networkChanged` events
2. **Network Detection**: Request Rabet team to expose current network via API
3. **Message Signing**: If Rabet adds message signing support, implement it in the adapter
4. **Multi-account Support**: If Rabet adds account selection, implement `accountToSign` parameter

## Conclusion

The RabetAdapter successfully integrates Rabet wallet into the Tikka SDK, following the same patterns as existing wallet adapters (Freighter, xBull, Albedo, LOBSTR). The implementation is fully tested, documented, and ready for use.
