# Randomness Provider Interface

## Overview

The randomness provider interface provides a unified API for VRF, PRNG, and future randomness providers. This abstraction allows the oracle to support multiple randomness generation methods with a consistent interface.

## Architecture

### Core Components

1. **`IRandomnessProvider`** - Base interface all providers must implement
2. **`RandomnessProviderService`** - Factory service for provider selection and management
3. **Provider Implementations**:
   - `Ed25519Sha256VrfProvider` - Verifiable Random Function for high-stakes raffles
   - `PrngProvider` - Pseudo-random number generator for low-stakes raffles

### Provider Selection Logic

The `RandomnessProviderService` automatically selects the appropriate provider based on prize amount:

- **VRF**: Prize >= `VRF_THRESHOLD_XLM` (default: 500 XLM)
- **PRNG**: Prize < `VRF_THRESHOLD_XLM`
- **Default**: VRF (when prize amount is unknown)

## Interface Definition

```typescript
interface IRandomnessProvider {
  // Get provider metadata
  getMetadata(): RandomnessProviderMetadata;
  
  // Validate request before processing
  validateRequest(input: RandomnessRequestInput): boolean;
  
  // Generate randomness with provider metadata
  generate(input: RandomnessRequestInput): Promise<RandomnessResponse>;
  
  // Verify proof and derive seed
  verifyProof(
    publicKey: string | Buffer | null,
    requestId: string,
    proof: string,
    raffleId?: number,
  ): VerificationResult;
  
  // Verify both proof and seed
  verify(
    publicKey: string | Buffer | null,
    requestId: string,
    proof: string,
    seed: string,
    raffleId?: number,
  ): boolean;
}
```

## Usage

### Basic Usage

```typescript
import { RandomnessProviderService } from './randomness-provider.service';

// Inject the service
constructor(private readonly providerService: RandomnessProviderService) {}

// Generate randomness (provider auto-selected)
const response = await this.providerService.generate({
  requestId: 'req-123',
  raffleId: 42,
  prizeAmount: 1000, // XLM
});

console.log(response.provider); // 'vrf' or 'prng'
console.log(response.algorithm); // 'Ed25519-SHA-256' or 'SHA-256-PRNG'
console.log(response.seed); // hex string
console.log(response.proof); // hex string
console.log(response.generatedAt); // timestamp
```

### Using a Specific Provider

```typescript
import { RandomnessProviderType } from './randomness-provider.interface';

// Get a specific provider
const vrfProvider = this.providerService.getProvider(RandomnessProviderType.VRF);

// Generate using VRF explicitly
const response = await vrfProvider.generate({
  requestId: 'req-123',
  raffleId: 42,
});
```

### Verification

```typescript
// Verify proof (VRF requires public key, PRNG does not)
const verificationResult = provider.verifyProof(
  publicKey,
  requestId,
  proof,
  raffleId,
);

if (verificationResult.valid) {
  console.log('Proof is valid, seed:', verificationResult.seed);
} else {
  console.error('Verification failed:', verificationResult.error);
}

// Verify both proof and seed
const isValid = provider.verify(
  publicKey,
  requestId,
  proof,
  seed,
  raffleId,
);
```

## Adding a New Provider

To add a new randomness provider:

### 1. Add Provider Type

```typescript
// randomness-provider.interface.ts
export enum RandomnessProviderType {
  VRF = 'vrf',
  PRNG = 'prng',
  NEW_PROVIDER = 'new_provider', // Add here
}
```

### 2. Implement the Interface

```typescript
// new-provider.ts
import { Injectable } from '@nestjs/common';
import {
  IRandomnessProvider,
  RandomnessProviderType,
  RandomnessProviderMetadata,
  RandomnessRequestInput,
  RandomnessResponse,
  VerificationResult,
} from './randomness-provider.interface';

@Injectable()
export class NewProvider implements IRandomnessProvider {
  getMetadata(): RandomnessProviderMetadata {
    return {
      type: RandomnessProviderType.NEW_PROVIDER,
      algorithm: 'Your-Algorithm-Name',
      description: 'Description of your provider',
      isVerifiable: true, // or false
    };
  }

  validateRequest(input: RandomnessRequestInput): boolean {
    // Validate input parameters
    return true;
  }

  async generate(input: RandomnessRequestInput): Promise<RandomnessResponse> {
    // Generate randomness
    return {
      seed: 'generated-seed',
      proof: 'generated-proof',
      provider: RandomnessProviderType.NEW_PROVIDER,
      algorithm: 'Your-Algorithm-Name',
      generatedAt: new Date(),
    };
  }

  verifyProof(
    publicKey: string | Buffer | null,
    requestId: string,
    proof: string,
    raffleId?: number,
  ): VerificationResult {
    // Verify proof
    return { valid: true, seed: 'derived-seed' };
  }

  verify(
    publicKey: string | Buffer | null,
    requestId: string,
    proof: string,
    seed: string,
    raffleId?: number,
  ): boolean {
    // Verify proof and seed
    return true;
  }
}
```

### 3. Register the Provider

```typescript
// randomness-provider.service.ts
constructor(
  private readonly vrfProvider: Ed25519Sha256VrfProvider,
  private readonly prngProvider: PrngProvider,
  private readonly newProvider: NewProvider, // Add here
  private readonly configService: ConfigService,
) {
  this.providers = new Map([
    [RandomnessProviderType.VRF, this.vrfProvider],
    [RandomnessProviderType.PRNG, this.prngProvider],
    [RandomnessProviderType.NEW_PROVIDER, this.newProvider], // Register here
  ]);
}
```

### 4. Update Selection Logic (Optional)

If your provider should be auto-selected based on certain criteria, update the `selectProvider` method in `RandomnessProviderService`.

### 5. Add Tests

Create comprehensive tests for your provider:

```typescript
// new-provider.spec.ts
describe('NewProvider', () => {
  let provider: NewProvider;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [NewProvider],
    }).compile();

    provider = module.get<NewProvider>(NewProvider);
  });

  it('should generate randomness', async () => {
    const result = await provider.generate({
      requestId: 'test',
      raffleId: 1,
    });

    expect(result.seed).toBeDefined();
    expect(result.proof).toBeDefined();
    expect(result.provider).toBe(RandomnessProviderType.NEW_PROVIDER);
  });

  // Add more tests...
});
```

## Provider Metadata

Each provider exposes metadata describing its capabilities:

```typescript
interface RandomnessProviderMetadata {
  type: RandomnessProviderType;      // Provider identifier
  algorithm: string;                  // Algorithm name
  description: string;                // Human-readable description
  isVerifiable: boolean;              // Whether proofs are cryptographically verifiable
}
```

### Example Metadata

**VRF Provider:**
```json
{
  "type": "vrf",
  "algorithm": "Ed25519-SHA-256",
  "description": "Ed25519-SHA-256 Verifiable Random Function",
  "isVerifiable": true
}
```

**PRNG Provider:**
```json
{
  "type": "prng",
  "algorithm": "SHA-256-PRNG",
  "description": "Deterministic pseudo-random number generator for low-stakes raffles",
  "isVerifiable": false
}
```

## Response Format

All providers return a `RandomnessResponse` with consistent structure:

```typescript
interface RandomnessResponse {
  seed: string;              // 32-byte seed as hex (64 chars)
  proof: string;             // 64-byte proof as hex (128 chars)
  provider: RandomnessProviderType;  // Provider that generated this
  algorithm: string;         // Algorithm used
  generatedAt: Date;         // Generation timestamp
}
```

## Verification

### VRF Verification

VRF proofs are cryptographically verifiable using the oracle's public key:

```typescript
const result = vrfProvider.verifyProof(
  publicKey,  // Required for VRF
  requestId,
  proof,
  raffleId,
);
```

### PRNG Verification

PRNG outputs are deterministic and don't require a public key:

```typescript
const result = prngProvider.verifyProof(
  null,       // Public key not needed
  requestId,
  proof,
  raffleId,
);
```

## Testing

Run the test suite:

```bash
cd oracle
npm run test -- randomness
```

Run specific provider tests:

```bash
npm run test -- ed25519-sha256.vrf-provider.spec
npm run test -- prng.provider.spec
npm run test -- randomness-provider.service.spec
```

## Migration from Legacy Services

The new provider interface is backward compatible with existing `VrfService` and `PrngService`:

### Before (Legacy)
```typescript
const randomness = await this.vrfService.compute(requestId, raffleId);
```

### After (New Interface)
```typescript
const response = await this.providerService.generate({
  requestId,
  raffleId,
  prizeAmount,
});
```

Both approaches work, but the new interface provides:
- Provider metadata in responses
- Unified API across all providers
- Easier testing and mocking
- Better extensibility for future providers

## Configuration

Configure the VRF threshold via environment variable:

```bash
VRF_THRESHOLD_XLM=500  # Default: 500 XLM
```

Raffles with prizes >= this threshold use VRF, others use PRNG.

## Best Practices

1. **Always provide prizeAmount** when generating randomness to ensure correct provider selection
2. **Use the provider service** instead of calling providers directly for automatic selection
3. **Check provider metadata** in responses for audit trails
4. **Validate requests** before generation to catch errors early
5. **Test both success and failure paths** for each provider
6. **Document provider-specific requirements** (e.g., VRF needs public key for verification)

## Troubleshooting

### Provider Not Found Error

```
Error: Provider not found: unknown
```

**Solution**: Ensure the provider is registered in `RandomnessProviderService` constructor.

### Invalid Request Error

```
Error: Invalid randomness request input
```

**Solution**: Check that `requestId` is a non-empty string and `raffleId` (if provided) is a non-negative integer.

### Verification Failed

**VRF**: Ensure you're using the correct public key that matches the private key used for generation.

**PRNG**: Ensure the `requestId` and `raffleId` match exactly what was used during generation.

## See Also

- [VRF Service Documentation](./vrf.service.ts)
- [PRNG Service Documentation](./prng.service.ts)
- [Randomness Audit Types](../audit/randomness-audit.types.ts)
- [Queue Types](../queue/queue.types.ts)
