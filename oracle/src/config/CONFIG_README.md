# Oracle Configuration System

A type-safe, validated configuration system for the Tikka Oracle service.

## Features

- ✅ **Type-safe**: Full TypeScript support with inferred types
- ✅ **Validated**: Zod schema validation with actionable error messages
- ✅ **Fail-fast**: Startup fails immediately with clear errors for invalid config
- ✅ **Centralized**: Single source of truth for all configuration
- ✅ **Documented**: Comprehensive documentation for all environment variables
- ✅ **Tested**: Full test coverage for validation logic

## Quick Start

### 1. Import the Configuration Module

```typescript
import { OracleConfigModule } from './config';

@Module({
  imports: [
    OracleConfigModule.forRoot(),
    // ... other modules
  ],
})
export class AppModule {}
```

### 2. Inject the Configuration Service

```typescript
import { OracleConfigService } from './config';

@Injectable()
export class MyService {
  constructor(private readonly config: OracleConfigService) {
    const stellar = this.config.getStellar();
    console.log(`Contract ID: ${stellar.raffleContractId}`);
  }
}
```

### 3. Access Configuration

```typescript
// Get specific configuration sections
const stellar = this.config.getStellar();
const keyProvider = this.config.getKeyProvider();
const queue = this.config.getQueue();
const vrf = this.config.getVrf();

// Or get the complete config
const fullConfig = this.config.getConfig();
```

## Configuration Sections

The configuration is organized into logical sections:

| Section | Method | Description |
|---------|--------|-------------|
| Server | `getServer()` | HTTP server settings |
| Stellar | `getStellar()` | Horizon, Soroban RPC, contract IDs |
| Key Provider | `getKeyProvider()` | Key management (env, AWS KMS, GCP KMS) |
| Queue | `getQueue()` | Redis and Bull queue settings |
| VRF | `getVrf()` | VRF threshold configuration |
| Circuit Breaker | `getCircuitBreaker()` | Horizon SSE circuit breaker |
| Priority Queue | `getPriorityQueue()` | Priority tier thresholds |
| Fee | `getFee()` | Transaction fee limits |
| TX Submission | `getTxSubmission()` | Transaction retry settings |
| Multi-Oracle | `getMultiOracle()` | Multi-oracle coordination |
| Supabase | `getSupabase()` | Audit logging database |
| Alerting | `getAlerting()` | PagerDuty/Opsgenie alerts |
| Heartbeat | `getHeartbeat()` | Health check intervals |
| Event Listener | `getEventListener()` | Event streaming settings |
| Logging | `getLogging()` | Winston logger configuration |

## Type Safety

All configuration is fully typed:

```typescript
import { StellarNetworkConfig, KeyProviderConfig } from './config';

const stellar: StellarNetworkConfig = this.config.getStellar();
const keyProvider: KeyProviderConfig = this.config.getKeyProvider();

// TypeScript knows the exact shape of each config section
if (keyProvider.type === 'aws-kms') {
  console.log(keyProvider.awsRegion); // ✅ Type-safe
  console.log(keyProvider.privateKey); // ❌ TypeScript error
}
```

## Validation

The configuration system validates:

1. **Required fields**: Ensures critical settings are present
2. **Type correctness**: Validates integers, floats, URLs, enums
3. **Constraints**: Enforces relationships between values
4. **Provider-specific requirements**: Validates credentials for selected providers

### Example Validation Errors

```bash
# Missing required field
Error: Invalid configuration: Required at "stellar.raffleContractId"

# Invalid URL
Error: Invalid configuration: Invalid url at "stellar.horizo